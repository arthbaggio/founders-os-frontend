// As notas: o widget da direita e o diálogo de escrever. Cada nota é um .md em
// fontes/notas/. Processar abre uma sessão do Claude que propõe as mudanças no
// wiki; aprovada, a sessão grava e a nota vira fonte: dali em diante, só leitura.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { marked } from "marked";
import type { Note } from "../../server/notes";
import type { Run } from "../../server/runs";
import { css } from "../css";
import { ago, plural, span, words } from "../home";
import { Svg } from "./Icons";

export type { Note };

const MONO = "font-family: 'Geist Mono', ui-monospace, monospace";
const STATUS = {
  caixa: { label: "Na caixa", color: "oklch(0.74 0.012 268)", meta: "" },
  enviada: { label: "Enviada", color: "var(--brain-app)", meta: "" },
  processando: { label: "Processando", color: "var(--brain-routine)", meta: "O Claude está lendo a nota" },
  revisar: { label: "Revisar", color: "var(--brain-app)", meta: "Proposta pronta para revisar" },
  gravando: { label: "Gravando", color: "var(--brain-routine)", meta: "O Claude está gravando no wiki" },
  wiki: { label: "Na wiki", color: "var(--ok)", meta: "" },
};

// Em que pé a nota está: o arquivo diz caixa ou enviada; a sessão dela diz o resto.
export function stage(note: Note, run: Run | null): keyof typeof STATUS {
  if (run?.status === "rodando") return run.phase === "gravacao" ? "gravando" : "processando";
  if (run?.status === "pronta") return run.phase === "gravacao" ? "wiki" : "revisar";
  return note.status;
}

// Com uma sessão rodando ou uma proposta esperando, a nota não muda.
export const busy = (run: Run | null) => !!run && (run.status === "rodando" || (run.status === "pronta" && run.phase === "proposta"));

// A primeira linha que diz alguma coisa, sem o Markdown em volta.
function gist(body: string) {
  let fence = false;
  for (const raw of body.split("\n")) {
    if (/^\s*```/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const line = raw
      .replace(/^\s*(#{1,3}|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)]|>)\s*/, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*|`|_|\*/g, "")
      .trim();
    if (line) return line.length > 72 ? line.slice(0, 71).trimEnd() + "…" : line;
  }
  return "";
}

export const titled = (note: Pick<Note, "title" | "body">) => note.title.trim() || gist(note.body) || "Sem título";
export const blank = (note: Pick<Note, "title" | "body">) => !note.title.trim() && !note.body.trim();

const Sparkle = ({ size }: { size: number }) => (
  <Svg size={size}>
    <path d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4zM18 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"></path>
  </Svg>
);
const Pencil = ({ size, style }: { size: number; style?: React.CSSProperties }) => (
  <Svg size={size} style={style}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4z"></path>
  </Svg>
);
const X = () => (
  <Svg weight={2}>
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  </Svg>
);

type WidgetProps = { notes: Note[]; runs: Run[]; now: number; open: (id: string) => void; process: (id: string) => void; add: () => void };

export function NotesWidget({ notes, runs, now, open, process, add }: WidgetProps) {
  return (
    <section
      aria-label="Notas"
      className="b-scroll"
      style={css(
        "display: flex; flex-direction: column; min-height: 0; overflow-y: auto; box-sizing: border-box; padding-bottom: 6px; border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 88%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 16px 40px oklch(0 0 0 / 40%); pointer-events: auto",
      )}
    >
      <div style={css("flex: none; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 7px 0 13px")}>
        <Pencil size={15} style={{ flex: "none", color: "oklch(0.74 0.012 268)" }} />
        <h2 style={css("margin: 0; font-size: 13px; font-weight: 600")}>Notas</h2>
        <span style={css(`${MONO}; font-size: 11.5px; color: oklch(0.7 0.012 268)`)}>{notes.length}</span>
        <button
          className="b-btn b-solid"
          title="Nova nota (N)"
          onClick={add}
          style={css(
            "flex: none; margin-left: auto; display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 7px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer",
          )}
        >
          <Svg size={13} weight={2}>
            <path d="M12 5v14M5 12h14"></path>
          </Svg>
          Nova
          <kbd
            className="b-kbd"
            style={css(
              `display: grid; place-items: center; width: 16px; height: 16px; margin-left: 1px; border-radius: 4px; border: 1px solid oklch(1 0 0 / 12%); ${MONO}; font-size: 10px; color: oklch(0.74 0.012 268)`,
            )}
          >
            N
          </kbd>
        </button>
      </div>
      {notes.slice(0, 5).map((note) => {
        const run = runs.find((one) => one.note === note.id) ?? null;
        const at = stage(note, run);
        const status = STATUS[at];
        const inbox = at === "caixa";
        const meta =
          status.meta ||
          (inbox ? ago(note.updatedAt, now) + " · " + plural(words(note.body), "palavra", "palavras") : (at === "wiki" ? "Na wiki " : "Enviada ") + ago(note.sentAt ?? note.updatedAt, now));
        return (
          <div key={note.id} className="b-note" style={css("position: relative; flex: none; display: flex; margin: 0 6px")}>
            <button
              className="b-btn b-row"
              onClick={() => open(note.id)}
              style={css(
                "flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 7px 8px 8px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer",
              )}
            >
              <span style={css("display: flex; align-items: center; gap: 8px")}>
                <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; font-weight: 500")}>{titled(note)}</span>
                <span
                  className={inbox ? "b-chip" : ""}
                  style={css(`flex: none; display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: ${status.color}; transition: opacity 0.12s ease`)}
                >
                  <span className={run?.status === "rodando" ? "b-live" : ""} style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${status.color}`)}></span>
                  {status.label}
                </span>
              </span>
              <span style={css("overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11.5px; color: oklch(0.7 0.012 268)")}>{meta}</span>
            </button>
            {inbox && !blank(note) && (
              <button
                className="b-btn b-solid b-quick"
                aria-label={"Processar “" + titled(note) + "” na wiki"}
                title="O Claude propõe as mudanças; nada é gravado antes de você aprovar"
                onClick={() => process(note.id)}
                style={css(
                  "position: absolute; top: 5px; right: 6px; display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px 0 7px; border-radius: 7px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.24 0.008 268); color: oklch(0.94 0.006 85); font: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer",
                )}
              >
                <Sparkle size={12} />
                Processar
              </button>
            )}
          </div>
        );
      })}
      {!notes.length && <div style={css("padding: 2px 14px 10px; font-size: 12.5px; line-height: 1.5; color: oklch(0.74 0.012 268)")}>Nada anotado ainda. Aperte N em qualquer lugar para anotar.</div>}
    </section>
  );
}

const MD_TOOLS = [
  { key: "title", label: "Título", title: "Título", d: "M6 5v14M16 5v14M6 12h10" },
  { key: "bold", label: "Negrito", title: "Negrito (⌘B)", d: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" },
  { key: "italic", label: "Itálico", title: "Itálico (⌘I)", d: "M19 4h-9M14 20H5M15 4 9 20" },
  { key: "list", label: "Lista", title: "Lista", d: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" },
  { key: "task", label: "Tarefa", title: "Tarefa", d: "M3.5 6.5 5 8l3-3M3.5 15.5 5 17l3-3M11.5 7H20M11.5 16H20" },
  { key: "quote", label: "Citação", title: "Citação", d: "M4.5 17 7 12H4.5V6.5h6V12L8 17zM13.5 17 16 12h-2.5V6.5h6V12L17 17z" },
  { key: "code", label: "Código", title: "Código", d: "m8 8-4 4 4 4M16 8l4 4-4 4" },
  { key: "link", label: "Link", title: "Link (⌘K)", d: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" },
];

type DialogProps = {
  note: Note;
  // A última sessão da nota, se houver.
  run: Run | null;
  now: number;
  mode: "write" | "read";
  focus: "title" | "body" | null;
  setMode: (mode: "write" | "read") => void;
  edit: (patch: { title?: string; body?: string }) => void;
  close: () => void;
  remove: () => void;
  process: () => void;
  adjust: (text: string) => void;
  approve: () => void;
  discard: () => void;
  dismiss: (run: Run) => void;
};

export function NoteDialog({ note, run, now, mode, focus, setMode, edit, close, remove, process, adjust, approve, discard, dismiss }: DialogProps) {
  const titleBox = useRef<HTMLInputElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const wantBody = useRef(focus === "body");
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState("");
  const at = stage(note, run);
  const locked = note.status === "enviada" || busy(run);
  const status = STATUS[at];
  const reading = mode === "read";
  const canProcess = at === "caixa" && !blank(note);

  useEffect(() => {
    if (focus === "title") titleBox.current?.focus();
  }, []);
  // O cursor vai para o fim do texto quando a área aparece e foi pedida.
  useEffect(() => {
    const box = area.current;
    if (!box || !wantBody.current) return;
    wantBody.current = false;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });

  // Os botões do editor escrevem o Markdown no lugar do cursor.
  const format = (kind: string) => {
    const box = area.current;
    if (!box || locked) return;
    const text = note.body;
    const a = box.selectionStart;
    const b = box.selectionEnd;
    let next: string;
    let from: number;
    let to: number;
    const marks: Record<string, string> = { title: "## ", list: "- ", task: "- [ ] ", quote: "> " };
    if (marks[kind]) {
      const mark = marks[kind];
      const start = text.lastIndexOf("\n", a - 1) + 1;
      if (text.startsWith(mark, start)) {
        next = text.slice(0, start) + text.slice(start + mark.length);
        from = Math.max(start, a - mark.length);
        to = Math.max(start, b - mark.length);
      } else {
        next = text.slice(0, start) + mark + text.slice(start);
        from = a + mark.length;
        to = b + mark.length;
      }
    } else {
      const wraps: Record<string, [string, string, string]> = { bold: ["**", "**", "negrito"], italic: ["_", "_", "itálico"], code: ["`", "`", "código"], link: ["[", "](https://)", "texto do link"] };
      const [left, right, hint] = wraps[kind];
      const inner = text.slice(a, b) || hint;
      next = text.slice(0, a) + left + inner + right + text.slice(b);
      from = a + left.length;
      to = from + inner.length;
    }
    edit({ body: next });
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.focus();
      area.current.setSelectionRange(from, to);
    });
  };

  const toggleTask = (line: number) => {
    const lines = note.body.split("\n");
    if (locked || lines[line] === undefined) return;
    lines[line] = lines[line].replace(/\[( |x|X)\]/, (_, mark: string) => (mark === " " ? "[x]" : "[ ]"));
    edit({ body: lines.join("\n") });
  };

  const titleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    wantBody.current = true;
    if (reading) setMode("write");
    else area.current?.focus();
  };
  const bodyKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const kinds: Record<string, string> = { b: "bold", i: "italic", k: "link" };
    const kind = kinds[event.key.toLowerCase()];
    if (kind) {
      event.preventDefault();
      format(kind);
    }
    if (event.key === "Enter" && canProcess) {
      event.preventDefault();
      process();
    }
  };

  const sendAsk = () => {
    if (!ask.trim()) return;
    adjust(ask.trim());
    setAsking(false);
    setAsk("");
  };

  let meta = (blank(note) ? "Ainda não salva" : "Salva " + ago(note.updatedAt, now)) + " · " + plural(words(note.body), "palavra", "palavras") + " · Markdown";
  if (note.status === "enviada") meta = "Enviada " + ago(note.sentAt ?? note.updatedAt, now) + " · agora é fonte e não muda mais";
  if (run?.status === "rodando") meta = "Pode fechar: a sessão continua";
  if (at === "revisar") meta = "Nada foi gravado ainda";

  // A sessão da nota: rodando, a proposta para revisar, o que foi gravado ou o erro.
  let panel = null;
  if (run) {
    const live = run.status === "rodando";
    const failed = run.status === "falhou" || run.status === "parada";
    const writing = run.phase === "gravacao";
    const tone = failed ? "oklch(0.7 0.17 22)" : live ? "var(--brain-routine)" : writing ? "var(--ok)" : "var(--brain-app)";
    const title = failed
      ? run.status === "parada"
        ? "Sessão parada"
        : "A sessão falhou"
      : live
        ? writing
          ? "Gravando no wiki"
          : "Sessão do Claude"
        : writing
          ? "Gravado na wiki"
          : "Proposta do Claude";
    const sub = live ? (run.text ? "ajustando: “" + run.text + "” · " : "") + run.step : failed ? run.step : writing ? ago(run.endedAt ?? now, now) : run.text ? "ajustada: “" + run.text + "”" : "";
    panel = (
      <div style={css("flex: none; display: flex; flex-direction: column; margin: 0 16px 14px; padding: 12px 14px; border-radius: 12px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3.5%); animation: b-rise 0.2s ease-out")}>
        <div style={css("display: flex; align-items: center; gap: 8px; min-width: 0")}>
          <span className={live ? "b-live" : ""} style={css(`flex: none; display: grid; color: ${tone}`)}>
            <Sparkle size={14} />
          </span>
          <span style={css("flex: none; font-weight: 600")}>{title}</span>
          <span title={sub} style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: oklch(0.72 0.012 268)")}>
            {sub}
          </span>
          {live && <span style={css(`flex: none; ${MONO}; font-size: 11.5px; color: oklch(0.72 0.012 268)`)}>{span(now - run.startedAt)}</span>}
          {(live || failed || writing) && (
            <button
              className="b-btn b-ghost"
              aria-label={live ? "Parar a sessão" : "Fechar"}
              title={live ? "Parar a sessão" : "Fechar"}
              onClick={() => (live || failed ? dismiss(run) : discard())}
              style={css("flex: none; display: grid; place-items: center; width: 24px; height: 24px; margin: -3px -4px -3px 0; border: 0; border-radius: 6px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
            >
              <Svg size={12} weight={2}>
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </Svg>
            </button>
          )}
        </div>
        {run.status === "pronta" && run.result.trim() && (
          <div
            className="b-prose b-scroll"
            // Um link de fora abre noutra aba; um caminho do cérebro não tira a tela do lugar.
            onClick={(event) => {
              const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
              if (!href) return;
              event.preventDefault();
              if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener");
            }}
            style={css("max-height: 240px; overflow-y: auto; margin-top: 10px; padding-right: 6px; font-size: 13px")}
            dangerouslySetInnerHTML={{ __html: marked.parse(run.result, { async: false, gfm: true }) as string }}
          />
        )}
        {at === "revisar" && (
          <>
            {asking && (
              <div style={css("display: flex; gap: 6px; margin-top: 10px")}>
                <input
                  className="b-input"
                  autoFocus
                  type="text"
                  value={ask}
                  onChange={(event) => setAsk(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      sendAsk();
                    }
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setAsking(false);
                    }
                  }}
                  placeholder="O que o Claude deve mudar?"
                  aria-label="Pedido de ajuste"
                  autoComplete="off"
                  style={css(
                    "flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 4%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px",
                  )}
                />
                <button
                  className="b-btn b-main"
                  disabled={!ask.trim()}
                  onClick={sendAsk}
                  style={css("flex: none; height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer")}
                >
                  Enviar
                </button>
              </div>
            )}
            <div style={css("display: flex; align-items: center; gap: 6px; margin-top: 10px")}>
              <button
                className="b-btn b-ghost"
                onClick={discard}
                style={css("height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.8 0.012 268); font: inherit; font-weight: 500; cursor: pointer")}
              >
                Descartar
              </button>
              <button
                className="b-btn b-solid"
                onClick={() => setAsking(!asking)}
                style={css(
                  "margin-left: auto; height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer",
                )}
              >
                Pedir ajuste
              </button>
              <button
                className="b-btn b-main"
                onClick={approve}
                style={css(
                  "display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 10px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer",
                )}
              >
                <Svg size={13} weight={2.4}>
                  <path d="m5 12.5 4.5 4.5L19 7"></path>
                </Svg>
                Aprovar e gravar
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
  const seg = (on: boolean) =>
    css(
      `height: 24px; padding: 0 10px; border: 0; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; background: ${on ? "oklch(1 0 0 / 13%)" : "transparent"}; color: ${
        on ? "oklch(0.96 0.006 85)" : "oklch(0.74 0.012 268)"
      }`,
    );

  return (
    <div style={css("position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box")}>
      <button
        className="b-scrim"
        aria-label="Fechar a nota"
        tabIndex={-1}
        onClick={close}
        style={css("position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: oklch(0.1 0.008 268 / 55%); backdrop-filter: blur(3px); cursor: default")}
      ></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={"Nota: " + titled(note)}
        style={css(
          `position: relative; display: flex; flex-direction: column; width: 760px; max-width: 100%; height: ${
            run ? "720px" : "640px"
          }; max-height: 100%; overflow: hidden; border-radius: 16px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.17 0.008 268 / 98%); box-shadow: 0 1px 0 oklch(1 0 0 / 6%) inset, 0 40px 90px oklch(0 0 0 / 60%); transition: height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); animation: b-dialog 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)`,
        )}
      >
        <div style={css("flex: none; display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 10px 0 20px; border-bottom: 1px solid oklch(1 0 0 / 8%)")}>
          <Pencil size={14} style={{ flex: "none", color: "oklch(0.74 0.012 268)" }} />
          <span style={css("flex: none; font-size: 12.5px; color: oklch(0.74 0.012 268)")}>Notas</span>
          <Svg size={12} weight={2} style={{ flex: "none", color: "oklch(0.6 0.012 268)" }}>
            <path d="m9 18 6-6-6-6"></path>
          </Svg>
          <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; color: oklch(0.88 0.008 268)")}>{note.title.trim() || "Nova nota"}</span>
          <span
            style={css(
              `flex: none; display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px 0 8px; box-sizing: border-box; border-radius: 99px; border: 1px solid color-mix(in oklch, ${status.color} 30%, transparent); background: color-mix(in oklch, ${status.color} 10%, transparent); color: ${status.color}; font-size: 12px; font-weight: 500; white-space: nowrap`,
            )}
          >
            <span className={run?.status === "rodando" ? "b-live" : ""} style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${status.color}`)}></span>
            {status.label}
          </span>
          <button
            className="b-btn b-risk"
            aria-label="Apagar a nota"
            title={note.status === "enviada" ? "Uma fonte não se apaga" : locked ? "A nota está com o Claude" : "Apagar a nota"}
            disabled={locked}
            onClick={remove}
            style={css("flex: none; display: grid; place-items: center; width: 30px; height: 30px; margin-left: 4px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
          >
            <Svg size={14}>
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path>
            </Svg>
          </button>
          <button
            className="b-btn b-ghost"
            aria-label="Fechar"
            onClick={close}
            style={css("flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
          >
            <X />
          </button>
        </div>
        <div style={css("flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 20px 28px 0")}>
          <input
            ref={titleBox}
            className="b-head"
            type="text"
            value={note.title}
            onChange={(event) => edit({ title: event.target.value })}
            onKeyDown={titleKey}
            readOnly={locked}
            placeholder="Sem título"
            aria-label="Título da nota"
            autoComplete="off"
            style={css("flex: none; width: 100%; padding: 0; border: 0; background: transparent; color: oklch(0.96 0.006 85); font: inherit; font-size: 22px; font-weight: 600; letter-spacing: -0.01em")}
          />
          <div style={css("flex: none; display: flex; align-items: center; gap: 8px; margin: 14px 0 12px")}>
            {!reading && (
              <div role="toolbar" aria-label="Formatação" style={css("display: flex; align-items: center; gap: 1px; padding: 2px; border-radius: 9px; border: 1px solid oklch(1 0 0 / 8%); background: oklch(1 0 0 / 3%)")}>
                {MD_TOOLS.map((tool) => (
                  <button
                    key={tool.key}
                    className="b-btn b-ghost"
                    aria-label={tool.label}
                    title={tool.title}
                    disabled={locked}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format(tool.key)}
                    style={css("display: grid; place-items: center; width: 28px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: oklch(0.8 0.01 268); cursor: pointer")}
                  >
                    <Svg size={14} weight={2}>
                      <path d={tool.d}></path>
                    </Svg>
                  </button>
                ))}
              </div>
            )}
            <div role="tablist" aria-label="Modo" style={css("margin-left: auto; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
              <button className="b-btn b-seg" role="tab" aria-selected={!reading} onClick={() => setMode("write")} style={seg(!reading)}>
                Escrever
              </button>
              <button className="b-btn b-seg" role="tab" aria-selected={reading} onClick={() => setMode("read")} style={seg(reading)}>
                Visualizar
              </button>
            </div>
          </div>
          {!reading ? (
            <textarea
              ref={area}
              className="b-area b-scroll"
              value={note.body}
              onChange={(event) => edit({ body: event.target.value })}
              onKeyDown={bodyKey}
              readOnly={locked}
              aria-label="Texto da nota, em Markdown"
              placeholder="Escreva em Markdown: ## título, - lista, - [ ] tarefa, **negrito**"
              style={css(
                "flex: 1; min-height: 0; width: 100%; box-sizing: border-box; margin: 0; padding: 0 0 18px; border: 0; resize: none; background: transparent; color: oklch(0.9 0.008 268); font: inherit; font-size: 14px; line-height: 1.7",
              )}
            ></textarea>
          ) : (
            <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 0 0 18px; font-size: 14px; color: oklch(0.88 0.008 268)")}>
              {note.body.trim() ? <Preview md={note.body} locked={locked} toggle={toggleTask} /> : <p style={css("margin: 0; color: oklch(0.66 0.012 268)")}>Nada escrito ainda.</p>}
            </div>
          )}
        </div>
        {panel}
        <div style={css("flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; box-sizing: border-box; padding: 10px 14px 10px 28px; border-top: 1px solid oklch(1 0 0 / 8%)")}>
          <span style={css("min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: oklch(0.7 0.012 268)")}>{meta}</span>
          {at === "caixa" && (
            <button
              className="b-btn b-main"
              disabled={!canProcess}
              title="O Claude propõe as mudanças; nada é gravado antes de você aprovar (⌘ Enter)"
              onClick={process}
              style={css(
                "flex: none; display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px 0 11px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer",
              )}
            >
              <Sparkle size={14} />
              Processar na wiki
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- O Markdown da nota em blocos: títulos, listas, tarefas, citações e código ---
type Block = { type: string; text: string; n?: string; done?: boolean; line?: number; gap?: boolean };

function parse(md: string) {
  const out: Block[] = [];
  let code: string[] | null = null;
  let gap = false;
  const push = (block: Block) => {
    block.gap = gap;
    gap = false;
    out.push(block);
  };
  md.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      if (code) {
        push({ type: "code", text: code.join("\n") });
        code = null;
      } else code = [];
      return;
    }
    if (code) {
      code.push(line);
      return;
    }
    if (!line.trim()) {
      gap = out.length > 0;
      return;
    }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) push({ type: "h" + m[1].length, text: m[2] });
    else if ((m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/))) push({ type: "task", done: m[1] !== " ", text: m[2], line: index });
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) push({ type: "bullet", text: m[1] });
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) push({ type: "num", n: m[1], text: m[2] });
    else if ((m = line.match(/^>\s?(.*)$/))) push({ type: "quote", text: m[1] });
    else push({ type: "p", text: line.trim() });
  });
  if (code) push({ type: "code", text: (code as string[]).join("\n") });
  return out;
}

// Negrito, itálico, código e links dentro de uma linha.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = out.length;
    if (token.startsWith("**")) out.push(<strong key={key} style={{ fontWeight: 600 }}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(
        <code key={key} style={css("font-family: var(--font-mono); font-size: 0.88em; background: oklch(1 0 0 / 8%); padding: 1px 5px; border-radius: 4px")}>
          {token.slice(1, -1)}
        </code>,
      );
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      out.push(
        /^https?:\/\/\S+\.\S+/.test(link[2]) ? (
          <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" style={css("color: oklch(0.84 0.09 215); text-decoration: underline; text-underline-offset: 2px")}>
            {link[1]}
          </a>
        ) : (
          link[1]
        ),
      );
    } else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Preview({ md, locked, toggle }: { md: string; locked: boolean; toggle: (line: number) => void }) {
  const blocks = parse(md);
  const listy = (type: string) => type === "bullet" || type === "num" || type === "task";
  return (
    <>
      {blocks.map((block, i) => {
        const t = block.type;
        const heading = t === "h1" || t === "h2" || t === "h3";
        const size = t === "h1" ? 20 : t === "h2" ? 16.5 : t === "h3" ? 14.5 : t === "code" ? 12.5 : 14;
        const lh = heading ? 1.35 : t === "code" ? 1.6 : 1.65;
        let mt = 8;
        if (heading) mt = 18;
        else if (i > 0 && listy(t) && listy(blocks[i - 1].type) && !block.gap) mt = 3;
        else if (block.gap) mt = 12;
        if (i === 0) mt = 0;
        const color = heading ? "oklch(0.96 0.006 85)" : t === "quote" || (t === "task" && block.done) ? "oklch(0.72 0.012 268)" : "oklch(0.88 0.008 268)";
        const markTop = ((size * lh - (t === "task" ? 16 : 5)) / 2).toFixed(1) + "px";
        return (
          <div
            key={i}
            style={css(
              `display: flex; align-items: flex-start; gap: 10px; margin-top: ${mt}px; padding: ${t === "code" ? "10px 12px" : t === "quote" ? "0 0 0 12px" : "0"}; border-left: ${
                t === "quote" ? "2px solid oklch(1 0 0 / 18%)" : "0"
              }; border-radius: ${t === "code" ? "8px" : "0"}; background: ${t === "code" ? "oklch(1 0 0 / 5%)" : "transparent"}; font-size: ${size}px; font-weight: ${heading ? 600 : 400}; line-height: ${lh}; color: ${color}`,
            )}
          >
            {t === "bullet" && <span aria-hidden="true" style={css(`flex: none; width: 5px; height: 5px; margin: ${markTop} 3px 0 2px; border-radius: 99px; background: oklch(0.68 0.012 268)`)}></span>}
            {t === "num" && <span style={css(`flex: none; min-width: 16px; ${MONO}; font-size: 12px; color: oklch(0.68 0.012 268)`)}>{block.n}.</span>}
            {t === "task" && (
              <button
                className="b-btn"
                role="checkbox"
                aria-checked={!!block.done}
                aria-label={(block.done ? "Desmarcar: " : "Marcar: ") + block.text}
                disabled={locked}
                onClick={() => toggle(block.line!)}
                style={css(
                  `flex: none; display: grid; place-items: center; width: 16px; height: 16px; margin-top: ${markTop}; box-sizing: border-box; padding: 0; border-radius: 5px; border: 1px solid ${
                    block.done ? "oklch(0.94 0.006 85)" : "oklch(1 0 0 / 30%)"
                  }; background: ${block.done ? "oklch(0.94 0.006 85)" : "transparent"}; color: oklch(0.18 0.008 268); cursor: pointer`,
                )}
              >
                <Svg size={11} weight={3} style={{ visibility: block.done ? "visible" : "hidden" }}>
                  <path d="m5 12.5 4.5 4.5L19 7"></path>
                </Svg>
              </button>
            )}
            <span
              style={css(
                `flex: 1; min-width: 0; white-space: ${t === "code" ? "pre-wrap" : "normal"}; font-family: ${t === "code" ? "var(--font-mono)" : "inherit"}; text-decoration: ${
                  t === "task" && block.done ? "line-through" : "none"
                }; overflow-wrap: anywhere`,
              )}
            >
              {t === "code" ? block.text : inline(block.text)}
            </span>
          </div>
        );
      })}
    </>
  );
}
