// Conversar com os agentes. O time à esquerda (um por área do cérebro), a conversa no
// meio e, ao lado, o que o agente cuida. A conversa é a do próprio OpenBot (lida do
// banco dele pelo servidor): o que foi escrito aqui ou lá, os passos que o agente narra
// enquanto trabalha, a resposta e os eventos. O que só existe aqui: abrir no mapa as
// páginas que o agente cita, salvar uma resposta como nota do cérebro e passar uma
// resposta para outro agente.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { css } from "../css";
import { KindIcon, Svg } from "./Icons";
import { areaAlias } from "../brain/areaStyle";
import { TeamSetup } from "./TeamSetup";
import { BotFace } from "./BotFace";

type Skill = { label: string; slug: string; schedule?: string };
type Agent = { key: string; name: string; owns?: string[]; mission: string; triggers: string[]; skills: Skill[]; routines: Skill[]; openbot: { id: string; name: string; avatar?: { seed: string; hue: number | null } } | null };
type Item = { id: string; kind: "voce" | "agente" | "passo" | "evento" | "papel"; text: string; at: string; turn: string | null; detail?: string };
type Chat = { items: Item[]; working: boolean; turnStarted: string | null; source: "openbot" | "app"; pending: { prompts: any[]; approvals: any[] } | null };
type Bot = { connected: boolean; reason: "off" | "no-agents" | "error" | null };
type Summary = Record<string, { text: string; role: string; at: string; working: boolean } | null>;

const SEEN = "fos-chat-visto";
const LAST = "fos-chat-agente";
const EMPTY: Chat = { items: [], working: false, turnStarted: null, source: "openbot", pending: null };

const areaOf = (agent: Agent) => agent.owns?.[0] ?? areaAlias(agent.name) ?? "";
const iconOf = (agent: Agent) => {
  const area = areaOf(agent);
  return !area || area === "empresa" ? "company" : area;
};
// A cor do nó no mapa: a da área; a Empresa é o branco do centro.
const colorOf = (agent: Agent) => {
  const area = agent.owns?.[0];
  return !area || area === "empresa" ? "oklch(0.94 0.006 85)" : `var(--area-${area})`;
};
// O vidro dos cartões do mapa: a conversa flutua sobre ele, não numa janela à parte.
const GLASS =
  "border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.175 0.008 268 / 84%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 24px 60px oklch(0 0 0 / 50%)";
// Os rótulos do mapa: maiúsculas espaçadas.
const LABEL = "font-size: 10.5px; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase";
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const when = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  if (sameDay(date, today)) return hour(iso);
  if (sameDay(date, new Date(today.getTime() - 86400000))) return "ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, new Date(today.getTime() - 86400000))) return "Ontem";
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
};
const plain = (text: string) => text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim();
const skillTask = (skill: Skill) => `Rode a skill \`${skill.slug}\` e siga o passo a passo dela. No fim, me diga em poucas linhas o que fez.`;
const noteId = (t: number) => {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
};

// A resposta em HTML, com as páginas do cérebro citadas viradas em links do mapa.
// Só o que está dentro de uma pasta do wiki: CLAUDE.md, AGENTS.md e as pastas de fora do
// wiki (memory/, fontes/…) não são páginas do mapa.
const PAGE = /^(?:wiki\/)?((?!memory\/|fontes\/|sessoes\/|skills\/)[\w-]+\/[\w./-]+\.md)$/;
function render(text: string) {
  const html = marked.parse(text, { async: false, gfm: true }) as string;
  return html
    .replace(/<code>([^<]+)<\/code>/g, (whole, inner: string) => {
      const match = inner.trim().match(PAGE);
      return match ? `<a href="#" class="c-page" data-page="${match[1]}">${inner}</a>` : whole;
    })
    .replace(/<a href="([^"]+\.md)">/g, (whole, href: string) => {
      const match = href.match(PAGE);
      return match ? `<a href="#" class="c-page" data-page="${match[1]}">` : whole;
    });
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Não deu certo");
  return body;
}

type Props = { start?: string | null; configure?: boolean; close: () => void; openPage: (path: string) => void; goArea: (area: string) => void; noted: () => void };

export function AgentChat({ start, configure = false, close, openPage, goArea, noted }: Props) {
  // A configuração abre no lugar da conversa, no mesmo cartão.
  const [view, setView] = useState<"conversa" | "configurar">(configure ? "configurar" : "conversa");
  const setup = () => setView("configurar");
  // Ao abrir: se ainda falta configurar (OpenBot fechado, Local scripts desligado ou o
  // time não montado), o painel de configurar já abre ao lado da conversa.
  useEffect(() => {
    Promise.all([fetch("/api/openbot/setup", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)), fetch("/api/openbot/team", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null))])
      .then(([setupState, team]) => {
        if (!setupState) return;
        if (!setupState.running || !setupState.localScripts || team?.status !== "pronto") setView("configurar");
      })
      .catch(() => null);
  }, []);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [bot, setBot] = useState<Bot>({ connected: false, reason: null });
  const [current, setCurrent] = useState("");
  const [chat, setChat] = useState<Chat>(EMPTY);
  const [summary, setSummary] = useState<Summary>({});
  const [seen, setSeen] = useState<Record<string, string>>(() => readJson(SEEN, {}));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [skillsOpen, setSkillsOpen] = useState(false);
  // O painel do agente (missão, áreas, rotinas, skills) começa fechado; o botão do topo abre.
  const [side, setSide] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const say = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((was) => (was === text ? "" : was)), 2400);
  };

  const loadAgents = useCallback(() => {
    fetch("/api/agents", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setAgents(data.agents);
        setBot(data.openbot);
        setCurrent((was) => {
          if (was && data.agents.some((one: Agent) => one.key === was)) return was;
          const wanted = start ? data.agents.find((one: Agent) => one.owns?.includes(start) || one.name === start) : null;
          const last = readJson<string>(LAST, "");
          return (wanted ?? data.agents.find((one: Agent) => one.key === last) ?? data.agents[0])?.key ?? "";
        });
      })
      .catch(() => setAgents([]));
    fetch("/api/chat/summary", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSummary(data))
      .catch(() => null);
  }, [start]);
  useEffect(() => {
    loadAgents();
    const timer = window.setInterval(loadAgents, 5000);
    return () => window.clearInterval(timer);
  }, [loadAgents]);

  const agent = agents?.find((one) => one.key === current) ?? null;

  const loadChat = useCallback(() => {
    if (!current) return;
    fetch("/api/chat?agent=" + encodeURIComponent(current), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setChat({ ...EMPTY, ...data }))
      .catch(() => null);
  }, [current]);
  useEffect(() => {
    setChat(EMPTY);
    setError("");
    setSkillsOpen(false);
    stick.current = true;
    loadChat();
    input.current?.focus();
    try {
      localStorage.setItem(LAST, JSON.stringify(current));
    } catch {
      /* sem localStorage */
    }
  }, [loadChat]);
  // Trabalhando: a conversa se refaz a cada segundo e meio; parado, a cada 5 s (para o
  // que alguém escrever direto no OpenBot também aparecer aqui).
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        loadChat();
        setNow(Date.now());
      },
      chat.working ? 1500 : 5000,
    );
    return () => window.clearInterval(timer);
  }, [chat.working, loadChat]);
  // Desce junto com a conversa, a não ser que a pessoa tenha subido para ler.
  useEffect(() => {
    const box = scroller.current;
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [chat.items.length, chat.items[chat.items.length - 1]?.text, chat.working, chat.pending]);

  // A conversa aberta conta como lida.
  const lastAt = chat.items[chat.items.length - 1]?.at;
  useEffect(() => {
    if (!current || !lastAt || seen[current] === lastAt) return;
    const next = { ...seen, [current]: lastAt };
    setSeen(next);
    try {
      localStorage.setItem(SEEN, JSON.stringify(next));
    } catch {
      /* sem localStorage */
    }
  }, [current, lastAt]);

  const send = async (text: string) => {
    if (!agent || !text.trim() || sending) return;
    setSending(true);
    setError("");
    setSkillsOpen(false);
    stick.current = true;
    try {
      await post("/api/chat", { agent: agent.key, text });
      setDraft((was) => ({ ...was, [agent.key]: "" }));
      setChat((was) => ({ ...was, working: true, turnStarted: new Date().toISOString(), items: [...was.items, { id: "local-" + Date.now(), kind: "voce", text: text.trim(), at: new Date().toISOString(), turn: null }] }));
      window.setTimeout(loadChat, 600);
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui enviar");
    } finally {
      setSending(false);
    }
  };
  const approve = async (requestId: string, decision: "accept" | "decline") => {
    if (!agent) return;
    await post("/api/chat/approve", { agent: agent.key, requestId, decision }).catch((err) => setError(err.message));
    loadChat();
  };
  const answer = async (requestId: string, questionId: string, label: string) => {
    if (!agent) return;
    await post("/api/chat/answer", { agent: agent.key, requestId, answers: { [questionId]: [label] } }).catch((err) => setError(err.message));
    loadChat();
  };
  const saveNote = async (item: Item) => {
    if (!agent) return;
    const title = `${agent.name}: ${plain(item.text).slice(0, 60)}`;
    const body = `> Resposta do agente ${agent.name}, ${new Date(item.at).toLocaleString("pt-BR")}\n\n${item.text}`;
    try {
      await post("/api/notes", { id: noteId(Date.now()), title, body });
      noted();
      say("Salvo nas Notas do cérebro");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui salvar a nota");
    }
  };
  const forward = (item: Item, target: Agent) => {
    if (!agent) return;
    const text = `O agente ${agent.name} respondeu isto:\n\n${item.text.slice(0, 3000)}\n\nO que você acha, da sua área (${target.name})?`;
    setDraft((was) => ({ ...was, [target.key]: text }));
    setCurrent(target.key);
  };

  const list = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (agents ?? [])
      .map((one, index) => ({ one, index, info: summary[one.key] }))
      .filter(({ one }) => !term || (one.name + " " + one.mission).toLowerCase().includes(term))
      .sort((a, b) => Number(b.info?.working ?? 0) - Number(a.info?.working ?? 0) || (b.info?.at ?? "").localeCompare(a.info?.at ?? "") || a.index - b.index);
  }, [agents, summary, filter]);

  // A conversa em blocos: o dia, a mensagem da pessoa, o trabalho do agente (passos +
  // resposta) e os eventos (vários iguais seguidos viram um só).
  type Block =
    | { kind: "dia"; label: string; key: string }
    | { kind: "voce" | "papel"; item: Item; key: string }
    | { kind: "eventos"; items: Item[]; key: string }
    | { kind: "turno"; steps: Item[]; answers: Item[]; key: string; live: boolean };
  const blocks = useMemo(() => {
    const out: Block[] = [];
    let lastDay = "";
    for (const item of chat.items) {
      const label = dayLabel(item.at);
      if (label !== lastDay) {
        out.push({ kind: "dia", label, key: "d" + item.id });
        lastDay = label;
      }
      const prev = out[out.length - 1];
      if (item.kind === "voce" || item.kind === "papel") out.push({ kind: item.kind, item, key: item.id });
      else if (item.kind === "evento") {
        if (prev?.kind === "eventos" && prev.items[0].text.split(":")[0] === item.text.split(":")[0]) prev.items.push(item);
        else out.push({ kind: "eventos", items: [item], key: item.id });
      } else if (prev?.kind === "turno" && (item.turn === null || prev.steps.concat(prev.answers)[0]?.turn === item.turn)) {
        if (item.kind === "passo") prev.steps.push(item);
        else prev.answers.push(item);
      } else out.push({ kind: "turno", steps: item.kind === "passo" ? [item] : [], answers: item.kind === "agente" ? [item] : [], key: item.id, live: false });
    }
    // O turno em andamento: o último bloco, se é do agente; senão um bloco vazio.
    if (chat.working) {
      const last = out[out.length - 1];
      if (last?.kind === "turno") last.live = true;
      else out.push({ kind: "turno", steps: [], answers: [], key: "vivo", live: true });
    }
    return out;
  }, [chat.items, chat.working]);

  const live = Boolean(agent?.openbot);
  const text = agent ? (draft[agent.key] ?? "") : "";
  const color = agent ? colorOf(agent) : "oklch(0.66 0.13 255)";
  const offline = !bot.connected
    ? bot.reason === "no-agents"
      ? "O OpenBot está aberto, mas nenhum agente deste servidor tem Local scripts ligado."
      : bot.reason === "error"
        ? "O OpenBot não respondeu."
        : "O OpenBot não está aberto."
    : "";
  const seconds = chat.turnStarted ? Math.max(0, Math.round((now - new Date(chat.turnStarted).getTime()) / 1000)) : 0;
  const others = (agents ?? []).filter((one) => one.key !== current && one.openbot);

  return (
    <div
      role="dialog"
      aria-label="Conversar com os agentes"
      style={css("position: absolute; inset: 0; z-index: 30; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 14px; background: oklch(0.1 0.006 268 / 52%); backdrop-filter: blur(5px); animation: b-rise 0.2s ease-out")}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div style={css("display: flex; gap: 12px; width: min(1420px, 100%); height: min(880px, 100%); min-height: 0")}>
        {/* O time */}
        <nav aria-label="Agentes" style={css(GLASS + "; flex: none; width: 300px; display: flex; flex-direction: column; overflow: hidden")}>
          <div style={css("display: flex; align-items: center; gap: 8px; padding: 16px 12px 10px 18px")}>
            <div style={css("flex: 1; min-width: 0")}>
              <div style={css("font-size: 14px; font-weight: 600; letter-spacing: 0.34em; text-transform: uppercase")}>Agentes</div>
              <div style={css("margin-top: 4px; font-size: 11.5px; color: oklch(0.62 0.012 268)")}>
                <span style={css("display: inline-flex; align-items: center; gap: 6px")}>
                  <OpenBotMark size={14} />
                  {bot.connected ? `${(agents ?? []).filter((one) => one.openbot).length} no OpenBot` : "OpenBot desconectado"}
                </span>
              </div>
            </div>
            <button
              className="b-btn"
              aria-pressed={view === "configurar"}
              title="Configurar o time e o OpenBot"
              onClick={() => setView(view === "configurar" ? "conversa" : "configurar")}
              style={css(
                `flex: none; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: 9px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${
                  view === "configurar" ? "transparent" : "oklch(1 0 0 / 12%)"
                }; background: ${view === "configurar" ? "oklch(0.82 0.15 85)" : "transparent"}; color: ${view === "configurar" ? "oklch(0.2 0.02 85)" : "oklch(0.88 0.008 268)"}`,
              )}
            >
              <Svg size={13}>
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>
              </Svg>
              Configurar
            </button>
          </div>
          <div style={css("padding: 0 12px 8px")}>
            <label style={css("display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid oklch(1 0 0 / 8%); background: oklch(1 0 0 / 3%); color: oklch(0.6 0.012 268)")}>
              <Svg size={14}>
                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-3.5-3.5"></path>
              </Svg>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Buscar"
                style={css("flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 13px; color: oklch(0.95 0.006 85); outline: none")}
              />
            </label>
          </div>
          <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; padding: 2px 8px 12px")}>
            {agents === null && <div style={css("padding: 14px; font-size: 12.5px; color: oklch(0.6 0.012 268)")}>Carregando…</div>}
            {list.map(({ one, info }) => {
              const on = one.key === current;
              const unread = Boolean(info && info.role === "agente" && !info.working && info.text && seen[one.key] !== info.at && !on);
              const preview = !one.openbot ? "Fora do OpenBot" : info?.working ? "Trabalhando…" : info ? (info.role === "voce" ? "Você: " : "") + plain(info.text) : one.mission || "Sem conversa ainda";
              return (
                <button
                  key={one.key}
                  className="b-btn c-row"
                  onClick={() => setCurrent(one.key)}
                  style={css(
                    `display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 10px; border: 0; border-radius: 10px; text-align: left; font: inherit; cursor: pointer; background: ${on ? "oklch(1 0 0 / 7%)" : "transparent"}; color: oklch(0.95 0.006 85)`,
                  )}
                >
                  <Avatar agent={one} size={38} working={Boolean(info?.working)} online={Boolean(one.openbot)} />
                  <span style={css("flex: 1; min-width: 0")}>
                    <span style={css("display: flex; align-items: baseline; gap: 6px")}>
                      <span style={css(`flex: 1; min-width: 0; font-size: 13.5px; font-weight: ${unread ? 700 : 600}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)}>{one.name}</span>
                      {info && <span style={css(`flex: none; font-size: 11px; color: ${unread ? "oklch(0.86 0.12 85)" : "oklch(0.56 0.012 268)"}`)}>{when(info.at)}</span>}
                    </span>
                    <span style={css("display: flex; align-items: center; gap: 6px; margin-top: 2px")}>
                      <span
                        style={css(
                          `flex: 1; min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${info?.working ? "oklch(0.86 0.1 85)" : unread ? "oklch(0.88 0.008 268)" : "oklch(0.6 0.012 268)"}`,
                        )}
                      >
                        {preview}
                      </span>
                      {unread && <span style={css("flex: none; width: 8px; height: 8px; border-radius: 99px; background: oklch(0.82 0.15 85)")}></span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* A conversa */}
        <section style={css(GLASS + "; position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden")}>
          <header style={css(`flex: none; display: flex; align-items: center; gap: 12px; height: 64px; padding: 0 12px 0 20px; border-bottom: 1px solid oklch(1 0 0 / 7%)`)}>
            {agent && <Avatar agent={agent} size={36} working={chat.working} online={live} />}
            <div style={css("flex: 1; min-width: 0")}>
              <div style={css(`display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: ${color}`)}>
                {agent?.name ?? ""}
                {agent && <StatusPill live={live} working={chat.working} seconds={seconds} />}
              </div>
              {agent?.mission && <div style={css("margin-top: 2px; font-size: 12px; color: oklch(0.62 0.012 268); white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{agent.mission}</div>}
            </div>
            <IconButton label={side ? "Esconder detalhes" : "Mostrar detalhes"} on={side} onClick={() => setSide((was) => !was)}>
              <rect x="3" y="4" width="18" height="16" rx="2"></rect>
              <path d="M15 4v16"></path>
            </IconButton>
            <IconButton label="Fechar" onClick={close}>
              <path d="M6 6l12 12M18 6 6 18"></path>
            </IconButton>
          </header>

          <div
            ref={scroller}
            className="b-scroll"
            onScroll={(event) => {
              const box = event.currentTarget;
              stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
            }}
            onClick={(event) => {
              const link = (event.target as HTMLElement).closest("a.c-page") as HTMLAnchorElement | null;
              if (!link) return;
              event.preventDefault();
              openPage(link.dataset.page ?? "");
            }}
            style={css("flex: 1; min-height: 0; overflow-y: auto")}
          >
            <div style={css("max-width: 780px; margin: 0 auto; padding: 20px 28px 16px; display: flex; flex-direction: column; gap: 4px; min-height: 100%; box-sizing: border-box")}>
              {agent && !live && (
                <Notice color={color}>
                  {offline || `“${agent.name}” ainda não existe neste servidor do OpenBot.`}{" "}
                  <button className="b-btn" onClick={setup} style={css("border: 0; padding: 0; background: none; font: inherit; font-weight: 600; color: oklch(0.86 0.13 85); text-decoration: underline; cursor: pointer")}>
                    Configurar
                  </button>
                </Notice>
              )}

              {agent && chat.items.length === 0 && !chat.working && (
                <div style={css("margin: auto 0; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 0; text-align: center")}>
                  <Avatar agent={agent} size={64} working={false} online={live} />
                  <div style={css(`margin-top: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.34em; text-indent: 0.34em; text-transform: uppercase; color: ${color}`)}>{agent.name}</div>
                  {agent.mission && <div style={css("max-width: 500px; font-size: 13.5px; line-height: 1.5; color: oklch(0.66 0.012 268)")}>{agent.mission}</div>}
                  {agent.triggers.length > 0 && (
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; width: 100%; max-width: 620px; margin-top: 14px")}>
                      {agent.triggers.slice(0, 4).map((one) => (
                        <button
                          key={one}
                          className="b-btn c-row"
                          disabled={!live}
                          onClick={() => send(one)}
                          style={css("padding: 12px 14px; border-radius: 11px; border: 1px solid oklch(1 0 0 / 8%); background: oklch(1 0 0 / 2.5%); text-align: left; font: inherit; font-size: 13px; line-height: 1.4; color: oklch(0.88 0.008 268); cursor: pointer")}
                        >
                          {one}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {blocks.map((block) => {
                if (block.kind === "dia")
                  return (
                    <div key={block.key} style={css("display: flex; align-items: center; gap: 12px; margin: 14px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: oklch(0.52 0.012 268)")}>
                      <span style={css("flex: 1; height: 1px; background: oklch(1 0 0 / 6%)")}></span>
                      {block.label}
                      <span style={css("flex: 1; height: 1px; background: oklch(1 0 0 / 6%)")}></span>
                    </div>
                  );
                if (block.kind === "voce") return <Mine key={block.key} item={block.item} />;
                if (block.kind === "papel") return <Fold key={block.key} title="Papel do agente enviado na montagem" at={block.item.at} body={block.item.text} />;
                if (block.kind === "eventos") return <Events key={block.key} items={block.items} />;
                if (block.kind !== "turno") return null;
                return (
                  <Turn
                    key={block.key}
                    agent={agent!}
                    steps={block.steps}
                    answers={block.answers}
                    live={block.live}
                    seconds={seconds}
                    others={others}
                    onSave={saveNote}
                    onForward={forward}
                    onCopy={() => say("Copiado")}
                  />
                );
              })}

              {chat.pending?.approvals?.map((one: any) => (
                <Notice key={one.requestId} color={color} title={`${agent?.name ?? "O agente"} pede aprovação`}>
                  <div>{one.reason || one.kind}</div>
                  {one.command && <code style={css("display: block; margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: oklch(0 0 0 / 30%); font-size: 11.5px; word-break: break-all")}>{String(one.command)}</code>}
                  <div style={css("display: flex; gap: 6px; margin-top: 10px")}>
                    <Chip strong onClick={() => approve(one.requestId, "accept")}>
                      Aprovar
                    </Chip>
                    <Chip onClick={() => approve(one.requestId, "decline")}>Recusar</Chip>
                  </div>
                </Notice>
              ))}
              {chat.pending?.prompts?.map((one: any) => (
                <Notice key={one.requestId} color={color} title={`${agent?.name ?? "O agente"} pergunta`}>
                  {one.requiresOpenBot && <div>Responda no OpenBot, na conversa deste agente.</div>}
                  {(one.questions ?? []).map((q: any) => (
                    <div key={q.id} style={css("margin-top: 6px")}>
                      <div>{q.question}</div>
                      <div style={css("display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px")}>
                        {(q.options ?? []).map((opt: any) => (
                          <Chip key={opt.label} onClick={() => answer(one.requestId, q.id, opt.label)}>
                            {opt.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </Notice>
              ))}
            </div>
          </div>

          {toast && (
            <div style={css("position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); padding: 8px 14px; border-radius: 10px; background: oklch(0.26 0.01 268); box-shadow: 0 10px 30px oklch(0 0 0 / 40%); font-size: 12.5px; color: oklch(0.95 0.006 85); animation: b-rise 0.18s ease-out")}>
              {toast}
            </div>
          )}

          {/* Escrever */}
          <div style={css("flex: none; padding: 4px 24px 16px")}>
            <div style={css("position: relative; max-width: 780px; margin: 0 auto")}>
              {skillsOpen && agent && (
                <div className="b-scroll" style={css("position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); max-height: 320px; overflow-y: auto; padding: 6px; border-radius: 12px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.19 0.008 268); box-shadow: 0 20px 50px oklch(0 0 0 / 50%); animation: b-rise 0.16s ease-out")}>
                  <div style={css("padding: 6px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: oklch(0.55 0.012 268)")}>Pedir para rodar</div>
                  {[...agent.routines, ...agent.skills].map((one) => (
                    <button
                      key={one.slug}
                      className="b-btn c-row"
                      onClick={() => send(skillTask(one))}
                      style={css("display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; text-align: left; font: inherit; font-size: 13px; color: oklch(0.92 0.008 268); cursor: pointer")}
                    >
                      <Svg size={14}>
                        <path d="M13 2 4 14h7l-1 8 9-12h-7z"></path>
                      </Svg>
                      <span style={css("flex: 1; min-width: 0")}>{one.label}</span>
                      <span style={css("font-family: var(--font-mono); font-size: 11px; color: oklch(0.52 0.012 268)")}>{one.schedule || one.slug}</span>
                    </button>
                  ))}
                </div>
              )}
              {error && <div style={css("margin-bottom: 6px; font-size: 12px; color: oklch(0.8 0.09 25)")}>{error}</div>}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  send(text);
                }}
                style={css("display: flex; flex-direction: column; gap: 6px; padding: 10px 10px 8px 14px; border-radius: 14px; border: 1px solid oklch(1 0 0 / 11%); background: oklch(0.185 0.008 268)")}
              >
                <textarea
                  ref={input}
                  rows={1}
                  value={text}
                  disabled={!live}
                  maxLength={3800}
                  onChange={(event) => {
                    if (!agent) return;
                    const value = event.target.value;
                    setDraft((was) => ({ ...was, [agent.key]: value }));
                    if (value === "/") setSkillsOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send(text);
                    }
                    if (event.key === "Escape" && skillsOpen) {
                      event.stopPropagation();
                      setSkillsOpen(false);
                    }
                  }}
                  placeholder={live ? `Mensagem para ${agent?.name ?? "o agente"}` : "Configure o OpenBot para conversar"}
                  style={css("width: 100%; max-height: 200px; min-height: 24px; field-sizing: content; resize: none; padding: 2px 0; border: 0; background: transparent; font: inherit; font-size: 14px; line-height: 1.55; color: oklch(0.96 0.006 85); outline: none")}
                />
                <div style={css("display: flex; align-items: center; gap: 6px")}>
                  {agent && agent.skills.length + agent.routines.length > 0 && (
                    <button
                      type="button"
                      className="b-btn"
                      disabled={!live || chat.working}
                      onClick={() => setSkillsOpen((was) => !was)}
                      style={css(`display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid oklch(1 0 0 / 10%); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; background: ${skillsOpen ? "oklch(1 0 0 / 10%)" : "transparent"}; color: oklch(0.82 0.01 268)`)}
                    >
                      <Svg size={13}>
                        <path d="M13 2 4 14h7l-1 8 9-12h-7z"></path>
                      </Svg>
                      Skills · {agent.skills.length + agent.routines.length}
                    </button>
                  )}
                  <span style={css("flex: 1; font-size: 11px; color: oklch(0.5 0.012 268)")}>Enter envia · / abre as skills</span>
                  <button
                    className="b-btn"
                    type="submit"
                    aria-label="Enviar"
                    disabled={!live || !text.trim() || sending}
                    style={css("display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 9px; background: oklch(0.82 0.15 85); color: oklch(0.2 0.02 85); cursor: pointer")}
                  >
                    <Svg size={16} weight={2.2}>
                      <path d="M12 19V5M5 12l7-7 7 7"></path>
                    </Svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* O painel lateral: a configuração, quando aberta; senão, o que o agente cuida */}
        {view === "configurar" && (
          <aside style={css(GLASS + "; flex: none; width: 380px; display: flex; flex-direction: column; overflow: hidden")}>
            <TeamSetup compact back={() => setView("conversa")} />
          </aside>
        )}
        {view !== "configurar" && side && agent && (
          <aside className="b-scroll" style={css(GLASS + "; flex: none; width: 280px; overflow-y: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 22px")}>
            <div style={css("display: flex; flex-direction: column; align-items: flex-start; gap: 10px")}>
              <Avatar agent={agent} size={48} working={chat.working} online={live} />
              <div>
                <div style={css(`font-size: 12.5px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: ${color}`)}>{agent.name}</div>
                {agent.mission && <div style={css("margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: oklch(0.66 0.012 268)")}>{agent.mission}</div>}
              </div>
            </div>
            {(agent.owns?.length ?? 0) > 0 && (
              <Section title="Cuida de">
                <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
                  {agent.owns!.map((area) => (
                    <button
                      key={area}
                      className="b-btn c-row"
                      title="Ver no mapa"
                      onClick={() => goArea(area)}
                      style={css("display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: transparent; font: inherit; font-size: 12px; color: oklch(0.9 0.008 268); cursor: pointer")}
                    >
                      <span style={css(`width: 8px; height: 8px; border-radius: 3px; background: var(--area-${area})`)}></span>
                      {area.charAt(0).toUpperCase() + area.slice(1)}
                    </button>
                  ))}
                </div>
              </Section>
            )}
            {agent.routines.length > 0 && (
              <Section title="Rotinas">
                {agent.routines.map((one) => (
                  <Line key={one.slug} label={one.label} hint={one.schedule ?? ""} disabled={!live || chat.working} onClick={() => send(skillTask(one))} />
                ))}
              </Section>
            )}
            <Section title={`Skills · ${agent.skills.length}`}>
              {agent.skills.length === 0 && <div style={css("font-size: 12.5px; color: oklch(0.56 0.012 268)")}>Nenhuma skill nesta área ainda.</div>}
              {agent.skills.map((one) => (
                <Line key={one.slug} label={one.label} disabled={!live || chat.working} onClick={() => send(skillTask(one))} />
              ))}
            </Section>
          </aside>
        )}
      </div>
    </div>
  );
}

// O avatar é o nó da área no mapa: um círculo escuro com o tom da área, o anel fino,
// o brilho em volta e o ícone. No canto, o logo do OpenBot quando o agente está nele
// (como o OpenBot mostra o contador no canto do mascote). Trabalhando, o brilho pulsa
// e um ponto gira em órbita, como as rotinas no mapa. Fora do OpenBot, o nó fica apagado.
function Avatar({ agent, size, working, online }: { agent: Agent; size: number; working: boolean; online: boolean }) {
  const color = colorOf(agent);
  const badge = Math.max(12, Math.round(size * 0.36));
  // No OpenBot, o agente aparece com o mascote que ele tem lá.
  const face = agent.openbot?.avatar;
  if (face)
    return (
      <span style={css(`position: relative; flex: none; display: grid; place-items: center; width: ${size}px; height: ${size}px`)}>
        <BotFace seed={face.seed} hue={face.hue} size={size} mood={working ? "trabalhando" : "calmo"} dim={!online} />
        {working && (
          <span className="c-orbit" style={css("position: absolute; inset: -4px; border-radius: 99px")}>
            <span style={css("position: absolute; top: 0; left: 50%; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 99px; background: oklch(0.86 0.12 85); box-shadow: 0 0 6px oklch(0.86 0.12 85)")}></span>
          </span>
        )}
      </span>
    );
  return (
    <span style={css(`position: relative; flex: none; display: grid; place-items: center; width: ${size}px; height: ${size}px`)}>
      <span
        className={working ? "c-glow" : undefined}
        style={css(
          `position: absolute; inset: 0; border-radius: 99px; opacity: ${online ? 1 : 0.4}; background: radial-gradient(circle, color-mix(in oklch, ${color} 24%, oklch(0.14 0.008 268)) 0%, color-mix(in oklch, ${color} 12%, oklch(0.12 0.008 268)) 100%); border: ${size >= 30 ? 1.5 : 1}px solid ${color}; box-shadow: 0 0 ${Math.round(size * 0.35)}px color-mix(in oklch, ${color} 45%, transparent), 0 0 ${Math.round(size * 0.9)}px color-mix(in oklch, ${color} 16%, transparent); --glow: ${color}`,
        )}
      ></span>
      <span style={css(`position: relative; display: grid; place-items: center; color: ${color}; opacity: ${online ? 1 : 0.5}; transform: scale(${Math.max(0.62, size / 40).toFixed(2)})`)}>
        <KindIcon name={iconOf(agent)} />
      </span>
      {working && (
        <span className="c-orbit" style={css("position: absolute; inset: -5px; border-radius: 99px")}>
          <span style={css(`position: absolute; top: 0; left: 50%; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 99px; background: ${color}; box-shadow: 0 0 6px ${color}`)}></span>
        </span>
      )}
      {online && !working && size >= 28 && (
        <span style={css(`position: absolute; right: ${-Math.round(badge * 0.25)}px; bottom: ${-Math.round(badge * 0.2)}px; padding: 1.5px; border-radius: ${Math.round(badge * 0.32)}px; background: oklch(0.16 0.008 268)`)}>
          <OpenBotMark size={badge} />
        </span>
      )}
    </span>
  );
}

// O logo do OpenBot, lido do app instalado (some se o OpenBot não estiver instalado).
function OpenBotMark({ size }: { size: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src="/api/openbot/logo" alt="OpenBot" width={size} height={size} onError={() => setOk(false)} style={{ borderRadius: Math.round(size * 0.24), display: "block" }} />;
}

function StatusPill({ live, working, seconds }: { live: boolean; working: boolean; seconds: number }) {
  const [bg, fg, label] = !live
    ? ["oklch(1 0 0 / 6%)", "oklch(0.66 0.012 268)", "Fora do OpenBot"]
    : working
      ? ["oklch(0.82 0.15 85 / 14%)", "oklch(0.86 0.12 85)", "Trabalhando" + (seconds > 3 ? ` · ${seconds}s` : "")]
      : ["oklch(0.72 0.14 155 / 14%)", "oklch(0.82 0.12 155)", "Disponível"];
  return (
    <span style={css(`display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 99px; background: ${bg}; color: ${fg}; font-size: 11px; font-weight: 600`)}>
      <span className={working ? "c-pulse" : undefined} style={css("width: 6px; height: 6px; border-radius: 99px; background: currentColor")}></span>
      {label}
    </span>
  );
}

function Mine({ item }: { item: Item }) {
  return (
    <div className="c-msg" style={css("display: flex; flex-direction: column; align-items: flex-end; gap: 3px; margin: 12px 0 2px")}>
      <div style={css("max-width: 78%; padding: 9px 14px; border-radius: 14px 14px 4px 14px; background: oklch(0.27 0.012 268); font-size: 14px; line-height: 1.55; color: oklch(0.97 0.004 85); white-space: pre-wrap; overflow-wrap: anywhere")}>{item.text}</div>
      <span style={css("font-size: 10.5px; color: oklch(0.5 0.012 268)")}>{hour(item.at)}</span>
    </div>
  );
}

type TurnProps = { agent: Agent; steps: Item[]; answers: Item[]; live: boolean; seconds: number; others: Agent[]; onSave: (item: Item) => void; onForward: (item: Item, to: Agent) => void; onCopy: () => void };

// O trabalho do agente num turno: os passos que ele narrou (dobrados depois que
// termina) e a resposta, com as ações.
function Turn(props: TurnProps) {
  const { agent, steps, answers, live, seconds } = props;
  const [open, setOpen] = useState(false);
  const showSteps = live || open;
  return (
    <div className="c-msg" style={css("display: flex; gap: 12px; margin: 12px 0 2px")}>
      <span style={css("flex: none; padding-top: 1px")}>
        <Avatar agent={agent} size={28} working={live} online />
      </span>
      <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px")}>
        <div style={css("display: flex; align-items: baseline; gap: 8px")}>
          <span style={css(`font-size: 10.5px; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: ${colorOf(agent)}`)}>{agent.name}</span>
          {answers[0] && <span style={css("font-size: 10.5px; color: oklch(0.5 0.012 268)")}>{hour(answers[0].at)}</span>}
        </div>
        {steps.length > 0 && (
          <div style={css("border-left: 2px solid oklch(1 0 0 / 8%); padding-left: 12px")}>
            {!live && (
              <button className="b-btn" onClick={() => setOpen((was) => !was)} style={css("display: flex; align-items: center; gap: 6px; border: 0; padding: 2px 0; background: none; font: inherit; font-size: 12px; color: oklch(0.6 0.012 268); cursor: pointer")}>
                <Svg size={12} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                  <path d="m9 6 6 6-6 6"></path>
                </Svg>
                {steps.length === 1 ? "1 passo" : steps.length + " passos"}
              </button>
            )}
            {showSteps &&
              steps.map((step, i) => (
                <div key={step.id} style={css("display: flex; align-items: flex-start; gap: 8px; padding: 3px 0; font-size: 12.5px; line-height: 1.5; color: oklch(0.66 0.012 268)")}>
                  <span style={css("flex: none; display: grid; place-items: center; width: 12px; height: 19px")}>
                    {live && i === steps.length - 1 && !answers.length ? (
                      <span className="c-spin"></span>
                    ) : (
                      <Svg size={11}>
                        <path d="M5 12l5 5 9-10"></path>
                      </Svg>
                    )}
                  </span>
                  <span style={css("overflow-wrap: anywhere")}>{plain(step.text)}</span>
                </div>
              ))}
          </div>
        )}
        {live && !answers.length && steps.length === 0 && (
          <div style={css("display: flex; align-items: center; gap: 8px; font-size: 13px; color: oklch(0.66 0.012 268)")}>
            <span className="c-spin"></span>
            Pensando{seconds > 3 ? ` · ${seconds}s` : ""}
          </div>
        )}
        {answers.map((item) => (
          <Answer key={item.id} item={item} others={props.others} onSave={props.onSave} onForward={props.onForward} onCopy={props.onCopy} />
        ))}
        {!live && !answers.length && <div style={css("font-size: 12.5px; color: oklch(0.6 0.012 268)")}>Não terminou: o OpenBot interrompeu este turno. Mande de novo se ainda precisar.</div>}
      </div>
    </div>
  );
}

function Answer({ item, others, onSave, onForward, onCopy }: { item: Item; others: Agent[]; onSave: (item: Item) => void; onForward: (item: Item, to: Agent) => void; onCopy: () => void }) {
  const [menu, setMenu] = useState(false);
  const html = useMemo(() => render(item.text), [item.text]);
  return (
    <div className="c-answer" style={css("position: relative")}>
      <div className="b-prose b-md" dangerouslySetInnerHTML={{ __html: html }}></div>
      <div className="c-actions" style={css("display: flex; align-items: center; gap: 2px; margin-top: 4px")}>
        <Action
          label="Copiar"
          onClick={() => {
            navigator.clipboard?.writeText(item.text).then(onCopy, () => null);
          }}
        >
          <rect x="9" y="9" width="11" height="11" rx="2"></rect>
          <path d="M5 15V5a2 2 0 0 1 2-2h10"></path>
        </Action>
        <Action label="Salvar nas Notas do cérebro" onClick={() => onSave(item)}>
          <path d="M6 3h9l3 3v15H6z"></path>
          <path d="M9 3v6h6"></path>
        </Action>
        {others.length > 0 && (
          <span style={css("position: relative")}>
            <Action label="Passar para outro agente" onClick={() => setMenu((was) => !was)}>
              <path d="M4 12h14M13 6l6 6-6 6"></path>
            </Action>
            {menu && (
              <div style={css("position: absolute; left: 0; bottom: calc(100% + 4px); z-index: 5; min-width: 210px; padding: 4px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.2 0.008 268); box-shadow: 0 16px 40px oklch(0 0 0 / 50%)")}>
                <div style={css("padding: 6px 8px 4px; font-size: 11px; color: oklch(0.55 0.012 268)")}>Passar a resposta para</div>
                {others.map((one) => (
                  <button
                    key={one.key}
                    className="b-btn c-row"
                    onClick={() => {
                      setMenu(false);
                      onForward(item, one);
                    }}
                    style={css("display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 7px; background: transparent; text-align: left; font: inherit; font-size: 12.5px; color: oklch(0.92 0.008 268); cursor: pointer")}
                  >
                    <Avatar agent={one} size={20} working={false} online />
                    {one.name}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// Eventos do agente (instruções, skills, rotinas): uma linha discreta; vários iguais viram um.
function Events({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const kind = items[0].text.split(":")[0];
  const many = items.length > 1;
  const title = many ? (kind.startsWith("Skill") ? `Instalou ${items.length} skills` : kind.startsWith("Rotina") ? `Criou ${items.length} rotinas` : `${kind} · ${items.length}`) : items[0].text;
  const detail = items[0].detail;
  const can = many || Boolean(detail);
  return (
    <div style={css("display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 8px 0")}>
      <button
        className="b-btn"
        onClick={() => can && setOpen((was) => !was)}
        style={css(`display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px; border: 0; border-radius: 99px; background: oklch(1 0 0 / 4%); font: inherit; font-size: 11.5px; color: oklch(0.6 0.012 268); cursor: ${can ? "pointer" : "default"}`)}
      >
        <Svg size={12}>
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path>
        </Svg>
        {title}
        <span style={css("color: oklch(0.48 0.012 268)")}>· {hour(items[0].at)}</span>
        {can && <span style={css("color: oklch(0.72 0.012 268)")}>{open ? "Esconder" : "Ver"}</span>}
      </button>
      {open && many && (
        <div style={css("display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 640px")}>
          {items.map((one) => (
            <span key={one.id} style={css("padding: 2px 8px; border-radius: 6px; background: oklch(1 0 0 / 4%); font-family: var(--font-mono); font-size: 11px; color: oklch(0.72 0.012 268)")}>
              {one.text.split(": ").slice(1).join(": ")}
            </span>
          ))}
        </div>
      )}
      {open && !many && detail && (
        <div className="b-prose b-md" style={css("align-self: stretch; max-height: 320px; overflow: auto; padding: 12px 14px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 7%); font-size: 12.5px")} dangerouslySetInnerHTML={{ __html: render(detail) }}></div>
      )}
    </div>
  );
}

function Fold({ title, at, body }: { title: string; at: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={css("display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 8px 0")}>
      <button className="b-btn" onClick={() => setOpen((was) => !was)} style={css("display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px; border: 0; border-radius: 99px; background: oklch(1 0 0 / 4%); font: inherit; font-size: 11.5px; color: oklch(0.6 0.012 268); cursor: pointer")}>
        <Svg size={12}>
          <path d="M6 3h9l3 3v15H6z"></path>
        </Svg>
        {title}
        <span style={css("color: oklch(0.48 0.012 268)")}>· {hour(at)}</span>
        <span style={css("color: oklch(0.72 0.012 268)")}>{open ? "Esconder" : "Ver"}</span>
      </button>
      {open && <div className="b-prose b-md" style={css("align-self: stretch; max-height: 360px; overflow: auto; padding: 12px 14px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 7%); font-size: 12.5px")} dangerouslySetInnerHTML={{ __html: render(body) }}></div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={css("display: flex; flex-direction: column; gap: 6px")}>
      <div style={css(LABEL + "; color: oklch(0.56 0.012 268)")}>{title}</div>
      {children}
    </div>
  );
}

function Line({ label, hint, disabled, onClick }: { label: string; hint?: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="b-btn c-row"
      disabled={disabled}
      title={"Pedir para rodar “" + label + "”"}
      onClick={onClick}
      style={css("display: flex; align-items: center; gap: 8px; width: calc(100% + 16px); padding: 6px 8px; margin: 0 -8px; border: 0; border-radius: 7px; background: transparent; text-align: left; font: inherit; font-size: 12.5px; color: oklch(0.86 0.008 268); cursor: pointer")}
    >
      <span style={css("flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap")}>{label}</span>
      {hint && <span style={css("flex: none; font-size: 11px; color: oklch(0.52 0.012 268)")}>{hint}</span>}
    </button>
  );
}

function IconButton({ label, onClick, on, children }: { label: string; onClick: () => void; on?: boolean; children: React.ReactNode }) {
  return (
    <button className="b-btn b-ghost" aria-label={label} title={label} onClick={onClick} style={css(`display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: ${on ? "oklch(1 0 0 / 7%)" : "transparent"}; color: oklch(0.72 0.012 268); cursor: pointer`)}>
      <Svg size={16}>{children}</Svg>
    </button>
  );
}

function Action({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="b-btn c-act" aria-label={label} title={label} onClick={onClick} style={css("display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.58 0.012 268); cursor: pointer")}>
      <Svg size={14}>{children}</Svg>
    </button>
  );
}

function Notice({ title, color, children }: { title?: string; color: string; children: React.ReactNode }) {
  return (
    <div style={css(`align-self: stretch; margin-top: 10px; padding: 13px 16px; border-radius: 12px; background: color-mix(in oklch, ${color} 8%, transparent); border: 1px solid color-mix(in oklch, ${color} 24%, transparent); font-size: 13px; line-height: 1.5; color: oklch(0.9 0.008 268)`)}>
      {title && <div style={css("margin-bottom: 4px; font-weight: 650")}>{title}</div>}
      {children}
    </div>
  );
}

function Chip({ children, onClick, strong }: { children: React.ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      className="b-btn"
      type="button"
      onClick={onClick}
      style={css(
        `display: inline-flex; align-items: center; height: 30px; padding: 0 13px; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; border: 1px solid ${strong ? "transparent" : "oklch(1 0 0 / 12%)"}; background: ${
          strong ? "oklch(0.82 0.15 85)" : "oklch(1 0 0 / 4%)"
        }; color: ${strong ? "oklch(0.2 0.02 85)" : "oklch(0.92 0.008 268)"}`,
      )}
    >
      {children}
    </button>
  );
}
