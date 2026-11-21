// "Configurar tudo": monta no OpenBot, num clique, o time desenhado pelo cérebro.
//
// A API local do OpenBot não cria agentes, mas os próprios agentes dele têm as
// ferramentas para isso (create_agent, create_skill, install_local_skill,
// create_routine, save_mcp_server). Então o app escolhe um agente que já existe no
// servidor (o OpenBot sempre pede um na instalação), manda o pedido e acompanha.
// Se o OpenBot pedir aprovação ou fizer uma pergunta, ela aparece no front, que
// responde pela mesma API local.
//
// Uma mensagem pela API local tem no máximo 4.000 caracteres e o pedido é maior:
// ele vai inteiro num arquivo dentro do cérebro, em .openbot/montar-time.md
// (ignorado pelo git), e a mensagem só aponta para ele.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSchedule } from "../skills/levar-para-openbot/scripts/openbot-import.mjs";
import type { Plan } from "./agentPlan";
import { findEggbot, type OpenBotAgent } from "./openbot";

const DESCRIPTION_MAX = 2000;
const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text);

export type TeamBuild = {
  status: "nenhum" | "rodando" | "pronto" | "falhou";
  builder: { id: string; name: string } | null;
  deliveryId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  answer: string;
  report: { criados: string[]; skills: number; rotinas: number; conector: boolean; falhas: string[] } | null;
  // Quantas vezes o pedido foi mandado. O OpenBot pode interromper um turno longo no
  // meio (aconteceu no primeiro teste real); o app retoma sozinho, e o pedido
  // reaproveita o que já foi criado.
  attempts: number;
};

export const MAX_ATTEMPTS = 3;
const EMPTY: TeamBuild = { status: "nenhum", builder: null, deliveryId: null, startedAt: null, endedAt: null, answer: "", report: null, attempts: 0 };

// O agente que monta o time: um que já existe e não faz parte do time desenhado.
export function pickBuilder(agents: OpenBotAgent[], plan: Plan): OpenBotAgent | null {
  const team = new Set(plan.agents.map((one) => one.name.toLowerCase()));
  const free = agents.filter((one) => !team.has(one.name.toLowerCase()));
  // O Dr. Eggbot foi feito para criar agentes: quando ele existe, é ele quem monta.
  return findEggbot(free) ?? free[0] ?? agents[0] ?? null;
}

// O pedido completo, em Markdown, com tudo que o agente precisa (nada a adivinhar).
export function writeTeamOrder(brain: string, plan: Plan, connector: { command: string; args: string[] }) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  const lines = [
    "# Montar o time de agentes no OpenBot",
    "",
    "Pedido explícito do dono deste OpenBot, feito no Founders OS (botão Configurar tudo). Faça tudo, na ordem, sem perguntar de novo.",
    "",
    "## 1. Conector Segundo Cérebro",
    "Se ainda não existir um servidor MCP chamado `segundo-cerebro`, crie com `save_mcp_server` exatamente assim:",
    "```json",
    JSON.stringify({ name: "segundo-cerebro", transport: "stdio", command: connector.command, args: connector.args, enabled: true }, null, 2),
    "```",
    "",
    "## 2. Os agentes",
    "Para cada agente abaixo: se já existir um agente com o mesmo nome (use `list_agents`), não crie outro, use o que existe. Senão, `create_agent` com name, title, description e initialMessage exatamente como estão.",
    "Depois, para cada skill do agente: copie a pasta indicada (dentro do cérebro) para o seu workspace, rode `create_skill` com essa cópia (se a skill já estiver na biblioteca, use a que existe) e `install_local_skill` com o agentId do agente.",
    "Para cada rotina: `create_routine` com o agentId, o name, a instruction e o schedule exatamente como estão.",
    "",
  ];
  for (const agent of plan.agents) {
    const description = cut(
      [`Você é o agente "${agent.name}" da empresa. Missão: ${agent.mission}`, agent.owns?.length ? `Você é dono destes departamentos do cérebro: ${agent.owns.join(", ")}.` : "", "Suas instruções completas estão na primeira mensagem desta conversa e no cérebro, pelo conector segundo-cerebro.", "Respostas curtas, em português. Não edite wiki/ sem aprovação. Em dúvida, pergunte."]
        .filter(Boolean)
        .join("\n"),
      DESCRIPTION_MAX,
    );
    lines.push(`### ${agent.name}`, "");
    lines.push("```json");
    lines.push(JSON.stringify({ name: agent.name.slice(0, 80), title: cut(agent.mission || agent.name, 120), description }, null, 2));
    lines.push("```");
    const skills = [...agent.skills, ...agent.routines.map((one) => one.slug)].filter((slug) => existsSync(join(brain, ".claude", "skills", slug, "SKILL.md")));
    lines.push("Skills (pasta de origem de cada uma):");
    lines.push(skills.length ? skills.map((slug) => `- ${slug}: ${join(brain, ".claude", "skills", slug)}`).join("\n") : "- nenhuma");
    const routines = agent.routines
      .map((one) => ({ one, schedule: readSchedule(one.schedule) }))
      .filter((item) => item.schedule)
      .map(({ one, schedule }) => ({ name: one.slug, instruction: `Rode a skill \`${one.slug}\` e siga o passo a passo dela. No fim, diga em poucas linhas o que fez.`, schedule, timezone, active: true }));
    lines.push("Rotinas:");
    lines.push(routines.length ? "```json\n" + JSON.stringify(routines, null, 2) + "\n```" : "- nenhuma");
    lines.push("initialMessage (copie o texto inteiro entre as linhas):", "-----", agent.prompt, "", "Guarde estas instruções como o seu papel. Para ler o cérebro ao vivo, use as ferramentas do conector segundo-cerebro.", "-----", "");
  }
  lines.push(
    "## 3. Resposta",
    "No fim, responda SÓ com um bloco ```json:",
    '{"criados": ["nomes dos agentes criados ou já existentes"], "skills": <quantas skills instaladas>, "rotinas": <quantas rotinas criadas>, "conector": true/false, "falhas": ["o que falhou e por quê"]}',
  );
  const dir = join(brain, ".openbot");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  const file = join(dir, "montar-time.md");
  writeFileSync(file, lines.join("\n"));
  const message =
    `Pedido explícito meu, feito no Founders OS: monte o time de agentes da empresa no OpenBot. ` +
    `O passo a passo completo está no arquivo ${file}. Leia o arquivo inteiro e faça tudo na ordem: o conector segundo-cerebro, ` +
    `os ${plan.agents.length} agentes (${plan.agents.map((one) => one.name).join(", ")}), as skills e as rotinas. Termine com o bloco json do arquivo.`;
  return { file, message };
}

function readReport(answer: string): TeamBuild["report"] {
  const block = answer.match(/```json\s*([\s\S]*?)```/)?.[1];
  if (!block) return null;
  try {
    const raw = JSON.parse(block);
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : []);
    return { criados: list(raw.criados), skills: Number(raw.skills) || 0, rotinas: Number(raw.rotinas) || 0, conector: raw.conector === true, falhas: list(raw.falhas) };
  } catch {
    return null;
  }
}

// O estado da montagem, guardado por cérebro em sessoes/agentes/montagem.json.
export function teamStore(brain: string, results: string) {
  const file = join(results, "agentes", "montagem.json");
  let state: TeamBuild = EMPTY;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (saved.brain === brain) state = { ...EMPTY, ...saved };
  } catch {
    /* começo */
  }
  const save = () => {
    mkdirSync(join(results, "agentes"), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...state, brain }, null, 2));
  };
  return {
    state: () => state,
    // retry: a mesma montagem, mandada de novo depois de uma interrupção.
    start(builder: OpenBotAgent, deliveryId: string | null, retry = false) {
      const attempts = retry ? state.attempts + 1 : 1;
      state = { ...EMPTY, status: deliveryId ? "rodando" : "falhou", builder: { id: builder.id, name: builder.name }, deliveryId, startedAt: retry && state.startedAt ? state.startedAt : new Date().toISOString(), answer: deliveryId ? "" : "O OpenBot não devolveu a entrega.", attempts };
      save();
      return state;
    },
    // A entrega do agente terminou: guarda a resposta e o relatório.
    finish(status: string, answer: string, error: string | null) {
      const report = status === "completed" ? readReport(answer) : null;
      // Sem o bloco json do relatório o agente não montou nada (ele pode só ter
      // respondido "manda de novo"): isso é uma falha, nunca "pronto".
      state = { ...state, status: report ? "pronto" : "falhou", endedAt: new Date().toISOString(), answer: answer || error || "", report };
      save();
      return state;
    },
  };
}
