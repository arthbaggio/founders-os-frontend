// A conversa de verdade de cada agente, lida do banco do próprio OpenBot.
//
// A API local do OpenBot manda mensagens, mas não lista a conversa. O OpenBot guarda
// tudo num SQLite na pasta de dados do servidor (openbot.db): o que a pessoa escreveu
// (aqui ou no OpenBot), os passos que o agente narra enquanto trabalha, a resposta e
// os eventos (instruções atualizadas, skills instaladas, rotinas criadas). O app lê esse
// banco SÓ PARA LEITURA, com o `node:sqlite` do Node (22.5 ou mais novo). Sem ele, ou
// se o formato do banco mudar, quem chama cai no histórico guardado pelo app.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { serverDataDir } from "./openbot";

export type HistoryItem = {
  id: string;
  // voce: a pessoa · agente: a resposta · passo: o que o agente narra enquanto trabalha ·
  // evento: o que mudou no agente · papel: as instruções de papel enviadas na montagem.
  kind: "voce" | "agente" | "passo" | "evento" | "papel";
  text: string;
  at: string;
  turn: string | null;
  // Detalhe de um evento (as instruções novas, por exemplo).
  detail?: string;
};
export type History = { items: HistoryItem[]; working: boolean; turnStarted: string | null };

let sqlite: any = undefined;
function driver() {
  if (sqlite !== undefined) return sqlite;
  try {
    sqlite = createRequire(import.meta.url)("node:sqlite");
  } catch {
    sqlite = null;
  }
  return sqlite;
}

export const historyAvailable = () => Boolean(driver()) && existsSync(join(serverDataDir(), "openbot.db"));

function open() {
  const lib = driver();
  const file = join(serverDataDir(), "openbot.db");
  if (!lib || !existsSync(file)) return null;
  try {
    return new lib.DatabaseSync(file, { readOnly: true });
  } catch {
    return null;
  }
}

const SETUP = /^Você é o agente\b/;

function toItem(row: { message_id: string; author: string; item_type: string | null; created_at: string; turn_id: string | null; message_json: string }): HistoryItem | null {
  let message: any = {};
  try {
    message = JSON.parse(row.message_json);
  } catch {
    return null;
  }
  const text = typeof message.text === "string" ? message.text : "";
  const base = { id: row.message_id, at: row.created_at, turn: row.turn_id };
  const type = row.item_type ?? "";
  if (row.author === "user") {
    // A mensagem de boas-vindas do OpenBot é escondida da pessoa no próprio app dele.
    if (type === "agent_welcome") return null;
    return { ...base, kind: SETUP.test(text) ? "papel" : "voce", text };
  }
  if (row.author === "assistant") {
    if (type === "commentary") return text.trim() ? { ...base, kind: "passo", text } : null;
    if (type === "question_prompt") return { ...base, kind: "agente", text: text.replace(/^Question:\s*/, "") };
    return text.trim() ? { ...base, kind: "agente", text } : null;
  }
  if (row.author === "system") {
    if (type === "instructions-change") return { ...base, kind: "evento", text: "Atualizou as próprias instruções", detail: message.instructionsChange?.after ?? "" };
    if (type.startsWith("skill-event:installed")) return { ...base, kind: "evento", text: "Skill instalada: " + text };
    if (type.startsWith("routine-event:created")) return { ...base, kind: "evento", text: "Rotina criada: " + text };
    if (text.trim()) return { ...base, kind: "evento", text };
  }
  return null;
}

// A conversa principal do agente: as últimas `limit` mensagens, em ordem.
export function readHistory(agentId: string, limit = 300): History | null {
  const db = open();
  if (!db) return null;
  try {
    const agent = db.prepare("select thread_id from projection_agents where agent_id = ?").get(agentId) as { thread_id: string | null } | undefined;
    if (!agent?.thread_id) return { items: [], working: false, turnStarted: null };
    const thread = db.prepare("select active_turn_id from projection_threads where thread_id = ?").get(agent.thread_id) as { active_turn_id: string | null } | undefined;
    const rows = db
      .prepare("select message_id, author, item_type, created_at, turn_id, message_json from projection_thread_messages where thread_id = ? order by ordinal desc limit ?")
      .all(agent.thread_id, limit) as any[];
    const items = rows.reverse().map(toItem).filter((one): one is HistoryItem => Boolean(one));
    let turnStarted: string | null = null;
    if (thread?.active_turn_id) {
      const turn = db.prepare("select started_at from projection_turns where turn_id = ?").get(thread.active_turn_id) as { started_at: string } | undefined;
      turnStarted = turn?.started_at ?? null;
    }
    return { items, working: Boolean(thread?.active_turn_id), turnStarted };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
  }
}

// O mascote de cada agente no OpenBot: o seed e a cor escolhida (hue), guardados no
// próprio agente. O front desenha o mesmo mascote com o Bloub (MIT), a biblioteca que o
// OpenBot usa. Sem seed, o OpenBot usa o id do agente.
export function readAvatars(): Record<string, { seed: string; hue: number | null }> {
  const db = open();
  if (!db) return {};
  try {
    const rows = db.prepare("select agent_id, agent_json from projection_agents").all() as { agent_id: string; agent_json: string }[];
    const out: Record<string, { seed: string; hue: number | null }> = {};
    for (const row of rows) {
      try {
        const agent = JSON.parse(row.agent_json);
        out[row.agent_id] = { seed: typeof agent.avatarSeed === "string" && agent.avatarSeed ? agent.avatarSeed : row.agent_id, hue: typeof agent.avatarHue === "number" ? agent.avatarHue : null };
      } catch {
        out[row.agent_id] = { seed: row.agent_id, hue: null };
      }
    }
    return out;
  } catch {
    return {};
  } finally {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
  }
}

// O Mission Control: o estado do time inteiro numa leitura só do banco do OpenBot.
// Para cada agente: se está trabalhando, o último passo narrado, a última resposta,
// turnos que não terminaram nos últimos 7 dias e as rotinas (próxima execução e a
// última, com o status). E a atividade recente de todos, mais nova primeiro.
export type MissionAgent = {
  working: boolean;
  turnStarted: string | null;
  step: string | null;
  answer: { text: string; at: string } | null;
  broken: number;
  routines: { name: string; active: boolean; schedule: any; next: string | null; last: { status: string; at: string; error: string | null } | null }[];
};
export type Mission = { agents: Record<string, MissionAgent>; activity: { agentId: string; text: string; at: string }[] };

const textOf = (json: string) => {
  try {
    const message = JSON.parse(json);
    return typeof message.text === "string" ? message.text : "";
  } catch {
    return "";
  }
};

export function readMission(agentIds: string[]): Mission | null {
  const db = open();
  if (!db) return null;
  try {
    const agents: Record<string, MissionAgent> = {};
    const activity: Mission["activity"] = [];
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    for (const agentId of agentIds) {
      const row = db.prepare("select thread_id from projection_agents where agent_id = ?").get(agentId) as { thread_id: string | null } | undefined;
      const thread = row?.thread_id ?? null;
      const state = thread ? (db.prepare("select active_turn_id from projection_threads where thread_id = ?").get(thread) as { active_turn_id: string | null } | undefined) : undefined;
      const active = state?.active_turn_id ?? null;
      const turnStarted = active ? ((db.prepare("select started_at from projection_turns where turn_id = ?").get(active) as { started_at: string } | undefined)?.started_at ?? null) : null;
      const step = active
        ? (db.prepare("select message_json from projection_thread_messages where thread_id = ? and turn_id = ? and item_type = 'commentary' order by ordinal desc limit 1").get(thread, active) as { message_json: string } | undefined)
        : undefined;
      const answers = thread
        ? (db.prepare("select message_json, created_at from projection_thread_messages where thread_id = ? and author = 'assistant' and item_type = 'agentMessage' order by ordinal desc limit 3").all(thread) as { message_json: string; created_at: string }[])
        : [];
      for (const one of answers) {
        const text = textOf(one.message_json);
        if (text.trim()) activity.push({ agentId, text, at: one.created_at });
      }
      const broken = thread
        ? ((db.prepare("select count(*) n from projection_turns where thread_id = ? and status in ('interrupted', 'failed') and started_at >= ?").get(thread, week) as { n: number }).n ?? 0)
        : 0;
      const routines = (
        db
          .prepare(
            "select r.routine_id, r.name, r.active, t.schedule_json, t.next_run_at from projection_agent_routines r left join projection_routine_triggers t on t.routine_id = r.routine_id where r.agent_id = ? order by r.name",
          )
          .all(agentId) as { routine_id: string; name: string; active: number; schedule_json: string | null; next_run_at: string | null }[]
      ).map((one) => {
        const last = db
          .prepare("select status, scheduled_for, error from projection_routine_runs where routine_id = ? order by scheduled_for desc limit 1")
          .get(one.routine_id) as { status: string; scheduled_for: string; error: string | null } | undefined;
        let schedule: any = null;
        try {
          schedule = one.schedule_json ? JSON.parse(one.schedule_json) : null;
        } catch {
          schedule = null;
        }
        return { name: one.name, active: one.active === 1, schedule, next: one.next_run_at, last: last ? { status: last.status, at: last.scheduled_for, error: last.error } : null };
      });
      agents[agentId] = {
        working: Boolean(active),
        turnStarted,
        step: step ? textOf(step.message_json) || null : null,
        answer: answers.length ? { text: textOf(answers[0].message_json), at: answers[0].created_at } : null,
        broken,
        routines,
      };
    }
    activity.sort((a, b) => b.at.localeCompare(a.at));
    return { agents, activity: activity.slice(0, 12) };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
  }
}
