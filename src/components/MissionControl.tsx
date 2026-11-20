// O Mission Control: o segundo cérebro inteiro numa tela, sobre o mapa.
//
// Em cima, o time: cada agente com o mascote do OpenBot e o que está fazendo agora.
// No centro, o quadro de tarefas (memory/to-dos.md, o mesmo arquivo da skill /todo):
// A fazer → Com agente → Revisão → Feito. Uma tarefa vai para um agente com um clique
// ou arrastando o cartão até o mascote; o cartão anda sozinho e volta para a pessoa
// revisar. Ao lado: o que espera a pessoa, as prioridades do cérebro, a agenda das
// rotinas, as pendências do wiki e a atividade recente.
import { useCallback, useEffect, useMemo, useState } from "react";
import { css } from "../css";
import { KindIcon, Svg } from "./Icons";
import { BotFace } from "./BotFace";
import { Space } from "./Space";
import { areaAlias } from "../brain/areaStyle";

type Agent = { key: string; name: string; owns?: string[]; mission: string; openbot: { id: string; name: string; avatar?: { seed: string; hue: number | null } } | null };
type Routine = { name: string; active: boolean; schedule: any; next: string | null; last: { status: string; at: string; error: string | null } | null };
type State = { working: boolean; turnStarted: string | null; step: string | null; answer: { text: string; at: string } | null; broken: number; routines: Routine[] };
type Data = {
  openbot: { connected: boolean; reason: string | null };
  history: boolean;
  agents: Agent[];
  mission: { agents: Record<string, State>; activity: { agentId: string; text: string; at: string }[] } | null;
  pending: Record<string, { prompts?: any[]; approvals?: any[] } | null>;
  setup: { installed: boolean; running: boolean; localScripts: boolean; connector: { connectedAt: string | null; lastUse: string | null } } | null;
  team: string;
  priorities: { updated: string; items: { title: string; detail: string }[] };
  brainPending: { page: string; area: string; text: string }[];
  org?: OrgData;
};
type Status = "a-fazer" | "com-agente" | "revisao" | "feito";
type Task = {
  id: string;
  title: string;
  area: string;
  due: string;
  created: string;
  doneAt: string;
  agent: string;
  project: string;
  notes: string;
  focus: boolean;
  status: Status;
  run: { agentKey: string; agentName: string; agentId: string; status: string; answer: string; error: string | null; at: string } | null;
};

const PANEL = "border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 88%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 16px 40px oklch(0 0 0 / 40%)";
const LABEL = "font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)";
const MUTED = "oklch(0.6 0.012 268)";
const GOLD = "oklch(0.86 0.12 85)";
const GREEN = "oklch(0.78 0.14 155)";
const RED = "oklch(0.76 0.13 25)";
const BLUE = "oklch(0.76 0.11 245)";
type View = "quadro" | "lista" | "calendario" | "organograma";
type Page = "meu-dia" | "espaco" | "time";
const VIEWS: [View, string, string][] = [
  ["quadro", "Quadro", "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z"],
  ["lista", "Lista", "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"],
  ["calendario", "Calendário", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
  ["organograma", "Organograma", "M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4"],
];
const NOTE_ICON = "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5";
const COLUMNS: { key: Status; title: string; color: string; empty: string; icon: string }[] = [
  { key: "a-fazer", title: "A fazer", color: "oklch(0.82 0.01 268)", empty: "Escreva uma tarefa acima ou puxe uma pendência do cérebro", icon: "M12 5v14M5 12h14" },
  { key: "com-agente", title: "Com agente", color: BLUE, empty: "Arraste um cartão até aqui ou até um mascote do time", icon: "M5 12h14M13 6l6 6-6 6" },
  { key: "revisao", title: "Revisão", color: GOLD, empty: "Quando um agente terminar, a entrega aparece aqui", icon: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { key: "feito", title: "Feito", color: GREEN, empty: "As tarefas aprovadas ficam aqui", icon: "M5 12l5 5 9-10" },
];

const colorOf = (agent: Agent) => {
  const area = agent.owns?.[0];
  return !area || area === "empresa" ? "oklch(0.94 0.006 85)" : `var(--area-${area})`;
};
const iconOf = (agent: Agent) => {
  const area = agent.owns?.[0] ?? areaAlias(agent.name) ?? "";
  return !area || area === "empresa" ? "company" : area;
};
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (text: string) => text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim();
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
};
const when = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hoje " + hour(iso);
  if (date.toDateString() === new Date(today.getTime() + 86400000).toDateString()) return "Amanhã " + hour(iso);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + hour(iso);
};
const dayShort = (ymd: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const RUN: Record<string, [string, string]> = {
  succeeded: ["Deu certo", GREEN],
  failed: ["Falhou", RED],
  interrupted: ["Interrompida", RED],
  "needs-attention": ["Pede atenção", GOLD],
  running: ["Rodando", GOLD],
  queued: ["Na fila", GOLD],
  cancelled: ["Cancelada", MUTED],
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não deu certo");
  return data;
}

function Face({ agent, size, working }: { agent: Agent; size: number; working?: boolean }) {
  return agent.openbot?.avatar ? (
    <BotFace seed={agent.openbot.avatar.seed} hue={agent.openbot.avatar.hue} size={size} mood={working ? "trabalhando" : "calmo"} />
  ) : (
    <span style={css(`display: grid; place-items: center; width: ${size}px; height: ${size}px; border-radius: 99px; border: 1px solid ${colorOf(agent)}; color: ${colorOf(agent)}; opacity: 0.5`)}>
      <KindIcon name={iconOf(agent)} />
    </span>
  );
}

type Props = { close: () => void; openAgent: (area: string) => void; setup: () => void; openPage: (path: string) => void };

export function MissionControl({ close, openAgent, setup, openPage }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"agenda" | "pendencias" | "atividade">("pendencias");
  const [draft, setDraft] = useState("");
  const [draftArea, setDraftArea] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("fos-mission-view");
      return saved === "lista" || saved === "calendario" || saved === "organograma" ? saved : "quadro";
    } catch {
      return "quadro";
    }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(() => {
    try {
      const saved = localStorage.getItem("fos-mission-page");
      return saved === "time" || saved === "espaco" ? saved : "meu-dia";
    } catch {
      return "meu-dia";
    }
  });
  const pickPage = (next: Page) => {
    setPage(next);
    try {
      localStorage.setItem("fos-mission-page", next);
    } catch {}
  };
  const pickView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem("fos-mission-view", next);
    } catch {}
  };

  const load = useCallback(() => {
    fetch("/api/mission", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((next: Data) => {
        setData(next);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    fetch("/api/tasks", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next) => next && setTasks(next.tasks))
      .catch(() => null);
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (url: string, body: unknown) => {
    setError("");
    try {
      const out = await post(url, body);
      if (out.tasks) setTasks(out.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu certo");
    }
    load();
  };

  const agents = data?.agents ?? [];
  const live = agents.filter((one) => one.openbot);
  const stateOf = (agent?: Agent) => (agent?.openbot ? data?.mission?.agents[agent.openbot.id] : undefined);
  const agentByKey = (key?: string) => agents.find((one) => one.key === key);
  const agentById = (id: string) => agents.find((one) => one.openbot?.id === id);
  const open = (agent: Agent) => openAgent(agent.owns?.[0] ?? agent.name);
  const areas = useMemo(() => [...new Set(agents.flatMap((one) => one.owns ?? []))], [agents]);

  const waits = live.flatMap((agent) => {
    const pending = data?.pending[agent.openbot!.id];
    return [...(pending?.approvals ?? []).map((one) => ({ agent, kind: "approval" as const, one })), ...(pending?.prompts ?? []).map((one) => ({ agent, kind: "prompt" as const, one }))];
  });
  const routines = live
    .flatMap((agent) => (stateOf(agent)?.routines ?? []).map((routine) => ({ agent, routine })))
    .filter((item) => item.routine.active && item.routine.next)
    .sort((a, b) => a.routine.next!.localeCompare(b.routine.next!));
  const byStatus = (status: Status) => {
    const list = tasks.filter((one) => one.status === status);
    return status === "feito" ? list.sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 20) : list;
  };
  const openCount = tasks.filter((one) => one.status !== "feito").length;
  const review = byStatus("revisao").length;
  const working = live.filter((one) => stateOf(one)?.working).length;
  const tasksWith = (agent: Agent) => tasks.filter((one) => one.status === "com-agente" && one.run?.agentKey === agent.key).length;

  const problems = data?.setup
    ? [
        !data.openbot.connected && "OpenBot desconectado",
        !data.setup.localScripts && "Local scripts desligado",
        data.team !== "pronto" && "Time não montado",
        !data.setup.connector.connectedAt && "Conector desligado",
      ].filter(Boolean)
    : [];
  const healthTip = data?.setup
    ? [
        data.openbot.connected ? "OpenBot conectado" : "OpenBot desconectado",
        data.setup.localScripts ? "Local scripts ligado" : "Local scripts desligado",
        data.team === "pronto" ? "Time montado" : "Time não montado",
        data.setup.connector.lastUse ? "Conector usado " + ago(data.setup.connector.lastUse) : data.setup.connector.connectedAt ? "Conector ligado" : "Conector desligado",
      ].join("\n")
    : "";

  const add = () => {
    if (!draft.trim()) return;
    run("/api/tasks", { title: draft, area: draftArea });
    setDraft("");
    setDraftArea("");
  };
  const dropOn = (target: string) => {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const task = tasks.find((one) => one.id === id);
    if (!task) return;
    if (target.startsWith("agent:")) return void run("/api/tasks/assign", { id, agent: target.slice(6) });
    const status = target as Status;
    if (task.status === status) return;
    if (status === "com-agente") run("/api/tasks/assign", { id, agent: "auto" });
    else if (status !== "revisao") run("/api/tasks/move", { id, status });
  };
  const dropProps = (target: string, allowed = true) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragging || !allowed) return;
      event.preventDefault();
      if (over !== target) setOver(target);
    },
    onDragLeave: () => over === target && setOver(null),
    onDrop: () => dropOn(target),
  });

  const stats: [string, number, string][] = [
    ["Abertas", openCount, "oklch(0.94 0.006 85)"],
    ["Trabalhando", working, BLUE],
    ["Para revisar", review, GOLD],
    ["Esperando você", waits.length, waits.length ? RED : "oklch(0.94 0.006 85)"],
  ];

  return (
    <div
      role="dialog"
      aria-label="Mission Control"
      style={css("position: absolute; inset: 0; z-index: 30; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 18px; background-color: oklch(0.135 0.006 268); background-image: radial-gradient(oklch(1 0 0 / 7%) 1px, transparent 1.2px); background-size: 15px 15px; animation: b-rise 0.2s ease-out")}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      {/* O topo, no jeito do mapa: a chave das páginas à esquerda, o título no centro e o status à direita */}
      <header style={css("position: relative; z-index: 5; flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-height: 52px")}>
        <div role="tablist" aria-label="Página" style={css(PANEL + "; display: flex; gap: 2px; padding: 3px; border-radius: 12px")}>
          {(
            [
              ["meu-dia", "Meu dia"],
              ["espaco", "Espaço"],
              ["time", "Time"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={page === key}
              className="b-btn b-ghost"
              onClick={() => pickPage(key)}
              style={css(`height: 28px; padding: 0 12px; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; background: ${page === key ? "oklch(1 0 0 / 10%)" : "transparent"}; color: ${page === key ? "oklch(0.95 0.006 85)" : "oklch(0.74 0.012 268)"}`)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={css("position: absolute; left: 50%; top: 4px; transform: translateX(-50%); text-align: center; pointer-events: none; white-space: nowrap")}>
          <h2 style={css("margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.34em; text-indent: 0.34em; text-transform: uppercase")}>{page === "meu-dia" ? "Meu dia" : page === "espaco" ? "Espaço" : "Time"}</h2>
          <div style={css("margin-top: 6px; font-size: 12px; color: oklch(0.68 0.012 268)")}>
            {page === "espaco"
              ? "Peça um app na barra e arrume os cartões como quiser"
              : page === "meu-dia"
              ? (() => {
                  const day = todayYmd();
                  const done = tasks.filter((one) => one.status === "feito" && one.doneAt === day).length;
                  const planned = done + tasks.filter((one) => one.status !== "feito" && (one.focus || (one.due && one.due <= day))).length;
                  const date = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
                  return planned ? `${date} · ${done} de ${planned} feitas` : date;
                })()
              : [`${openCount} ${openCount === 1 ? "tarefa aberta" : "tarefas abertas"}`, `${working} trabalhando`, review ? `${review} para revisar` : "", waits.length ? `${waits.length} esperando você` : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={css("display: flex; align-items: center; gap: 6px")}>
          {data?.setup && (
            <button
              className="b-btn b-ghost"
              title={healthTip}
              onClick={setup}
              style={css(PANEL + `; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: 11px; font: inherit; font-size: 12px; color: oklch(0.8 0.012 268); cursor: pointer; white-space: nowrap`)}
            >
              <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${problems.length ? RED : GREEN}`)}></span>
              {problems.length ? problems[0] : "OpenBot"}
            </button>
          )}
          <button className="b-btn b-ghost" aria-label="Fechar" title="Fechar (Esc)" onClick={close} style={css(PANEL + "; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; color: oklch(0.8 0.012 268); cursor: pointer")}>
            <Svg size={15}>
              <path d="M6 6l12 12M18 6 6 18"></path>
            </Svg>
          </button>
        </div>
      </header>

      {failed && !data && <div style={css(PANEL + "; padding: 16px; font-size: 13px; color: oklch(0.8 0.09 25)")}>Não consegui ler o cérebro. Confira se o servidor do app está de pé.</div>}

      {page === "espaco" && <Space openTask={setSelected} changed={load} />}

      {page === "meu-dia" && (
        <MyDay
          tasks={tasks}
          areas={areas}
          routines={routines}
          onCreate={(title, area, due) => run("/api/tasks", { title, area, due })}
          onMove={(id, status) => run("/api/tasks/move", { id, status })}
          onFocus={(id, focus) => run("/api/tasks/edit", { id, focus })}
          onSelect={setSelected}
        />
      )}

      {/* O time: um mascote por agente. Clique abre a conversa; soltar um cartão manda a tarefa. */}
      {page === "time" && agents.length > 0 && (
        <section style={css(PANEL + "; flex: none; display: flex; align-items: stretch; gap: 6px; padding: 8px")}>
          {agents.map((agent) => {
            const state = stateOf(agent);
            const busy = Boolean(state?.working);
            const asks = waits.filter((one) => one.agent.key === agent.key).length;
            const holding = tasksWith(agent);
            const target = "agent:" + agent.key;
            const hot = over === target;
            const color = colorOf(agent);
            return (
              <button
                key={agent.key}
                className="b-btn m-tile"
                onClick={() => open(agent)}
                title={agent.openbot ? "Abrir a conversa com " + agent.name : agent.name + " ainda não está no OpenBot"}
                {...dropProps(target, Boolean(agent.openbot))}
                style={css(
                  `position: relative; flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; text-align: left; font: inherit; color: inherit; cursor: pointer; border: 1px ${hot ? "dashed" : "solid"} ${
                    hot ? GOLD : busy ? `color-mix(in oklch, ${color} 35%, transparent)` : "transparent"
                  }; background: ${hot ? `color-mix(in oklch, ${GOLD} 10%, transparent)` : busy ? `color-mix(in oklch, ${color} 7%, transparent)` : "transparent"}; opacity: ${agent.openbot ? 1 : 0.55}`,
                )}
              >
                <span className={busy ? "m-ring" : undefined} style={css(`flex: none; display: grid; place-items: center; border-radius: 99px; --glow: ${color}`)}>
                  <Face agent={agent} size={38} working={busy} />
                </span>
                <span style={css("flex: 1; min-width: 0")}>
                  <span style={css(`display: block; font-size: 10.5px; font-weight: 650; letter-spacing: 0.18em; text-transform: uppercase; color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)}>{agent.name}</span>
                  <span style={css(`display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: 11.5px; color: ${busy ? "oklch(0.88 0.008 268)" : MUTED}; white-space: nowrap; overflow: hidden`)}>
                    {busy && <span className="c-spin" style={css("flex: none; width: 9px; height: 9px")}></span>}
                    <span style={css("overflow: hidden; text-overflow: ellipsis")}>
                      {hot ? "Soltar para mandar" : !agent.openbot ? "Fora do OpenBot" : busy ? (state?.step ? plain(state.step) : "Trabalhando…") : holding ? `${holding} na fila` : state?.answer ? "Entregou " + ago(state.answer.at) : "Disponível"}
                    </span>
                  </span>
                </span>
                {(asks > 0 || (state?.broken ?? 0) > 0) && (
                  <span
                    title={asks ? "Esperando você" : "Turnos que não terminaram (7 dias)"}
                    style={css(`position: absolute; top: 5px; right: 6px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; display: grid; place-items: center; border-radius: 99px; font-size: 10px; font-weight: 700; background: ${asks ? GOLD : RED}; color: oklch(0.18 0.02 85)`)}
                  >
                    {asks || state!.broken}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {error && (
        <div style={css(`flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-radius: 10px; border: 1px solid color-mix(in oklch, ${RED} 35%, transparent); background: color-mix(in oklch, ${RED} 9%, transparent); font-size: 12.5px; color: oklch(0.88 0.06 25)`)}>
          {error}
          <button className="b-btn" onClick={() => setError("")} style={css("border: 0; background: none; color: inherit; font: inherit; font-size: 12px; cursor: pointer")}>
            Fechar
          </button>
        </div>
      )}

      {page === "time" && (
      <div style={css("flex: 1; min-height: 0; display: flex; gap: 12px")}>
        <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px")}>
          {/* Três jeitos de ver as mesmas tarefas */}
          <div style={css("flex: none; display: flex; align-items: center; gap: 10px")}>
            <div role="tablist" style={css("display: flex; gap: 2px; padding: 3px; border-radius: 11px; border: 1px solid oklch(1 0 0 / 8%); background: oklch(0.165 0.008 268 / 90%)")}>
              {VIEWS.map(([key, label, icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  className="b-btn"
                  onClick={() => pickView(key)}
                  style={css(
                    `display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 0; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: ${
                      view === key ? "oklch(1 0 0 / 10%)" : "transparent"
                    }; color: ${view === key ? "oklch(0.95 0.006 85)" : MUTED}`,
                  )}
                >
                  <Svg size={13}>
                    <path d={icon}></path>
                  </Svg>
                  {label}
                </button>
              ))}
            </div>
          </div>

        {view === "lista" && <ListView tasks={tasks} areas={areas} agents={agents} onCreate={(title, area, due) => run("/api/tasks", { title, area, due })} onMove={(id, status) => run("/api/tasks/move", { id, status })} onSelect={setSelected} />}
        {view === "organograma" && <OrgChart agents={agents} org={data?.org ?? null} stateOf={stateOf} onOpen={open} changed={load} />}
        {view === "calendario" && (
          <CalendarView
            tasks={tasks}
            routines={routines}
            onCreate={(title, due) => run("/api/tasks", { title, due })}
            onDue={(id, due) => run("/api/tasks/edit", { id, due })}
            onSelect={setSelected}
          />
        )}
        {/* O quadro de tarefas */}
        {view === "quadro" && (
        <section style={css("flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px")}>
          {COLUMNS.map((column) => {
            const list = byStatus(column.key);
            const hot = over === column.key;
            return (
              <div
                key={column.key}
                {...dropProps(column.key, column.key !== "revisao")}
                style={css(
                  PANEL +
                    `; position: relative; min-height: 0; display: flex; flex-direction: column; overflow: hidden; ${hot ? `border-color: color-mix(in oklch, ${column.color} 60%, transparent); background: color-mix(in oklch, ${column.color} 6%, oklch(0.165 0.008 268 / 92%))` : ""}`,
                )}
              >
                <div style={css("flex: none; padding: 13px 12px 10px")}>
                  <div style={css("display: flex; align-items: center; gap: 8px")}>
                    <span style={css(`width: 7px; height: 7px; border-radius: 99px; background: ${column.color}`)}></span>
                    <span style={css("font-size: 13px; font-weight: 600")}>{column.title}</span>
                    <span style={css(`margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; display: grid; place-items: center; border-radius: 99px; background: oklch(1 0 0 / 6%); font-size: 11px; font-weight: 600; color: ${list.length ? "oklch(0.88 0.008 268)" : MUTED}`)}>{list.length}</span>
                  </div>
                  {column.key === "a-fazer" && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        add();
                      }}
                      style={css("margin-top: 10px")}
                    >
                      <div style={css("position: relative")}>
                        <span style={css(`position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: ${MUTED}; display: grid`)}>
                          <Svg size={14}>
                            <path d="M12 5v14M5 12h14"></path>
                          </Svg>
                        </span>
                        <input
                          className="m-input"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="Nova tarefa"
                          style={css("width: 100%; box-sizing: border-box; height: 34px; padding: 0 10px 0 31px; border-radius: 9px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3.5%); font: inherit; font-size: 12.5px; color: oklch(0.95 0.006 85); outline: none; transition: border-color 0.15s, background 0.15s")}
                        />
                      </div>
                      {draft && (
                        <div style={css("display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px")}>
                          {areas.map((one) => (
                            <button
                              type="button"
                              key={one}
                              className="b-btn"
                              onClick={() => setDraftArea((was) => (was === one ? "" : one))}
                              style={css(
                                `display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 99px; font: inherit; font-size: 11px; cursor: pointer; border: 1px solid ${draftArea === one ? `var(--area-${one}, ${GOLD})` : "oklch(1 0 0 / 10%)"}; background: ${
                                  draftArea === one ? `color-mix(in oklch, var(--area-${one}, ${GOLD}) 16%, transparent)` : "transparent"
                                }; color: ${draftArea === one ? "oklch(0.95 0.006 85)" : MUTED}`,
                              )}
                            >
                              <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: var(--area-${one}, ${GOLD})`)}></span>
                              {cap(one)}
                            </button>
                          ))}
                          <span style={css(`font-size: 11px; color: ${MUTED}; align-self: center; margin-left: auto`)}>Enter ↵</span>
                        </div>
                      )}
                    </form>
                  )}
                </div>
                <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px")}>
                  {!list.length && <div style={css(`padding: 10px 6px; font-size: 12px; line-height: 1.5; color: ${hot ? GOLD : "oklch(0.5 0.012 268)"}`)}>{hot ? "Soltar aqui" : column.empty}</div>}
                  {list.map((task) => (
                    <Card
                      key={task.id}
                      task={task}
                      agents={live}
                      agent={agentByKey(task.run?.agentKey) ?? agents.find((one) => one.name === task.agent)}
                      state={stateOf(agentByKey(task.run?.agentKey))}
                      onDrag={setDragging}
                      onAssign={(agent) => run("/api/tasks/assign", { id: task.id, agent })}
                      onMove={(status) => run("/api/tasks/move", { id: task.id, status })}
                      onDelete={() => run("/api/tasks/delete", { id: task.id })}
                      onReview={(decision, comment) => run("/api/tasks/review", { id: task.id, decision, comment })}
                      onOpen={open}
                      onSelect={() => setSelected(task.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
        )}
        </div>

        {/* Ao lado: o que espera a pessoa, o foco do cérebro e o resto */}
        <aside style={css("flex: none; width: 320px; display: flex; flex-direction: column; gap: 10px; min-height: 0")}>
          {waits.length > 0 && (
            <section className="b-scroll" style={css(PANEL + `; flex: none; max-height: 38%; overflow-y: auto; padding: 12px; border-color: color-mix(in oklch, ${GOLD} 35%, transparent)`)}>
              <div style={css(LABEL + `; color: ${GOLD}; margin-bottom: 8px`)}>Precisa de você · {waits.length}</div>
              {waits.map(({ agent, kind, one }) => (
                <div key={one.requestId} style={css("display: flex; gap: 10px; margin-bottom: 10px; font-size: 12.5px; line-height: 1.5")}>
                  <Face agent={agent} size={26} />
                  <div style={css("flex: 1; min-width: 0")}>
                    <div style={css(`font-size: 10.5px; font-weight: 650; letter-spacing: 0.18em; text-transform: uppercase; color: ${colorOf(agent)}`)}>{agent.name}</div>
                    {kind === "approval" ? (
                      <>
                        <div style={css("margin-top: 2px; color: oklch(0.86 0.008 268)")}>{one.reason || one.kind}</div>
                        <div style={css("display: flex; gap: 6px; margin-top: 7px")}>
                          <Pill tone="gold" onClick={() => run("/api/chat/approve", { agent: agent.key, requestId: one.requestId, decision: "accept" })}>
                            Aprovar
                          </Pill>
                          <Pill onClick={() => run("/api/chat/approve", { agent: agent.key, requestId: one.requestId, decision: "decline" })}>Recusar</Pill>
                        </div>
                      </>
                    ) : (
                      (one.questions ?? []).map((q: any) => (
                        <div key={q.id} style={css("margin-top: 2px; color: oklch(0.86 0.008 268)")}>
                          {q.question}
                          <div style={css("display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px")}>
                            {(q.options ?? []).map((opt: any) => (
                              <Pill key={opt.label} onClick={() => run("/api/chat/answer", { agent: agent.key, requestId: one.requestId, answers: { [q.id]: [opt.label] } })}>
                                {opt.label}
                              </Pill>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {(data?.priorities.items.length ?? 0) > 0 && (
            <section style={css(PANEL + "; flex: none; padding: 12px 14px")}>
              <div style={css("display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px")}>
                <span style={css(LABEL)}>Foco da quinzena</span>
                {data!.priorities.updated && <span style={css(`font-size: 10.5px; color: ${MUTED}`)}>{dayShort(data!.priorities.updated)}</span>}
              </div>
              {data!.priorities.items.slice(0, 4).map((one, i) => (
                <div key={one.title} title={one.detail} style={css("display: flex; gap: 10px; align-items: flex-start; padding: 5px 0")}>
                  <span style={css(`flex: none; display: grid; place-items: center; width: 19px; height: 19px; margin-top: 1px; border-radius: 6px; font-size: 10.5px; font-weight: 700; color: oklch(0.2 0.02 85); background: ${GOLD}; opacity: ${1 - i * 0.18}`)}>{i + 1}</span>
                  <span style={css("display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12.5px; line-height: 1.4; color: oklch(0.9 0.008 268)")}>{one.title}</span>
                </div>
              ))}
            </section>
          )}

          <section style={css(PANEL + "; flex: 1; min-height: 140px; display: flex; flex-direction: column; overflow: hidden")}>
            <div style={css("flex: none; display: flex; gap: 2px; margin: 8px 8px 0; padding: 3px; border-radius: 10px; background: oklch(1 0 0 / 4%)")}>
              {(
                [
                  ["pendencias", "Pendências", data?.brainPending.length ?? 0],
                  ["agenda", "Agenda", routines.length],
                  ["atividade", "Atividade", 0],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  className="b-btn"
                  onClick={() => setTab(key)}
                  style={css(
                    `flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 28px; border: 0; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: ${
                      tab === key ? "oklch(1 0 0 / 10%)" : "transparent"
                    }; color: ${tab === key ? "oklch(0.95 0.006 85)" : MUTED}`,
                  )}
                >
                  {label}
                  {count > 0 && <span style={css("font-size: 10.5px; font-weight: 500; opacity: 0.7")}>{count}</span>}
                </button>
              ))}
            </div>
            <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 6px 8px 10px")}>
              {tab === "agenda" && (
                <>
                  {!routines.length && <Empty>Nenhuma rotina agendada.</Empty>}
                  {routines.map(({ agent, routine }) => {
                    const last = routine.last ? RUN[routine.last.status] : null;
                    return (
                      <div key={agent.key + routine.name} style={css("display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 9px")}>
                        <Face agent={agent} size={24} />
                        <span style={css("flex: 1; min-width: 0")}>
                          <span style={css("display: block; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{routine.name}</span>
                          <span style={css(`font-size: 11px; color: ${MUTED}`)}>
                            {when(routine.next!)}
                            {last && <span style={css(`color: ${last[1]}`)}> · {last[0]}</span>}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              {tab === "pendencias" && (
                <>
                  {!data?.brainPending.length && <Empty>Nada pendente no cérebro.</Empty>}
                  {data?.brainPending.map((one, i) => (
                    <div key={one.page + i} className="m-card" style={css("display: flex; gap: 9px; align-items: flex-start; padding: 8px 6px; border-radius: 9px; border: 1px solid transparent")}>
                      <span style={css(`flex: none; width: 3px; align-self: stretch; border-radius: 3px; background: var(--area-${one.area}, oklch(0.6 0.01 268))`)}></span>
                      <span style={css("flex: 1; min-width: 0")}>
                        <span style={css("display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12.5px; line-height: 1.45; color: oklch(0.86 0.008 268)")}>{one.text}</span>
                        <button className="b-btn" onClick={() => openPage(one.page)} title={one.page} style={css(`display: block; max-width: 100%; margin-top: 2px; border: 0; padding: 0; background: none; font: inherit; font-size: 11px; color: ${MUTED}; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)}>
                          {one.page.replace(/\.md$/, "")}
                        </button>
                      </span>
                      <button
                        className="b-btn m-hide"
                        title="Virar tarefa"
                        onClick={() => run("/api/tasks", { title: "Resolver: " + one.text, area: one.area })}
                        style={css(`flex: none; display: inline-flex; align-items: center; gap: 3px; height: 24px; padding: 0 8px; border-radius: 7px; border: 1px solid color-mix(in oklch, ${GOLD} 40%, transparent); background: color-mix(in oklch, ${GOLD} 10%, transparent); font: inherit; font-size: 11px; font-weight: 600; color: ${GOLD}; cursor: pointer`)}
                      >
                        + Tarefa
                      </button>
                    </div>
                  ))}
                </>
              )}
              {tab === "atividade" && (
                <>
                  {!data?.history && <Empty>A atividade aparece com o Node 22.5 ou mais novo.</Empty>}
                  {data?.history && !data.mission?.activity.length && <Empty>Nenhuma entrega ainda.</Empty>}
                  {data?.mission?.activity.map((item) => {
                    const agent = agentById(item.agentId);
                    if (!agent) return null;
                    return (
                      <button
                        key={item.agentId + item.at}
                        className="b-btn c-row"
                        onClick={() => open(agent)}
                        style={css("display: flex; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: 9px; background: transparent; text-align: left; font: inherit; color: inherit; cursor: pointer")}
                      >
                        <Face agent={agent} size={24} />
                        <span style={css("flex: 1; min-width: 0")}>
                          <span style={css("display: flex; justify-content: space-between; gap: 8px")}>
                            <span style={css(`font-size: 10.5px; font-weight: 650; letter-spacing: 0.18em; text-transform: uppercase; color: ${colorOf(agent)}`)}>{agent.name}</span>
                            <span style={css(`font-size: 11px; color: ${MUTED}`)}>{ago(item.at)}</span>
                          </span>
                          <span style={css("display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: oklch(0.76 0.01 268)")}>{plain(item.text)}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
      )}

      {selected && tasks.find((one) => one.id === selected) && (
        <TaskDetail
          key={selected}
          task={tasks.find((one) => one.id === selected)!}
          areas={areas}
          agents={live}
          agent={(() => {
            const task = tasks.find((one) => one.id === selected)!;
            return agentByKey(task.run?.agentKey) ?? agents.find((one) => one.name === task.agent);
          })()}
          close={() => setSelected(null)}
          onSave={(patch) => run("/api/tasks/edit", { id: selected, ...patch })}
          onAssign={(agent) => run("/api/tasks/assign", { id: selected, agent })}
          onMove={(status) => run("/api/tasks/move", { id: selected, status })}
          onReview={(decision, comment) => run("/api/tasks/review", { id: selected, decision, comment })}
          onDelete={() => (run("/api/tasks/delete", { id: selected }), setSelected(null))}
          onOpen={open}
        />
      )}
    </div>
  );
}

type CardProps = {
  task: Task;
  agents: Agent[];
  agent?: Agent;
  state?: State;
  onDrag: (id: string | null) => void;
  onAssign: (agent: string) => void;
  onMove: (status: Status) => void;
  onDelete: () => void;
  onReview: (decision: "approve" | "return", comment?: string) => void;
  onOpen: (agent: Agent) => void;
  onSelect: () => void;
};

// Um cartão do quadro. O que ele oferece depende da coluna: mandar para um agente,
// acompanhar o trabalho, revisar a entrega ou só mostrar que foi feito.
function Card({ task, agents, agent, state, onDrag, onAssign, onMove, onDelete, onReview, onOpen, onSelect }: CardProps) {
  const [picking, setPicking] = useState(false);
  const [full, setFull] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const color = agent ? colorOf(agent) : "oklch(0.7 0.012 268)";
  const areaColor = task.area ? `var(--area-${task.area}, oklch(0.6 0.01 268))` : "oklch(1 0 0 / 14%)";
  const answer = task.run?.answer ?? "";
  const done = task.status === "feito";
  return (
    <div
      draggable={!picking && comment === null}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDrag(task.id);
      }}
      onDragEnd={() => onDrag(null)}
      onClick={(event) => !(event.target as HTMLElement).closest("button, input, form, a") && onSelect()}
      className="m-card"
      style={css(
        `flex: none; position: relative; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px; background: oklch(1 0 0 / 3.5%); border: 1px solid ${
          task.status === "com-agente" ? `color-mix(in oklch, ${color} 38%, transparent)` : task.status === "revisao" ? `color-mix(in oklch, ${GOLD} 38%, transparent)` : "oklch(1 0 0 / 7%)"
        }; cursor: grab; opacity: ${done ? 0.7 : 1}`,
      )}
    >

      <div style={css("display: flex; gap: 8px; align-items: flex-start")}>
        {done && (
          <span style={css(`flex: none; display: grid; place-items: center; width: 16px; height: 16px; margin-top: 1px; border-radius: 99px; background: ${GREEN}; color: oklch(0.2 0.03 155)`)}>
            <Svg size={10} weight={3}>
              <path d="M5 12l5 5 9-10"></path>
            </Svg>
          </span>
        )}
        <div style={css(`flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.4; color: oklch(0.95 0.006 85); overflow-wrap: anywhere; ${done ? "text-decoration: line-through; text-decoration-color: oklch(1 0 0 / 30%)" : ""}`)}>{task.title}</div>
        {(task.status === "a-fazer" || done) && (
          <span className="m-hide" style={css("position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: oklch(0.235 0.01 268); box-shadow: 0 2px 10px oklch(0 0 0 / 35%)")}>
            {task.status === "a-fazer" && (
              <IconPill label="Marcar como feita" onClick={() => onMove("feito")}>
                <path d="M5 12l5 5 9-10"></path>
              </IconPill>
            )}
            {done && (
              <IconPill label="Reabrir" onClick={() => onMove("a-fazer")}>
                <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"></path>
              </IconPill>
            )}
            <IconPill label="Apagar" onClick={onDelete}>
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path>
            </IconPill>
          </span>
        )}
      </div>

      {(task.area || task.due || task.notes || (agent && task.status !== "a-fazer")) && (
        <div style={css(`display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: ${MUTED}`)}>
          {task.area && <Tag color={areaColor}>{cap(task.area)}</Tag>}
          {task.due && <Tag>Prazo {dayShort(task.due)}</Tag>}
          {task.notes && (
            <Tag>
              <Svg size={11}>
                <path d={NOTE_ICON}></path>
              </Svg>
              Notas
            </Tag>
          )}
          {done && task.doneAt && <Tag>Feito {dayShort(task.doneAt)}</Tag>}
          {agent && task.status !== "a-fazer" && (
            <button
              className="b-btn"
              onClick={() => onOpen(agent)}
              title={"Abrir a conversa com " + agent.name}
              style={css(`display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 7px 0 2px; border-radius: 99px; border: 0; background: oklch(1 0 0 / 5%); font: inherit; font-size: 11px; color: ${color}; cursor: pointer`)}
            >
              <Face agent={agent} size={18} working={task.status === "com-agente"} />
              {agent.name}
            </button>
          )}
        </div>
      )}

      {task.status === "com-agente" && (
        <>
          <div style={css("display: flex; align-items: flex-start; gap: 7px; font-size: 12px; line-height: 1.45; color: oklch(0.78 0.012 268)")}>
            <span className="c-spin" style={css("margin-top: 3px; flex: none")}></span>
            <span style={css("display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden")}>
              {task.run?.status === "queued" ? "Na fila do agente…" : state?.working && state.step ? plain(state.step) : "Trabalhando…"}
            </span>
          </div>
          <div className="m-bar" style={css(`height: 3px; border-radius: 99px; background: oklch(1 0 0 / 6%); --glow: ${color}`)}></div>
          <button className="b-btn" onClick={() => onMove("a-fazer")} style={css(`align-self: flex-start; border: 0; padding: 0; background: none; font: inherit; font-size: 11px; color: ${MUTED}; cursor: pointer`)}>
            Tirar do agente
          </button>
        </>
      )}

      {task.status === "revisao" && (
        <>
          <div
            onClick={() => setFull((was) => !was)}
            title={full ? "Recolher" : "Ler tudo"}
            style={css(
              `padding: 8px 10px; border-radius: 8px; background: oklch(1 0 0 / 3.5%); border-left: 2px solid ${color}; font-size: 12px; line-height: 1.5; color: oklch(0.84 0.01 268); cursor: pointer; ${
                full ? "white-space: pre-wrap; max-height: 260px; overflow-y: auto" : "display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden"
              }`,
            )}
          >
            {full ? answer : plain(answer) || "O agente terminou sem texto."}
          </div>
          {comment === null ? (
            <div style={css("display: flex; gap: 6px")}>
              <Pill tone="green" grow onClick={() => onReview("approve")}>
                Aprovar
              </Pill>
              <Pill grow onClick={() => setComment("")}>
                Devolver
              </Pill>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onReview("return", comment);
                setComment(null);
              }}
              style={css("display: flex; flex-direction: column; gap: 6px")}
            >
              <input
                autoFocus
                className="m-input"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="O que ajustar?"
                style={css("height: 30px; padding: 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(1 0 0 / 4%); font: inherit; font-size: 12px; color: oklch(0.95 0.006 85); outline: none")}
              />
              <div style={css("display: flex; gap: 6px")}>
                <Pill tone="gold" grow onClick={() => (onReview("return", comment ?? ""), setComment(null))}>
                  Mandar de volta
                </Pill>
                <Pill onClick={() => setComment(null)}>Cancelar</Pill>
              </div>
            </form>
          )}
        </>
      )}

      {task.status === "a-fazer" &&
        (picking ? (
          <div style={css("display: flex; flex-direction: column; gap: 6px; padding-top: 2px")}>
            <div style={css("display: flex; align-items: center; justify-content: space-between")}>
              <span style={css(`font-size: 11px; color: ${MUTED}`)}>Mandar para</span>
              <button className="b-btn" onClick={() => setPicking(false)} style={css(`border: 0; padding: 0; background: none; font: inherit; font-size: 11px; color: ${MUTED}; cursor: pointer`)}>
                Cancelar
              </button>
            </div>
            <div style={css("display: flex; flex-wrap: wrap; gap: 5px")}>
              <button
                className="b-btn c-act"
                onClick={() => (setPicking(false), onAssign("auto"))}
                title={task.area ? "O agente da área " + cap(task.area) : "O agente da Empresa"}
                style={css(`display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 99px; border: 1px solid color-mix(in oklch, ${GOLD} 45%, transparent); background: color-mix(in oklch, ${GOLD} 10%, transparent); font: inherit; font-size: 11.5px; font-weight: 600; color: ${GOLD}; cursor: pointer`)}
              >
                <Svg size={12}>
                  <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>
                </Svg>
                Automático
              </button>
              {agents.map((one) => (
                <button
                  key={one.key}
                  className="b-btn c-act"
                  onClick={() => (setPicking(false), onAssign(one.key))}
                  title={one.name}
                  style={css(`display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px 0 3px; border-radius: 99px; border: 1px solid oklch(1 0 0 / 10%); background: transparent; font: inherit; font-size: 11px; color: ${colorOf(one)}; cursor: pointer`)}
                >
                  <Face agent={one} size={20} />
                  {one.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="b-btn c-act"
            style={css(`align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 26px; margin-left: -6px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; font: inherit; font-size: 12px; color: oklch(0.74 0.012 268); cursor: pointer`)}
          >
            <Svg size={13}>
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </Svg>
            Mandar para um agente
          </button>
        ))}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={css("display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 99px; background: oklch(1 0 0 / 5%); white-space: nowrap")}>
      {color && <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${color}`)}></span>}
      {children}
    </span>
  );
}

function Pill({ children, onClick, tone, grow }: { children: React.ReactNode; onClick: () => void; tone?: "gold" | "green"; grow?: boolean }) {
  const fill = tone === "gold" ? "oklch(0.82 0.15 85)" : tone === "green" ? "oklch(0.76 0.15 155)" : "";
  return (
    <button
      type="button"
      className="b-btn"
      onClick={onClick}
      style={css(
        `${grow ? "flex: 1;" : ""} height: 28px; padding: 0 11px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; border: 1px solid ${fill ? "transparent" : "oklch(1 0 0 / 12%)"}; background: ${
          fill || "transparent"
        }; color: ${fill ? "oklch(0.2 0.02 85)" : "oklch(0.9 0.008 268)"}`,
      )}
    >
      {children}
    </button>
  );
}

function IconPill({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="b-btn c-act" aria-label={label} title={label} onClick={onClick} style={css(`display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 7px; background: transparent; color: ${MUTED}; cursor: pointer`)}>
      <Svg size={13}>{children}</Svg>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={css(`padding: 14px 6px; font-size: 12.5px; color: ${MUTED}`)}>{children}</div>;
}

// ---------- Datas ----------
const ymdOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayYmd = () => ymdOf(new Date());
const addDays = (ymd: string, days: number) => {
  const date = new Date(ymd + "T12:00:00");
  date.setDate(date.getDate() + days);
  return ymdOf(date);
};
const dueLabel = (ymd: string) => {
  const today = todayYmd();
  if (ymd === today) return "Hoje";
  if (ymd === addDays(today, 1)) return "Amanhã";
  if (ymd === addDays(today, -1)) return "Ontem";
  return new Date(ymd + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};
const STATUS_INFO: Record<Status, [string, string]> = {
  "a-fazer": ["A fazer", "oklch(0.82 0.01 268)"],
  "com-agente": ["Com agente", BLUE],
  revisao: ["Revisão", GOLD],
  feito: ["Feito", GREEN],
};
const areaColorOf = (area: string) => (area ? `var(--area-${area}, oklch(0.6 0.01 268))` : "oklch(1 0 0 / 18%)");
const FIELD = "box-sizing: border-box; height: 32px; padding: 0 10px; border-radius: 9px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3.5%); font: inherit; font-size: 12.5px; color: oklch(0.95 0.006 85); outline: none; color-scheme: dark";

function AreaChips({ areas, value, onChange }: { areas: string[]; value: string; onChange: (area: string) => void }) {
  return (
    <div style={css("display: flex; flex-wrap: wrap; gap: 5px")}>
      {areas.map((one) => (
        <button
          type="button"
          key={one}
          className="b-btn"
          onClick={() => onChange(value === one ? "" : one)}
          style={css(
            `display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 99px; font: inherit; font-size: 11.5px; cursor: pointer; border: 1px solid ${value === one ? areaColorOf(one) : "oklch(1 0 0 / 10%)"}; background: ${
              value === one ? `color-mix(in oklch, ${areaColorOf(one)} 16%, transparent)` : "transparent"
            }; color: ${value === one ? "oklch(0.95 0.006 85)" : MUTED}`,
          )}
        >
          <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${areaColorOf(one)}`)}></span>
          {cap(one)}
        </button>
      ))}
    </div>
  );
}

function Check({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="b-btn"
      aria-label={done ? "Reabrir" : "Marcar como feita"}
      title={done ? "Reabrir" : "Marcar como feita"}
      onClick={onClick}
      style={css(
        `flex: none; display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border-radius: 99px; cursor: pointer; border: 1.5px solid ${done ? GREEN : "oklch(1 0 0 / 28%)"}; background: ${done ? GREEN : "transparent"}; color: oklch(0.2 0.03 155)`,
      )}
    >
      {done && (
        <Svg size={10} weight={3}>
          <path d="M5 12l5 5 9-10"></path>
        </Svg>
      )}
    </button>
  );
}

// ---------- A lista: o to-do simples ----------
type ListProps = { tasks: Task[]; areas: string[]; agents: Agent[]; onCreate: (title: string, area: string, due: string) => void; onMove: (id: string, status: Status) => void; onSelect: (id: string) => void };

function ListView({ tasks, areas, agents, onCreate, onMove, onSelect }: ListProps) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [area, setArea] = useState("");
  const [allDone, setAllDone] = useState(false);
  const today = todayYmd();
  const open = tasks.filter((one) => one.status !== "feito");
  const groups: [string, Task[], string][] = [
    ["Atrasadas", open.filter((one) => one.due && one.due < today), RED],
    ["Hoje", open.filter((one) => one.due === today), GOLD],
    ["Próximas", open.filter((one) => one.due > today).sort((a, b) => a.due.localeCompare(b.due)), "oklch(0.86 0.008 268)"],
    ["Sem data", open.filter((one) => !one.due), MUTED],
  ];
  const done = tasks.filter((one) => one.status === "feito").sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const add = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), area, due);
    setTitle("");
  };
  const row = (task: Task) => {
    const agent = agents.find((one) => one.key === task.run?.agentKey || one.name === task.agent);
    const late = Boolean(task.due) && task.due < today && task.status !== "feito";
    const finished = task.status === "feito";
    return (
      <div
        key={task.id}
        className="m-card"
        onClick={(event) => !(event.target as HTMLElement).closest("button") && onSelect(task.id)}
        style={css("display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; cursor: pointer")}
      >
        <Check done={finished} onClick={() => onMove(task.id, finished ? "a-fazer" : "feito")} />
        <span style={css(`flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.4; color: ${finished ? MUTED : "oklch(0.95 0.006 85)"}; ${finished ? "text-decoration: line-through" : ""}`)}>{task.title}</span>
        <span style={css(`flex: none; display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${MUTED}`)}>
          {task.notes && (
            <span title="Tem notas" style={css("display: grid")}>
              <Svg size={13}>
                <path d={NOTE_ICON}></path>
              </Svg>
            </span>
          )}
          {(task.status === "com-agente" || task.status === "revisao") && (
            <Tag color={STATUS_INFO[task.status][1]}>
              {agent && <Face agent={agent} size={16} working={task.status === "com-agente"} />}
              {STATUS_INFO[task.status][0]}
            </Tag>
          )}
          {task.area && <Tag color={areaColorOf(task.area)}>{cap(task.area)}</Tag>}
          {task.due && <span style={css(`min-width: 64px; text-align: right; color: ${late ? RED : MUTED}`)}>{dueLabel(task.due)}</span>}
        </span>
      </div>
    );
  };
  return (
    <section style={css(PANEL + "; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden")}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        style={css("flex: none; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-bottom: 1px solid oklch(1 0 0 / 7%)")}
      >
        <div style={css("display: flex; gap: 8px")}>
          <input className="m-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que precisa ser feito?" style={css(FIELD + "; flex: 1; min-width: 0; height: 36px; font-size: 13.5px")} />
          <input className="m-input" type="date" value={due} onChange={(event) => setDue(event.target.value)} title="Prazo" style={css(FIELD + "; width: 140px; height: 36px")} />
          <button type="submit" className="b-btn" style={css("height: 36px; padding: 0 16px; border: 0; border-radius: 9px; background: oklch(0.82 0.15 85); color: oklch(0.2 0.02 85); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer")}>
            Adicionar
          </button>
        </div>
        {title && <AreaChips areas={areas} value={area} onChange={setArea} />}
      </form>
      <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px 14px")}>
        {!tasks.length && <Empty>Nenhuma tarefa ainda. Escreva a primeira acima.</Empty>}
        {groups.map(([label, list, color]) =>
          list.length ? (
            <div key={label} style={css("margin-bottom: 8px")}>
              <div style={css(LABEL + `; display: flex; gap: 8px; padding: 10px 12px 4px; color: ${color}`)}>
                {label}
                <span style={css(`color: ${MUTED}; letter-spacing: 0`)}>{list.length}</span>
              </div>
              {list.map(row)}
            </div>
          ) : null,
        )}
        {done.length > 0 && (
          <div>
            <button className="b-btn" onClick={() => setAllDone((was) => !was)} style={css(LABEL + `; display: flex; gap: 8px; padding: 10px 12px 4px; border: 0; background: none; cursor: pointer; color: ${GREEN}`)}>
              Concluídas <span style={css(`color: ${MUTED}; letter-spacing: 0`)}>{done.length}</span>
              {done.length > 5 && <span style={css(`color: ${MUTED}; letter-spacing: 0; text-transform: none; font-weight: 400`)}>{allDone ? "· recolher" : "· ver todas"}</span>}
            </button>
            {(allDone ? done : done.slice(0, 5)).map(row)}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- O calendário: as tarefas pelo prazo e as rotinas pela próxima execução ----------
type CalendarProps = {
  tasks: Task[];
  routines: { agent: Agent; routine: Routine }[];
  onCreate: (title: string, due: string) => void;
  onDue: (id: string, due: string) => void;
  onSelect: (id: string) => void;
};

function CalendarView({ tasks, routines, onCreate, onDue, onSelect }: CalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const today = todayYmd();
  // O dia escolhido abre na coluna da direita: as tarefas dele e um campo para criar.
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const lead = (month.getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - lead);
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((lead + length) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const undated = tasks.filter((one) => !one.due && one.status !== "feito");
  const dayTasks = tasks.filter((one) => one.due === day);
  const dayRuns = routines.filter((one) => one.routine.next && ymdOf(new Date(one.routine.next)) === day);
  const drop = (due: string) => {
    if (moving) onDue(moving, due);
    setMoving(null);
    setOverDay(null);
  };
  const chip = (task: Task, big = false) => (
    <button
      key={task.id}
      draggable
      onDragStart={() => setMoving(task.id)}
      onDragEnd={() => (setMoving(null), setOverDay(null))}
      className="b-btn c-act"
      onClick={() => onSelect(task.id)}
      title={task.title}
      style={css(
        `flex: none; display: flex; align-items: center; gap: ${big ? 9 : 5}px; width: 100%; min-height: ${big ? 32 : 18}px; padding: ${big ? "4px 8px" : "1px 5px"}; border: 0; border-radius: ${big ? 8 : 5}px; text-align: left; font: inherit; font-size: ${big ? 12.5 : 11}px; cursor: pointer; background: ${
          big ? "transparent" : `color-mix(in oklch, ${areaColorOf(task.area)} 16%, oklch(1 0 0 / 3%))`
        }; color: ${task.status === "feito" ? MUTED : "oklch(0.93 0.008 268)"}; ${task.status === "feito" ? "text-decoration: line-through" : ""}`,
      )}
    >
      <span style={css(`flex: none; width: ${big ? 7 : 5}px; height: ${big ? 7 : 5}px; border-radius: 99px; background: ${big ? areaColorOf(task.area) : STATUS_INFO[task.status][1]}`)}></span>
      <span style={css(`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${big ? "white-space: normal" : ""}`)}>{task.title}</span>
    </button>
  );
  const step = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const dayName = new Date(day + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section style={css("flex: 1; min-height: 0; display: flex; gap: 10px")}>
      <div style={css(PANEL + "; flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden")}>
        <div style={css("flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px")}>
          <span style={css("font-size: 13px; font-weight: 600; min-width: 130px")}>
            {cap(month.toLocaleDateString("pt-BR", { month: "long" }))} de {month.getFullYear()}
          </span>
          <IconPill label="Mês anterior" onClick={() => step(-1)}>
            <path d="M15 6l-6 6 6 6"></path>
          </IconPill>
          <IconPill label="Próximo mês" onClick={() => step(1)}>
            <path d="M9 6l6 6-6 6"></path>
          </IconPill>
          <button
            className="b-btn c-act"
            onClick={() => (setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), setDay(today))}
            style={css(`height: 26px; padding: 0 9px; border: 0; border-radius: 7px; background: oklch(1 0 0 / 6%); font: inherit; font-size: 12px; color: ${MUTED}; cursor: pointer`)}
          >
            Hoje
          </button>
        </div>
        <div style={css("flex: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; padding: 0 8px")}>
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((one) => (
            <span key={one} style={css(`padding: 0 6px 4px; font-size: 11.5px; color: ${MUTED}`)}>
              {one}
            </span>
          ))}
        </div>
        <div style={css(`flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(${weeks}, minmax(0, 1fr)); gap: 3px; padding: 0 8px 8px`)}>
          {days.map((date) => {
            const ymd = ymdOf(date);
            const inMonth = date.getMonth() === month.getMonth();
            const list = tasks.filter((one) => one.due === ymd);
            const runs = routines.filter((one) => one.routine.next && ymdOf(new Date(one.routine.next)) === ymd).length;
            const shown = list.slice(0, 2);
            const rest = list.length - shown.length;
            const hot = overDay === ymd;
            const picked = day === ymd;
            return (
              <div
                key={ymd}
                role="button"
                tabIndex={0}
                aria-label={date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                onDragOver={(event) => {
                  if (!moving) return;
                  event.preventDefault();
                  if (overDay !== ymd) setOverDay(ymd);
                }}
                onDrop={() => drop(ymd)}
                onClick={(event) => !(event.target as HTMLElement).closest("button") && setDay(ymd)}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), setDay(ymd))}
                className="c-row"
                style={css(
                  `min-height: 0; display: flex; flex-direction: column; gap: 2px; padding: 4px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px ${hot ? "dashed" : "solid"} ${
                    hot ? GOLD : picked ? "oklch(1 0 0 / 28%)" : "oklch(1 0 0 / 4%)"
                  }; background: ${hot ? `color-mix(in oklch, ${GOLD} 8%, transparent)` : picked ? "oklch(1 0 0 / 6%)" : inMonth ? "oklch(1 0 0 / 2%)" : "transparent"}; opacity: ${inMonth ? 1 : 0.4}`,
                )}
              >
                <span style={css("flex: none; display: flex; align-items: center; gap: 4px")}>
                  <span
                    style={css(
                      `display: grid; place-items: center; min-width: 19px; height: 19px; padding: 0 4px; box-sizing: border-box; border-radius: 99px; font-size: 11px; font-weight: 600; ${
                        ymd === today ? `background: ${GOLD}; color: oklch(0.2 0.02 85)` : `color: ${ymd < today ? MUTED : "oklch(0.88 0.008 268)"}`
                      }`,
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {runs > 0 && <span title={`${runs} rotina${runs > 1 ? "s" : ""}`} style={css(`width: 5px; height: 5px; border-radius: 99px; background: ${MUTED}`)}></span>}
                </span>
                {shown.map((task) => chip(task))}
                {rest > 0 && <span style={css(`flex: none; padding: 0 5px; font-size: 10.5px; color: ${MUTED}`)}>+{rest}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <aside
        style={css(PANEL + `; flex: none; width: 240px; display: flex; flex-direction: column; overflow: hidden`)}
      >
        <div style={css("flex: none; padding: 12px 14px 8px")}>
          <div style={css("font-size: 13px; font-weight: 600")}>{cap(dayName)}</div>
          <div style={css(`margin-top: 2px; font-size: 12px; color: ${MUTED}`)}>{day === today ? "Hoje" : dueLabel(day)}</div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onCreate(draft.trim(), day);
            setDraft("");
          }}
          style={css("flex: none; padding: 0 10px 8px")}
        >
          <input key={day} autoFocus className="m-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Nova tarefa para este dia" style={css(FIELD + "; width: 100%")} />
        </form>
        <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 10px")}>
          {dayTasks.map((task) => chip(task, true))}
          {dayRuns.map(({ agent, routine }) => (
            <div key={agent.key + routine.name} style={css(`display: flex; align-items: center; gap: 9px; padding: 6px 8px; font-size: 12.5px; color: ${MUTED}`)}>
              <Svg size={12}>
                <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"></path>
              </Svg>
              <span style={css("flex: 1; min-width: 0")}>
                {hour(routine.next!)} · {routine.name}
              </span>
            </div>
          ))}
          {!dayTasks.length && !dayRuns.length && <div style={css(`padding: 4px 8px; font-size: 12px; color: oklch(0.5 0.012 268)`)}>Nada neste dia.</div>}

          <div
            onDragOver={(event) => {
              if (!moving) return;
              event.preventDefault();
              if (overDay !== "") setOverDay("");
            }}
            onDrop={() => drop("")}
            style={css(`margin-top: 14px; padding: 6px 2px; border-radius: 9px; border: 1px ${overDay === "" ? `dashed ${GOLD}` : "solid transparent"}`)}
          >
            <div style={css(`padding: 0 6px 4px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)`)}>Sem data · {undated.length}</div>
            {undated.map((task) => chip(task, true))}
            {!undated.length && <div style={css(`padding: 2px 6px; font-size: 12px; color: oklch(0.5 0.012 268)`)}>Arraste uma tarefa do calendário para cá para tirar a data.</div>}
          </div>
        </div>
      </aside>
    </section>
  );
}

// ---------- O detalhe de uma tarefa: tudo editável, salvo direto no cérebro ----------
type Patch = Partial<{ title: string; area: string; due: string; project: string; notes: string }>;
type DetailProps = {
  task: Task;
  areas: string[];
  agents: Agent[];
  agent?: Agent;
  close: () => void;
  onSave: (patch: Patch) => void;
  onAssign: (agent: string) => void;
  onMove: (status: Status) => void;
  onReview: (decision: "approve" | "return", comment?: string) => void;
  onDelete: () => void;
  onOpen: (agent: Agent) => void;
};

function TaskDetail({ task, areas, agents, agent, close, onSave, onAssign, onMove, onReview, onDelete, onOpen }: DetailProps) {
  const [title, setTitle] = useState(task.title);
  const [project, setProject] = useState(task.project);
  const [notes, setNotes] = useState(task.notes);
  const [saved, setSaved] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = (patch: Patch) => {
    onSave(patch);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  const flush = () => {
    const patch: Patch = {};
    if (title.trim() && title !== task.title) patch.title = title;
    if (project !== task.project) patch.project = project;
    if (notes !== task.notes) patch.notes = notes;
    if (Object.keys(patch).length) save(patch);
  };
  const shut = () => {
    flush();
    close();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      shut();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const [label, color] = STATUS_INFO[task.status];
  const answer = task.run?.answer ?? "";
  const field = (name: string, child: React.ReactNode) => (
    <div style={css("display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 10px; min-height: 32px")}>
      <span style={css(`font-size: 12px; color: ${MUTED}`)}>{name}</span>
      <div style={css("min-width: 0")}>{child}</div>
    </div>
  );
  return (
    <div onMouseDown={(event) => event.target === event.currentTarget && shut()} style={css("position: absolute; inset: 0; z-index: 5; background: oklch(0.08 0.006 268 / 45%); animation: b-fade 0.15s ease-out")}>
      <section
        role="dialog"
        aria-label={"Tarefa: " + task.title}
        style={css(PANEL + "; position: absolute; top: 16px; right: 20px; bottom: 18px; width: min(460px, calc(100% - 40px)); display: flex; flex-direction: column; overflow: hidden; background: oklch(0.175 0.008 268 / 97%); animation: b-slide 0.2s ease-out")}
      >
        <header style={css("flex: none; display: flex; align-items: center; gap: 8px; padding: 14px 16px 0")}>
          <span style={css(`display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 99px; background: color-mix(in oklch, ${color} 14%, transparent); font-size: 11.5px; font-weight: 600; color: ${color}`)}>
            <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${color}`)}></span>
            {label}
          </span>
          <span style={css(`font-size: 11px; color: ${saved ? GREEN : MUTED}; transition: color 0.2s`)}>{saved ? "Salvo no cérebro" : "memory/to-dos.md"}</span>
          <button className="b-btn b-ghost" aria-label="Fechar" onClick={shut} style={css(`margin-left: auto; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: ${MUTED}; cursor: pointer`)}>
            <Svg size={15}>
              <path d="M6 6l12 12M18 6 6 18"></path>
            </Svg>
          </button>
        </header>

        <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 10px 18px 16px; display: flex; flex-direction: column; gap: 16px")}>
          <textarea
            value={title}
            onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
            onBlur={flush}
            rows={2}
            aria-label="Título"
            style={css("flex: none; width: 100%; min-height: 52px; box-sizing: border-box; resize: none; border: 0; padding: 2px 0; background: transparent; font: inherit; font-size: 18px; font-weight: 600; line-height: 1.35; color: oklch(0.96 0.006 85); outline: none")}
          />

          <div style={css("display: flex; flex-direction: column; gap: 6px")}>
            {field("Área", <AreaChips areas={areas} value={task.area} onChange={(area) => save({ area })} />)}
            {field(
              "Prazo",
              <div style={css("display: flex; align-items: center; gap: 8px")}>
                <input className="m-input" type="date" value={task.due} onChange={(event) => save({ due: event.target.value })} style={css(FIELD + "; width: 150px")} />
                {task.due && <span style={css(`font-size: 12px; color: ${task.due < todayYmd() && task.status !== "feito" ? RED : MUTED}`)}>{dueLabel(task.due)}</span>}
              </div>,
            )}
            {field("Projeto", <input className="m-input" value={project} onChange={(event) => setProject(event.target.value)} onBlur={flush} placeholder="Ex.: Turma 2" style={css(FIELD + "; width: 100%")} />)}
            {field(
              "Agente",
              agent && task.status !== "a-fazer" ? (
                <button className="b-btn" onClick={() => onOpen(agent)} style={css(`display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 3px; border-radius: 99px; border: 0; background: oklch(1 0 0 / 5%); font: inherit; font-size: 12px; color: ${colorOf(agent)}; cursor: pointer`)}>
                  <Face agent={agent} size={22} working={task.status === "com-agente"} />
                  {agent.name} · abrir conversa
                </button>
              ) : (
                <span style={css(`font-size: 12px; color: ${MUTED}`)}>Ninguém ainda</span>
              ),
            )}
            {field(
              "Criada",
              <span style={css(`font-size: 12px; color: ${MUTED}`)}>
                {task.created ? dueLabel(task.created) : "—"}
                {task.doneAt ? " · feita " + dueLabel(task.doneAt).toLowerCase() : ""}
              </span>,
            )}
          </div>

          <div>
            <div style={css(LABEL + "; margin-bottom: 6px")}>Notas</div>
            <textarea
              className="m-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={flush}
              placeholder="Contexto, links, o que precisa ser entregue… O agente recebe estas notas junto com a tarefa."
              style={css("width: 100%; box-sizing: border-box; min-height: 140px; resize: vertical; padding: 10px 12px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3%); font: inherit; font-size: 13px; line-height: 1.55; color: oklch(0.92 0.008 268); outline: none")}
            />
          </div>

          {task.status === "a-fazer" && (
            <div>
              <div style={css(LABEL + "; margin-bottom: 8px")}>Mandar para um agente</div>
              <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
                <button
                  className="b-btn c-act"
                  onClick={() => (flush(), onAssign("auto"))}
                  style={css(`display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 99px; border: 1px solid color-mix(in oklch, ${GOLD} 45%, transparent); background: color-mix(in oklch, ${GOLD} 10%, transparent); font: inherit; font-size: 12px; font-weight: 600; color: ${GOLD}; cursor: pointer`)}
                >
                  Automático
                </button>
                {agents.map((one) => (
                  <button
                    key={one.key}
                    className="b-btn c-act"
                    onClick={() => (flush(), onAssign(one.key))}
                    style={css(`display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px 0 4px; border-radius: 99px; border: 1px solid oklch(1 0 0 / 10%); background: transparent; font: inherit; font-size: 12px; color: ${colorOf(one)}; cursor: pointer`)}
                  >
                    <Face agent={one} size={22} />
                    {one.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {task.status === "com-agente" && (
            <div style={css(`display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: color-mix(in oklch, ${BLUE} 8%, transparent); font-size: 12.5px; color: oklch(0.86 0.008 268)`)}>
              <span className="c-spin"></span>
              {task.run?.status === "queued" ? "Na fila do agente…" : "O agente está trabalhando nisso."}
            </div>
          )}

          {answer && (
            <div>
              <div style={css(LABEL + "; margin-bottom: 6px")}>Entrega do agente</div>
              <div style={css(`white-space: pre-wrap; padding: 10px 12px; border-radius: 10px; background: oklch(1 0 0 / 3%); border-left: 2px solid ${agent ? colorOf(agent) : GOLD}; font-size: 12.5px; line-height: 1.55; color: oklch(0.86 0.01 268)`)}>{answer}</div>
            </div>
          )}

          {task.status === "revisao" &&
            (comment === null ? (
              <div style={css("display: flex; gap: 6px")}>
                <Pill tone="green" grow onClick={() => onReview("approve")}>
                  Aprovar
                </Pill>
                <Pill grow onClick={() => setComment("")}>
                  Devolver com ajuste
                </Pill>
              </div>
            ) : (
              <div style={css("display: flex; flex-direction: column; gap: 6px")}>
                <textarea autoFocus className="m-input" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que ajustar?" style={css(FIELD + "; height: 70px; padding: 8px 10px; resize: vertical")} />
                <div style={css("display: flex; gap: 6px")}>
                  <Pill tone="gold" grow onClick={() => (onReview("return", comment ?? ""), setComment(null))}>
                    Mandar de volta
                  </Pill>
                  <Pill onClick={() => setComment(null)}>Cancelar</Pill>
                </div>
              </div>
            ))}
        </div>

        <footer style={css("flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid oklch(1 0 0 / 7%)")}>
          {task.status === "feito" ? (
            <Pill onClick={() => onMove("a-fazer")}>Reabrir</Pill>
          ) : (
            <Pill tone="green" onClick={() => (flush(), onMove("feito"))}>
              Marcar como feita
            </Pill>
          )}
          {task.status === "com-agente" && <Pill onClick={() => onMove("a-fazer")}>Tirar do agente</Pill>}
          <button
            className="b-btn"
            onClick={() => (confirm ? onDelete() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            style={css(`margin-left: auto; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid ${confirm ? RED : "transparent"}; background: ${confirm ? `color-mix(in oklch, ${RED} 14%, transparent)` : "transparent"}; font: inherit; font-size: 12px; color: ${RED}; cursor: pointer`)}
          >
            {confirm ? "Clique de novo para apagar" : "Apagar"}
          </button>
        </footer>
      </section>
    </div>
  );
}


// ---------- Meu dia: a página da pessoa, no jeito calmo do mapa ----------
// Uma coluna no centro (anotar, foco, hoje, depois) e dois painéis pequenos nos cantos
// (prioridades; semana e diário). O diário fica em memory/diario/AAAA-MM-DD.md.
type Journal = { date: string; notes: string; priorities: { updated: string; items: { title: string; detail: string }[] } };
type MyDayProps = {
  tasks: Task[];
  areas: string[];
  routines: { agent: Agent; routine: Routine }[];
  onCreate: (title: string, area: string, due: string) => void;
  onMove: (id: string, status: Status) => void;
  onFocus: (id: string, focus: boolean) => void;
  onSelect: (id: string) => void;
};

const STAR = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";
const SOFT = "oklch(0.74 0.012 268)";
const FAINT = "oklch(0.5 0.012 268)";

function Star({ on, onClick, hide }: { on: boolean; onClick: () => void; hide?: boolean }) {
  return (
    <button
      type="button"
      className={"b-btn c-act" + (hide && !on ? " m-hide" : "")}
      aria-label={on ? "Tirar do foco" : "Colocar no foco"}
      title={on ? "Tirar do foco" : "Colocar no foco"}
      onClick={onClick}
      style={css(`flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; cursor: pointer; color: ${on ? GOLD : SOFT}`)}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        <path d={STAR}></path>
      </svg>
    </button>
  );
}

function PanelHead({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={css("display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 10px 0 13px")}>
      <span style={css(`display: grid; color: ${SOFT}`)}>
        <Svg size={15}>
          <path d={icon}></path>
        </Svg>
      </span>
      <h3 style={css("flex: 1; margin: 0; font-size: 13px; font-weight: 600")}>{title}</h3>
      {right}
    </div>
  );
}

function MyDay({ tasks, areas, routines, onCreate, onMove, onFocus, onSelect }: MyDayProps) {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"" | "salvando" | "salvo">("");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [forToday, setForToday] = useState(true);
  const [later, setLater] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overFocus, setOverFocus] = useState(false);

  useEffect(() => {
    fetch("/api/journal", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next: Journal | null) => {
        if (!next) return;
        setJournal(next);
        setNotes(next.notes);
      })
      .catch(() => null);
  }, []);
  // O diário salva sozinho logo depois de a pessoa parar de digitar.
  useEffect(() => {
    if (!journal || notes === journal.notes) return;
    setSaving("salvando");
    const timer = window.setTimeout(() => {
      fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((next) => {
          setJournal((was) => (was ? { ...was, notes: next.notes } : was));
          setSaving("salvo");
        })
        .catch(() => setSaving(""));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [notes, journal]);

  const today = todayYmd();
  const open = tasks.filter((one) => one.status !== "feito");
  const focus = open.filter((one) => one.focus).slice(0, 3);
  const todayList = open.filter((one) => !one.focus && one.due && one.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  const laterList = open.filter((one) => !one.focus && (!one.due || one.due > today)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  const doneToday = tasks.filter((one) => one.status === "feito" && one.doneAt === today);
  const planned = focus.length + todayList.length + doneToday.length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));

  const add = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), area, forToday ? today : "");
    setTitle("");
  };
  const addFocus = (id: string) => {
    if (focus.length >= 3) return;
    onFocus(id, true);
  };

  const row = (task: Task, inFocus = false) => {
    const late = task.due && task.due < today;
    return (
      <div
        key={task.id}
        draggable={!inFocus}
        onDragStart={() => setDragging(task.id)}
        onDragEnd={() => (setDragging(null), setOverFocus(false))}
        className="m-card"
        onClick={(event) => !(event.target as HTMLElement).closest("button") && onSelect(task.id)}
        style={css(`display: flex; align-items: center; gap: 11px; min-height: 40px; padding: 0 8px 0 12px; border-radius: 10px; border: 1px solid transparent; cursor: pointer`)}
      >
        <Check done={task.status === "feito"} onClick={() => onMove(task.id, task.status === "feito" ? "a-fazer" : "feito")} />
        <span style={css(`flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.4; padding: 9px 0; color: ${task.status === "feito" ? FAINT : "oklch(0.94 0.006 85)"}; ${task.status === "feito" ? "text-decoration: line-through" : ""}`)}>{task.title}</span>
        {task.notes && (
          <span title="Tem notas" style={css(`flex: none; display: grid; color: ${FAINT}`)}>
            <Svg size={13}>
              <path d={NOTE_ICON}></path>
            </Svg>
          </span>
        )}
        {task.area && (
          <span style={css(`flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: ${SOFT}`)}>
            <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${areaColorOf(task.area)}`)}></span>
            {cap(task.area)}
          </span>
        )}
        {task.due && (task.due !== today || inFocus) && <span style={css(`flex: none; font-size: 12px; color: ${late ? RED : SOFT}`)}>{dueLabel(task.due).toLowerCase()}</span>}
        {task.status !== "feito" && (inFocus ? <Star on onClick={() => onFocus(task.id, false)} /> : focus.length < 3 && <Star on={false} hide onClick={() => addFocus(task.id)} />)}
      </div>
    );
  };

  const section = (label: string, extra?: React.ReactNode) => (
    <div style={css(`display: flex; align-items: center; gap: 8px; margin: 22px 4px 6px; font-size: 12px; font-weight: 500; color: ${SOFT}`)}>
      {label}
      {extra}
    </div>
  );

  return (
    <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; margin: 0 -20px; padding: 6px 20px 30px")}>
      <div style={css("display: grid; grid-template-columns: 220px minmax(0, 600px) 240px; justify-content: center; align-items: start; gap: 28px")}>
        {/* À esquerda: as prioridades da quinzena */}
        <aside style={css("position: sticky; top: 0")}>
          {(journal?.priorities.items.length ?? 0) > 0 && (
            <section style={css(PANEL + "; padding-bottom: 8px")}>
              <PanelHead icon="M5 21V4M5 4h11l-2 4 2 4H5" title="Prioridades" />
              {journal!.priorities.items.slice(0, 4).map((one, i) => (
                <div key={one.title} title={one.detail || one.title} style={css("display: flex; gap: 10px; padding: 6px 14px")}>
                  <span style={css(`flex: none; width: 10px; font-size: 12px; font-variant-numeric: tabular-nums; color: ${FAINT}`)}>{i + 1}</span>
                  <span style={css("display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12.5px; line-height: 1.45; color: oklch(0.86 0.008 268)")}>{one.title}</span>
                </div>
              ))}
            </section>
          )}
        </aside>

        {/* No centro: o dia */}
        <main style={css("min-width: 0")}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
            style={css(PANEL + "; padding: 4px 6px 4px 14px")}
          >
            <div style={css("display: flex; align-items: center; gap: 10px")}>
              <span style={css(`display: grid; color: ${SOFT}`)}>
                <Svg size={15}>
                  <path d="M12 5v14M5 12h14"></path>
                </Svg>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Anotar uma tarefa"
                className="m-plain"
                style={css("flex: 1; min-width: 0; height: 40px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: oklch(0.95 0.006 85); outline: none")}
              />
              <button
                type="button"
                className="b-btn b-ghost"
                onClick={() => setForToday((was) => !was)}
                title="Clique para trocar"
                style={css(`flex: none; height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: oklch(1 0 0 / 6%); font: inherit; font-size: 12px; color: ${SOFT}; cursor: pointer`)}
              >
                {forToday ? "Hoje" : "Sem data"}
              </button>
            </div>
            {title && (
              <div style={css("padding: 2px 0 10px 25px")}>
                <AreaChips areas={areas} value={area} onChange={setArea} />
              </div>
            )}
          </form>

          {section(
            "Foco",
            <span style={css(`font-weight: 400; color: ${FAINT}`)}>
              {focus.length} de 3
            </span>,
          )}
          <div
            onDragOver={(event) => {
              if (!dragging || focus.length >= 3) return;
              event.preventDefault();
              setOverFocus(true);
            }}
            onDragLeave={() => setOverFocus(false)}
            onDrop={() => {
              if (dragging) addFocus(dragging);
              setDragging(null);
              setOverFocus(false);
            }}
            style={css(PANEL + `; padding: 4px; ${overFocus ? `border-color: color-mix(in oklch, ${GOLD} 55%, transparent)` : ""}`)}
          >
            {focus.map((task) => row(task, true))}
            {focus.length < 3 && (
              <div style={css(`display: flex; align-items: center; gap: 11px; min-height: 40px; padding: 0 12px; font-size: 12.5px; color: ${overFocus ? GOLD : FAINT}`)}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
                  <path d={STAR}></path>
                </svg>
                {overFocus ? "Soltar aqui" : focus.length ? "Arraste mais uma tarefa para cá" : "Arraste uma tarefa para cá, ou passe o mouse numa e clique na estrela"}
              </div>
            )}
          </div>

          {section("Hoje", todayList.length ? <span style={css(`font-weight: 400; color: ${FAINT}`)}>{todayList.length}</span> : undefined)}
          {todayList.map((task) => row(task))}
          {!todayList.length && <div style={css(`padding: 4px 12px; font-size: 12.5px; color: ${FAINT}`)}>Nada vencendo hoje.</div>}

          {laterList.length > 0 && (
            <>
              <button className="b-btn" onClick={() => setLater((was) => !was)} style={css(`display: flex; align-items: center; gap: 6px; margin: 22px 4px 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 500; color: ${SOFT}; cursor: pointer`)}>
                Depois <span style={css(`font-weight: 400; color: ${FAINT}`)}>{laterList.length}</span>
                <Svg size={12}>
                  <path d={later ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}></path>
                </Svg>
              </button>
              {later && laterList.map((task) => row(task))}
            </>
          )}

          {doneToday.length > 0 && (
            <>
              <button className="b-btn" onClick={() => setDoneOpen((was) => !was)} style={css(`display: flex; align-items: center; gap: 6px; margin: 22px 4px 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 500; color: ${SOFT}; cursor: pointer`)}>
                Feitas hoje <span style={css(`font-weight: 400; color: ${FAINT}`)}>
                  {doneToday.length} de {planned}
                </span>
                <Svg size={12}>
                  <path d={doneOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}></path>
                </Svg>
              </button>
              {doneOpen && doneToday.map((task) => row(task))}
            </>
          )}
        </main>

        {/* À direita: a semana e o diário */}
        <aside style={css("position: sticky; top: 0; display: flex; flex-direction: column; gap: 14px")}>
          <section style={css(PANEL + "; padding-bottom: 6px")}>
            <PanelHead icon="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" title="Semana" />
            {week.map((day) => {
              const list = open.filter((one) => one.due === day);
              const runs = routines.filter((one) => one.routine.next && ymdOf(new Date(one.routine.next)) === day);
              const first = list[0]?.title ?? (runs[0] ? runs[0].routine.name : "");
              const count = list.length + runs.length;
              return (
                <button
                  key={day}
                  className="b-btn c-row"
                  disabled={!list.length}
                  onClick={() => list[0] && onSelect(list[0].id)}
                  title={[...list.map((one) => one.title), ...runs.map((one) => hour(one.routine.next!) + " " + one.routine.name)].join("\n")}
                  style={css(`display: flex; align-items: center; gap: 10px; width: 100%; height: 30px; padding: 0 14px; border: 0; background: transparent; text-align: left; font: inherit; font-size: 12.5px; color: inherit; cursor: ${list.length ? "pointer" : "default"}`)}
                >
                  <span style={css(`flex: none; width: 48px; color: ${count ? "oklch(0.88 0.008 268)" : FAINT}`)}>{new Date(day + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace(".", "").replace(",", "")}</span>
                  <span style={css(`flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${count ? SOFT : FAINT}`)}>{first || "—"}</span>
                  {count > 1 && <span style={css(`flex: none; font-size: 11.5px; color: ${FAINT}`)}>+{count - 1}</span>}
                </button>
              );
            })}
          </section>

          <section style={css(PANEL + "; display: flex; flex-direction: column")}>
            <PanelHead
              icon="M6 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM5 18a2 2 0 0 1 2-2h11M9 8h6"
              title="Diário"
              right={<span style={css(`font-size: 11.5px; color: ${saving === "salvo" ? GREEN : FAINT}`)}>{saving === "salvando" ? "Salvando…" : saving === "salvo" ? "Salvo" : ""}</span>}
            />
            <textarea
              value={notes}
              disabled={!journal}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Escrever sobre hoje…"
              className="m-plain m-diary"
              style={css("display: block; width: 100%; box-sizing: border-box; height: 110px; resize: none; padding: 0 14px 14px; border: 0; background: transparent; font: inherit; font-size: 13px; line-height: 1.6; color: oklch(0.9 0.008 268); outline: none; transition: height 0.2s ease")}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

// O organograma: quem coordena quem. Arraste um agente para cima de outro para ele
// responder a esse; solte na faixa "Você" para ele responder direto a você. Os
// chefes que não são uma área (Chief of Staff, Head de…) são criados aqui; "Avisar
// os chefes" manda a cada chefe quem ele coordena (e pede ao Dr. Eggbot os que faltam).
type OrgHeadView = { key: string; name: string; title: string; mission: string; openbot: Agent["openbot"] };
type OrgResult = { at: string; sent: string[]; askedEggbot: string[]; missing: string[]; failed: string[] };
type OrgData = { heads: OrgHeadView[]; parents: Record<string, string | null>; applied: OrgResult | null };
type OrgNodeView = Agent & { title?: string; head?: boolean };
type OrgProps = { agents: Agent[]; org: OrgData | null; stateOf: (agent?: Agent) => State | undefined; onOpen: (agent: Agent) => void; changed: () => void };

function OrgChart({ agents, org, stateOf, onOpen, changed }: OrgProps) {
  const [moving, setMoving] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", title: "", mission: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Agent | null>(null);

  const heads: OrgNodeView[] = (org?.heads ?? []).map((one) => ({ key: one.key, name: one.name, mission: one.mission, openbot: one.openbot, title: one.title, head: true }));
  const nodes: OrgNodeView[] = [...heads, ...agents];
  const parents = org?.parents ?? {};
  const childrenOf = (key: string | null) => nodes.filter((one) => (parents[one.key] ?? null) === key);
  const isBelow = (key: string, maybe: string) => {
    let at: string | null = maybe;
    for (let i = 0; at && i < 50; i++) {
      if (at === key) return true;
      at = parents[at] ?? null;
    }
    return false;
  };
  const call = async (name: string, url: string, body: unknown) => {
    setBusy(name);
    setError("");
    try {
      await post(url, body);
      changed();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu certo");
      return false;
    } finally {
      setBusy("");
    }
  };
  const drop = (to: string | null) => {
    const key = moving;
    setMoving(null);
    setTarget(null);
    if (!key || key === to || (parents[key] ?? null) === to) return;
    call("move", "/api/org/move", { key, to });
  };
  const canDrop = (to: string | null) => Boolean(moving) && moving !== to && !(to && isBelow(moving!, to));
  const leads = nodes.filter((one) => childrenOf(one.key).length > 0);
  const applied = org?.applied;

  const branch = (node: OrgNodeView): React.ReactNode => {
    const kids = childrenOf(node.key);
    const color = node.head ? GOLD : colorOf(node);
    const hot = target === node.key;
    const sure = confirm === node.key;
    return (
      <li key={node.key}>
        <div
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setMoving(node.key);
          }}
          onDragEnd={() => (setMoving(null), setTarget(null))}
          onDragOver={(event) => {
            if (!canDrop(node.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (target !== node.key) setTarget(node.key);
          }}
          onDrop={(event) => {
            event.stopPropagation();
            drop(node.key);
          }}
          onClick={() => !node.head && node.openbot && onOpen(node)}
          title={node.head ? node.mission || node.name : node.openbot ? "Abrir a conversa com " + node.name : node.name + " ainda não está no OpenBot"}
          className="m-tile"
          style={css(
            `position: relative; width: 150px; box-sizing: border-box; padding: 12px 10px 10px; border-radius: 12px; text-align: center; cursor: ${node.head || !node.openbot ? "grab" : "pointer"}; border: 1px ${hot ? "dashed" : "solid"} ${
              hot ? GOLD : "oklch(1 0 0 / 10%)"
            }; background: ${hot ? `color-mix(in oklch, ${GOLD} 10%, oklch(0.185 0.008 268))` : "oklch(0.185 0.008 268 / 94%)"}; opacity: ${moving === node.key ? 0.45 : node.openbot ? 1 : 0.75}`,
          )}
        >
          <span style={css("display: grid; place-items: center")}>
            {node.head && !node.openbot ? (
              <span style={css(`display: grid; place-items: center; width: 34px; height: 34px; border-radius: 99px; border: 1px dashed color-mix(in oklch, ${GOLD} 55%, transparent); color: ${GOLD}`)}>
                <Svg size={15}>
                  <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"></path>
                </Svg>
              </span>
            ) : (
              <Face agent={node} size={34} working={Boolean(stateOf(node)?.working)} />
            )}
          </span>
          <span style={css(`display: block; margin-top: 8px; font-size: 10.5px; font-weight: 650; letter-spacing: 0.16em; text-transform: uppercase; color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)}>{node.name}</span>
          <span style={css(`display: block; margin-top: 3px; font-size: 11px; color: ${MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)}>
            {node.head ? node.title || "Chefe" : kids.length ? `Coordena ${kids.length}` : "Departamento"}
            {!node.openbot && " · fora do OpenBot"}
          </span>
          {!node.head && (
            <button
              className="b-btn"
              aria-label={"Ficha de " + node.name}
              title="Ficha: skills, conectores e regras"
              onClick={(event) => {
                event.stopPropagation();
                setFicha(node);
              }}
              style={css(`position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: ${MUTED}; cursor: pointer`)}
            >
              <Svg size={13}>
                <path d="M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4"></path>
              </Svg>
            </button>
          )}
          {node.head && (
            <button
              className="b-btn"
              aria-label={sure ? "Clique de novo para tirar" : "Tirar " + node.name}
              title={sure ? "Clique de novo para tirar" : "Tirar do organograma"}
              onClick={(event) => {
                event.stopPropagation();
                if (sure) {
                  setConfirm(null);
                  call("remove", "/api/org/head/delete", { key: node.key });
                } else setConfirm(node.key);
              }}
              onBlur={() => setConfirm(null)}
              style={css(`position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: ${sure ? RED : MUTED}; cursor: pointer`)}
            >
              <Svg size={12}>
                <path d={sure ? "M5 12l5 5 9-10" : "M6 6l12 12M18 6 6 18"}></path>
              </Svg>
            </button>
          )}
        </div>
        {kids.length > 0 && <ul>{kids.map(branch)}</ul>}
      </li>
    );
  };

  return (
    <section style={css(PANEL + "; position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden")}>
      {ficha && <FichaPanel agent={ficha} close={() => (setFicha(null), changed())} />}
      <div style={css("flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid oklch(1 0 0 / 6%)")}>
        <div style={css("flex: 1; min-width: 0")}>
          <div style={css("font-size: 13px; font-weight: 600")}>Organograma do time</div>
          <div style={css(`margin-top: 2px; font-size: 12px; color: ${MUTED}`)}>Arraste um agente para cima de outro para ele responder a esse. O ícone no canto abre a ficha dele.</div>
        </div>
        <Pill onClick={() => setAdding((was) => !was)}>{adding ? "Cancelar" : "+ Novo chefe"}</Pill>
        <Pill tone="gold" onClick={() => leads.length > 0 && busy !== "apply" && call("apply", "/api/org/apply", {})}>
          {busy === "apply" ? "Avisando…" : "Avisar os chefes"}
        </Pill>
      </div>

      {adding && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await call("add", "/api/org/head", form)) {
              setForm({ name: "", title: "", mission: "" });
              setAdding(false);
            }
          }}
          style={css("flex: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 14px; border-bottom: 1px solid oklch(1 0 0 / 6%)")}
        >
          <input autoFocus className="m-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome (ex.: Chief of Staff)" style={css(FIELD + "; flex: 1 1 180px")} />
          <input className="m-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Cargo (opcional)" style={css(FIELD + "; flex: 1 1 140px")} />
          <input className="m-input" value={form.mission} onChange={(event) => setForm({ ...form, mission: event.target.value })} placeholder="O que ele faz (opcional)" style={css(FIELD + "; flex: 3 1 260px")} />
          <button
            className="b-btn"
            disabled={busy === "add" || !form.name.trim()}
            style={css(`height: 32px; padding: 0 14px; border: 0; border-radius: 9px; background: ${GOLD}; color: oklch(0.2 0.02 85); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; opacity: ${form.name.trim() ? 1 : 0.5}`)}
          >
            Criar
          </button>
        </form>
      )}

      {error && <div style={css(`flex: none; padding: 8px 14px; font-size: 12.5px; color: ${RED}`)}>{error}</div>}
      {applied && (
        <div style={css(`flex: none; padding: 8px 14px; font-size: 12px; line-height: 1.5; color: ${MUTED}; border-bottom: 1px solid oklch(1 0 0 / 6%)`)}>
          Avisados {ago(applied.at)}: {applied.sent.length ? applied.sent.join(", ") : "nenhum"}.
          {applied.askedEggbot.length > 0 && ` Pedido ao Dr. Eggbot criar: ${applied.askedEggbot.join(", ")}.`}
          {applied.missing.length > 0 && <span style={css(`color: ${GOLD}`)}> Fora do OpenBot e sem o Dr. Eggbot para criar: {applied.missing.join(", ")}.</span>}
          {applied.failed.length > 0 && <span style={css(`color: ${RED}`)}> Não consegui avisar: {applied.failed.join(", ")}.</span>}
        </div>
      )}

      <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow: auto; padding: 18px 16px 24px")}>
        <div
          onDragOver={(event) => {
            if (!canDrop(null)) return;
            event.preventDefault();
            if (target !== "") setTarget("");
          }}
          onDragLeave={() => target === "" && setTarget(null)}
          onDrop={() => drop(null)}
          style={css(`margin: 0 auto; width: fit-content; padding: 6px 16px; border-radius: 99px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${target === "" ? GOLD : "oklch(0.86 0.008 268)"}; border: 1px ${target === "" ? "dashed " + GOLD : "solid oklch(1 0 0 / 12%)"}`)}
        >
          {moving ? "Solte aqui: responde a você" : "Você"}
        </div>
        {nodes.length > 0 ? (
          <ul className="org" style={css("width: max-content; min-width: 100%; margin: 0 auto")}>
            {childrenOf(null).map(branch)}
          </ul>
        ) : (
          <div style={css(`margin-top: 30px; text-align: center; font-size: 12.5px; color: ${MUTED}`)}>Desenhe o time em Agentes › Configurar para ver o organograma.</div>
        )}
      </div>
    </section>
  );
}

// A ficha de um agente: as skills que ele usa (as da área vêm marcadas), os
// conectores e as regras próprias. Salvar muda o plano (o Configurar tudo e o arquivo
// de importação já saem com a ficha); "Aplicar no OpenBot" manda a ficha ao agente.
type FichaData = {
  ficha: { skillsAdd: string[]; skillsRemove: string[]; connectors: string[]; rules: string[]; appliedAt: string | null };
  base: { skills: string[]; limits: string[]; tools: string[] };
  skills: { slug: string; label: string; area: string; routine: boolean }[];
  apps: string[];
};
function FichaPanel({ agent, close }: { agent: Agent; close: () => void }) {
  const [data, setData] = useState<FichaData | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [connectors, setConnectors] = useState<string[]>([]);
  const [rules, setRules] = useState("");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/agents/ficha?key=" + encodeURIComponent(agent.key), { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Não consegui ler a ficha");
        return body as FichaData;
      })
      .then((next) => {
        setData(next);
        setChosen(new Set([...next.base.skills.filter((one) => !next.ficha.skillsRemove.includes(one)), ...next.ficha.skillsAdd]));
        setConnectors(next.ficha.connectors);
        setRules(next.ficha.rules.join("\n"));
      })
      .catch((err) => setError(err.message));
  }, [agent.key]);

  const save = async (apply: boolean) => {
    if (!data) return;
    setBusy(apply ? "apply" : "save");
    setError("");
    setNote("");
    try {
      const base = new Set(data.base.skills);
      await post("/api/agents/ficha", {
        key: agent.key,
        skillsAdd: [...chosen].filter((one) => !base.has(one)),
        skillsRemove: data.base.skills.filter((one) => !chosen.has(one)),
        connectors,
        rules: rules.split("\n").map((one) => one.trim()).filter(Boolean),
      });
      if (apply) await post("/api/agents/ficha/apply", { key: agent.key });
      setNote(apply ? `Ficha enviada ao ${agent.name} no OpenBot.` : "Ficha salva. O Configurar tudo e o arquivo de importação já saem com ela.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu certo");
    } finally {
      setBusy("");
    }
  };

  const term = query.trim().toLowerCase();
  const visible = (data?.skills ?? []).filter((one) => !term || (one.label + " " + one.slug + " " + one.area).toLowerCase().includes(term));
  const own = visible.filter((one) => data?.base.skills.includes(one.slug));
  const others = visible.filter((one) => !data?.base.skills.includes(one.slug));
  const toggle = (slug: string) =>
    setChosen((was) => {
      const next = new Set(was);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  const addConnector = (name: string) => {
    const clean = name.trim();
    if (clean && !connectors.includes(clean)) setConnectors([...connectors, clean]);
    setExtra("");
  };
  const suggestions = ["Segundo Cérebro", ...(data?.apps ?? [])].filter((one) => !connectors.includes(one));
  const row = (one: FichaData["skills"][number]) => (
    <label key={one.slug} className="c-row" style={css("display: flex; align-items: center; gap: 9px; padding: 5px 8px; border-radius: 8px; font-size: 12.5px; cursor: pointer")}>
      <input type="checkbox" checked={chosen.has(one.slug)} onChange={() => toggle(one.slug)} style={css("accent-color: oklch(0.86 0.12 85)")} />
      <span style={css("flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{one.label}</span>
      <span style={css(`flex: none; font-size: 11px; color: ${MUTED}`)}>{one.routine ? "rotina · " : ""}{one.area || "empresa"}</span>
    </label>
  );

  return (
    <div style={css("position: absolute; inset: 0; z-index: 3; display: flex; justify-content: flex-end; background: oklch(0.1 0.006 268 / 45%)")} onClick={close}>
      <aside onClick={(event) => event.stopPropagation()} style={css(PANEL + "; width: min(440px, 100%); height: 100%; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px 0 0 14px")}>
        <div style={css("flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid oklch(1 0 0 / 6%)")}>
          <Face agent={agent} size={30} />
          <div style={css("flex: 1; min-width: 0")}>
            <div style={css(`font-size: 11px; font-weight: 650; letter-spacing: 0.16em; text-transform: uppercase; color: ${colorOf(agent)}`)}>{agent.name}</div>
            <div style={css(`margin-top: 2px; font-size: 12px; color: ${MUTED}`)}>Ficha do agente{data?.ficha.appliedAt ? " · enviada " + ago(data.ficha.appliedAt) : ""}</div>
          </div>
          <IconPill label="Fechar" onClick={close}>
            <path d="M6 6l12 12M18 6 6 18"></path>
          </IconPill>
        </div>

        <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 16px")}>
          {!data && !error && <div style={css(`font-size: 12.5px; color: ${MUTED}`)}>Lendo a ficha…</div>}
          {data && (
            <>
              {agent.mission && <div style={css("font-size: 12.5px; line-height: 1.5; color: oklch(0.8 0.01 268)")}>{agent.mission}</div>}

              <section style={css("display: flex; flex-direction: column; gap: 6px")}>
                <div style={css("display: flex; align-items: center; gap: 8px")}>
                  <span style={css("font-size: 13px; font-weight: 600")}>Skills</span>
                  <span style={css(`font-size: 12px; color: ${MUTED}`)}>{chosen.size} marcadas</span>
                </div>
                <input className="m-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar skill" style={css(FIELD)} />
                {own.length > 0 && <div style={css(`padding: 4px 8px 0; font-size: 11.5px; color: ${MUTED}`)}>Da área dele</div>}
                {own.map(row)}
                {others.length > 0 && <div style={css(`padding: 6px 8px 0; font-size: 11.5px; color: ${MUTED}`)}>Outras do cérebro</div>}
                {others.map(row)}
              </section>

              <section style={css("display: flex; flex-direction: column; gap: 8px")}>
                <div>
                  <div style={css("font-size: 13px; font-weight: 600")}>Conectores</div>
                  <div style={css(`margin-top: 2px; font-size: 12px; color: ${MUTED}`)}>{connectors.length ? "Ele usa só estes; para outro, pede antes." : "Sem escolha, ele usa os que o OpenBot tiver."}</div>
                </div>
                <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
                  {connectors.map((one) => (
                    <button key={one} className="b-btn" onClick={() => setConnectors(connectors.filter((c) => c !== one))} title="Tirar" style={css(`height: 26px; padding: 0 10px; border-radius: 99px; border: 1px solid ${GOLD}; background: oklch(0.86 0.12 85 / 10%); font: inherit; font-size: 12px; color: ${GOLD}; cursor: pointer`)}>
                      {one} ×
                    </button>
                  ))}
                  {suggestions.slice(0, 8).map((one) => (
                    <button key={one} className="b-btn" onClick={() => addConnector(one)} style={css(`height: 26px; padding: 0 10px; border-radius: 99px; border: 1px dashed oklch(1 0 0 / 16%); background: transparent; font: inherit; font-size: 12px; color: ${MUTED}; cursor: pointer`)}>
                      + {one}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addConnector(extra);
                  }}
                >
                  <input className="m-input" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="Outro conector (ex.: Pipedrive) e Enter" style={css(FIELD + "; width: 100%")} />
                </form>
              </section>

              <section style={css("display: flex; flex-direction: column; gap: 8px")}>
                <div>
                  <div style={css("font-size: 13px; font-weight: 600")}>Regras</div>
                  <div style={css(`margin-top: 2px; font-size: 12px; color: ${MUTED}`)}>Uma por linha. Entram nas instruções dele, junto das regras de sempre.</div>
                </div>
                <textarea
                  value={rules}
                  onChange={(event) => setRules(event.target.value)}
                  rows={4}
                  placeholder={"Ex.: Nunca enviar proposta sem minha aprovação\nResponder em até 3 linhas"}
                  style={css("box-sizing: border-box; width: 100%; resize: vertical; padding: 9px 10px; border-radius: 9px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3.5%); font: inherit; font-size: 12.5px; line-height: 1.5; color: oklch(0.95 0.006 85); outline: none; color-scheme: dark")}
                />
              </section>
            </>
          )}
          {error && <div style={css(`font-size: 12.5px; color: ${RED}`)}>{error}</div>}
          {note && <div style={css(`font-size: 12.5px; color: ${GREEN}`)}>{note}</div>}
        </div>

        {data && (
          <div style={css("flex: none; display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid oklch(1 0 0 / 6%)")}>
            <Pill grow onClick={() => !busy && save(false)}>{busy === "save" ? "Salvando…" : "Salvar"}</Pill>
            <Pill grow tone="gold" onClick={() => !busy && save(true)}>{busy === "apply" ? "Enviando…" : "Salvar e aplicar no OpenBot"}</Pill>
          </div>
        )}
      </aside>
    </div>
  );
}
