// Skills e rotinas: o widget da esquerda (o que está rodando, as favoritas e as
// próximas rotinas) e o painel Gerenciar. Rodar abre uma sessão do Claude na
// pasta do cérebro; a lista "Agora" acompanha a sessão até o resultado.
import { useState, type KeyboardEvent } from "react";
import type { Run } from "../../server/runs";
import { css } from "../css";
import { MAX_FAVS, ago, nextRun, plural, span, until, when, type Catalog, type Runnable } from "../home";
import { Svg } from "./Icons";

const GLASS = "border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 88%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 16px 40px oklch(0 0 0 / 40%)";
const MONO = "font-family: 'Geist Mono', ui-monospace, monospace";
const hue = (area: string) => "var(--area-" + area + ")";

const Robot = ({ size = 13 }: { size?: number }) => (
  <Svg size={size} weight={1.9} style={{ flex: "none" }}>
    <path d="M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M15 13v2M9 13v2"></path>
  </Svg>
);
const Play = ({ size = 9 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l12.5-7.5z"></path>
  </svg>
);
const RoutineMark = ({ size, weight }: { size: number; weight: number }) => (
  <Svg size={size} weight={weight} style={{ flex: "none", color: "var(--brain-routine)" }}>
    <path d="M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M15 13v2M9 13v2"></path>
  </Svg>
);

// As rotinas com a próxima vez, das mais perto para as mais longe.
export function upcoming(cat: Catalog, now: number) {
  return cat.routines
    .map((item) => ({ item, next: nextRun(item.rule, now) }))
    .filter((one) => one.next)
    .sort((a, b) => a.next - b.next);
}

type WidgetProps = {
  cat: Catalog;
  favs: string[];
  nextCount: number;
  now: number;
  runs: Run[];
  run: (item: Runnable, text?: string) => void;
  openRun: (run: Run) => void;
  dismissRun: (run: Run) => void;
  go: (path: string) => void;
  manage: (tab: "skills" | "routines") => void;
  customize: () => void;
};

// A cor do ponto de uma sessão: rodando, pronta, com erro ou parada.
const dot = (run: Run) =>
  run.status === "rodando"
    ? run.kind === "routine"
      ? "var(--brain-routine)"
      : "var(--foreground)"
    : run.status === "pronta"
      ? "var(--ok)"
      : run.status === "falhou"
        ? "oklch(0.7 0.17 22)"
        : "oklch(0.6 0.012 268)";

export function SkillsWidget({ cat, favs, nextCount, now, runs, run, openRun, dismissRun, go, manage, customize }: WidgetProps) {
  const [composer, setComposer] = useState<string | null>(null);
  const [text, setText] = useState("");
  const composing = composer ? cat.byPath[composer] : null;
  const list = favs.map((path) => cat.byPath[path]).filter(Boolean);
  const soon = upcoming(cat, now).slice(0, nextCount);
  const empty = !cat.skills.length && !cat.routines.length;
  // As que rodam primeiro, depois as mais recentes: três no máximo.
  const live = (one: Run) => one.status === "rodando";
  const running = runs.filter(live).length;
  const shown = runs
    .slice()
    .sort((a, b) => Number(live(b)) - Number(live(a)) || b.startedAt - a.startedAt)
    .slice(0, 3);
  const send = () => {
    if (!composing) return;
    run(composing, text);
    setComposer(null);
    setText("");
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      setComposer(null);
      setText("");
    }
  };

  return (
    <section
      aria-label="Skills e rotinas"
      className="b-side b-scroll"
      style={css(`flex: none; margin-top: auto; display: flex; flex-direction: column; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding-bottom: 6px; ${GLASS}; pointer-events: auto`)}
    >
      <div style={css("flex: none; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 6px 0 13px")}>
        <Svg style={{ flex: "none", color: "oklch(0.74 0.012 268)" }}>
          <path d="M8 3.5 12.5 8 8 12.5 3.5 8z"></path>
          <path d="M16 11a5 5 0 1 0 0 10a5 5 0 1 0 0-10M16 15.2a.8.8 0 1 0 0 1.6a.8.8 0 1 0 0-1.6"></path>
        </Svg>
        <h2 style={css("min-width: 0; margin: 0; overflow: hidden; font-size: 13px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis")}>Skills e rotinas</h2>
        {running > 0 && (
          <span
            style={css(
              "flex: none; display: flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px 0 6px; border-radius: 99px; background: color-mix(in oklch, var(--brain-routine) 13%, transparent); color: var(--brain-routine); font-size: 11.5px; font-weight: 500; white-space: nowrap",
            )}
          >
            <span className="b-live" style={css("width: 6px; height: 6px; border-radius: 99px; background: var(--brain-routine)")}></span>
            {running} rodando
          </span>
        )}
        <button
          className="b-btn b-ghost"
          onClick={() => manage("skills")}
          style={css("flex: none; margin-left: auto; height: 28px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.8 0.012 268); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer")}
        >
          Gerenciar
        </button>
      </div>
      {shown.length > 0 && (
        <div style={css("display: flex; flex-direction: column; gap: 4px; padding: 0 6px 6px")}>
          <div style={css("padding: 2px 7px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Agora</div>
          {shown.map((one) => {
            const on = live(one);
            return (
              <div key={one.id} style={css("display: flex; flex-direction: column; gap: 5px; padding: 8px 8px 9px 10px; border-radius: 9px; background: oklch(1 0 0 / 4%)")}>
                <div style={css("display: flex; align-items: center; gap: 8px; min-height: 18px")}>
                  <span className={on ? "b-live" : ""} style={css(`flex: none; width: 7px; height: 7px; border-radius: 99px; background: ${dot(one)}`)}></span>
                  <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; font-weight: 500")}>{one.label}</span>
                  <span style={css(`flex: none; ${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{on ? span(now - one.startedAt) : ago(one.endedAt ?? one.startedAt, now)}</span>
                  <button
                    className="b-btn b-ghost"
                    aria-label={on ? "Parar " + one.label : "Tirar " + one.label + " da lista"}
                    title={on ? "Parar a sessão" : "Tirar da lista"}
                    onClick={() => dismissRun(one)}
                    style={css("flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin: -2px -3px -2px 0; border: 0; border-radius: 6px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
                  >
                    <Svg size={12} weight={2}>
                      <path d="M18 6 6 18"></path>
                      <path d="m6 6 12 12"></path>
                    </Svg>
                  </button>
                </div>
                <div style={css("display: flex; align-items: center; gap: 8px; padding-left: 15px; font-size: 12px; color: oklch(0.72 0.012 268)")}>
                  <span title={one.step} style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>
                    {one.step}
                  </span>
                  {one.file && (
                    <button
                      className="b-btn b-ghost"
                      onClick={() => openRun(one)}
                      style={css("flex: none; display: flex; align-items: center; height: 22px; margin: -3px -3px -3px 0; padding: 0 7px; border: 0; border-radius: 6px; background: transparent; color: oklch(0.9 0.008 268); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer")}
                    >
                      Ver resultado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {empty ? (
        <div style={css("padding: 0 14px 8px; font-size: 12.5px; line-height: 1.5; color: oklch(0.74 0.012 268)")}>
          Nenhuma skill no cérebro ainda. Elas vêm de <span style={css(`${MONO}; font-size: 11.5px`)}>.claude/skills/</span>.
        </div>
      ) : (
        <div style={css("display: flex; flex-direction: column; padding: 0 6px")}>
          <div style={css("padding: 4px 7px 3px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Favoritas</div>
          {list.map((item) => {
            const open = composer === item.path;
            return (
              <button
                key={item.path}
                className="b-btn b-row b-fav"
                aria-label={"Rodar " + item.label}
                aria-expanded={open}
                onClick={() => {
                  setComposer(open ? null : item.path);
                  setText("");
                }}
                style={css(
                  `flex: none; display: flex; align-items: center; gap: 9px; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: ${
                    open ? "oklch(1 0 0 / 7%)" : "transparent"
                  }; color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer`,
                )}
              >
                <Robot />
                <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{item.label}</span>
                <span style={css("flex: none; display: grid; justify-items: end; align-items: center")}>
                  <span
                    className="b-dept"
                    style={css("grid-area: 1 / 1; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: oklch(0.7 0.012 268); white-space: nowrap; transition: opacity 0.12s ease")}
                  >
                    <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${hue(item.area)}`)}></span>
                    {item.areaLabel}
                  </span>
                  <span className="b-go" style={css("grid-area: 1 / 1; display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; white-space: nowrap; transition: opacity 0.12s ease")}>
                    <Play />
                    Rodar
                  </span>
                </span>
              </button>
            );
          })}
          {!list.length && (
            <button
              className="b-btn b-ghost"
              onClick={customize}
              style={css("display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.8 0.012 268); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer")}
            >
              <Svg size={13} weight={2}>
                <path d="M12 5v14M5 12h14"></path>
              </Svg>
              Escolher as favoritas
            </button>
          )}
          {composing && (
            <div style={css("display: flex; flex-direction: column; gap: 7px; margin: 4px 0 2px; padding: 10px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 4%); animation: b-rise 0.16s ease-out")}>
              <label htmlFor="b-compose" style={css("font-size: 12px; color: oklch(0.74 0.012 268)")}>
                Rodar <strong style={css("font-weight: 500; color: oklch(0.94 0.006 85)")}>{composing.label}</strong> no Claude
              </label>
              <div style={css("display: flex; gap: 6px")}>
                <input
                  id="b-compose"
                  className="b-input"
                  autoFocus
                  type="text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={key}
                  placeholder="Instruções (opcional)"
                  autoComplete="off"
                  style={css(
                    "flex: 1; min-width: 0; height: 30px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 4%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px",
                  )}
                />
                <button
                  className="b-btn b-main"
                  onClick={send}
                  style={css("flex: none; height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer")}
                >
                  Rodar
                </button>
              </div>
              <div style={css("font-size: 11px; color: oklch(0.66 0.012 268)")}>Enter roda · Esc cancela</div>
            </div>
          )}
        </div>
      )}
      {soon.length > 0 && (
        <div style={css("display: flex; flex-direction: column; padding: 4px 6px 0")}>
          <div style={css("display: flex; align-items: center; justify-content: space-between; padding: 4px 3px 3px 7px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>
            <span>Próximas rotinas</span>
            <button
              className="b-btn b-ghost"
              onClick={() => manage("routines")}
              style={css("height: 22px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: oklch(0.74 0.012 268); font: inherit; font-size: 11.5px; cursor: pointer")}
            >
              Ver todas
            </button>
          </div>
          {soon.map(({ item, next }) => (
            <button
              key={item.path}
              className="b-btn b-row"
              title={when(next, now) + " · " + item.schedule}
              onClick={() => go(item.path)}
              style={css(
                "flex: none; display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.88 0.008 268); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer",
              )}
            >
              <RoutineMark size={13} weight={1.9} />
              <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{item.label}</span>
              <span style={css(`flex: none; ${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{until(next, now)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type ManagerProps = {
  cat: Catalog;
  tab: "skills" | "routines";
  favs: string[];
  now: number;
  setTab: (tab: "skills" | "routines") => void;
  toggleFav: (path: string) => void;
  run: (item: Runnable) => void;
  go: (path: string) => void;
  close: () => void;
  customize: () => void;
};

const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// A gaveta da direita: todas as skills e rotinas, com busca, estrela e Rodar.
export function Manager({ cat, tab, favs, now, setTab, toggleFav, run, go, close, customize }: ManagerProps) {
  const [mq, setMq] = useState("");
  // A busca: pelo nome, sem ligar para acento nem maiúscula, nas duas abas ao mesmo tempo.
  const needle = plain(mq.trim());
  const found = (item: Runnable) => !needle || plain(item.label).includes(needle);
  const mark = (label: string) => {
    const at = needle ? plain(label).indexOf(needle) : -1;
    if (at < 0) return <>{label}</>;
    return (
      <>
        {label.slice(0, at)}
        <span style={css("font-weight: 600; color: oklch(0.99 0.006 85)")}>{label.slice(at, at + needle.length)}</span>
        {label.slice(at + needle.length)}
      </>
    );
  };
  const skills = cat.skills.filter(found);
  const groups: { area: string; label: string; items: Runnable[] }[] = [];
  for (const item of skills) {
    const last = groups[groups.length - 1];
    if (last && last.area === item.area) last.items.push(item);
    else groups.push({ area: item.area, label: item.areaLabel, items: [item] });
  }
  const next = new Map(upcoming(cat, now).map((one) => [one.item.path, one.next]));
  const routines = cat.routines.filter(found);
  const favSet = new Set(favs);
  const full = favs.length >= MAX_FAVS;
  const here = tab === "skills" ? skills.length : routines.length;
  const there = tab === "skills" ? routines.length : skills.length;
  const seg = (on: boolean) =>
    css(
      `flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; height: 28px; border: 0; border-radius: 7px; font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; background: ${
        on ? "oklch(1 0 0 / 13%)" : "transparent"
      }; color: ${on ? "oklch(0.96 0.006 85)" : "oklch(0.74 0.012 268)"}`,
    );
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && mq) {
      event.stopPropagation();
      setMq("");
    }
    // Enter leva ao primeiro resultado no cérebro.
    if (event.key === "Enter") {
      event.preventDefault();
      const first = tab === "skills" ? skills[0] : routines[0];
      if (first) go(first.path);
    }
  };

  return (
    <aside
      aria-label="Skills e rotinas"
      style={css(
        "position: absolute; top: 0; right: 0; bottom: 0; width: 440px; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; background: oklch(0.165 0.008 268 / 96%); backdrop-filter: blur(24px); border-left: 1px solid oklch(1 0 0 / 9%); box-shadow: -30px 0 70px oklch(0 0 0 / 40%); animation: b-slide 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
      )}
    >
      <div style={css("flex: none; display: flex; align-items: center; gap: 8px; height: 54px; padding: 0 12px 0 20px; border-bottom: 1px solid oklch(1 0 0 / 8%)")}>
        <h2 style={css("flex: 1; margin: 0; font-size: 14px; font-weight: 600")}>Skills e rotinas</h2>
        <button
          className="b-btn b-ghost"
          aria-label="Fechar"
          onClick={close}
          style={css("flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
        >
          <Svg weight={2}>
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </Svg>
        </button>
      </div>
      <div style={css("flex: none; display: flex; flex-direction: column; gap: 10px; padding: 12px 16px 4px")}>
        <label
          className="b-field"
          style={css(
            "display: flex; align-items: center; gap: 8px; height: 36px; box-sizing: border-box; padding: 0 6px 0 11px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 4%); color: oklch(0.74 0.012 268); cursor: text; transition: border-color 0.15s ease",
          )}
        >
          <Svg size={14} style={{ flex: "none" }}>
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
          </Svg>
          <input
            autoFocus
            type="text"
            value={mq}
            onChange={(event) => setMq(event.target.value)}
            onKeyDown={enter}
            placeholder="Buscar skills e rotinas pelo nome"
            aria-label="Buscar skills e rotinas pelo nome"
            autoComplete="off"
            spellCheck={false}
            style={css("flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: none; background: transparent; color: oklch(0.94 0.006 85); font: inherit; font-size: 13px")}
          />
          {!!mq && (
            <button
              className="b-btn b-ghost"
              aria-label="Limpar a busca"
              onClick={() => setMq("")}
              style={css("flex: none; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
            >
              <Svg size={12} weight={2}>
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </Svg>
            </button>
          )}
        </label>
        <div role="tablist" aria-label="Tipo" style={css("display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: oklch(1 0 0 / 6%)")}>
          {(["skills", "routines"] as const).map((key) => (
            <button key={key} className="b-btn b-seg" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={seg(tab === key)}>
              {key === "skills" ? "Skills" : "Rotinas"}
              {/* Com busca, as abas mostram quantos nomes bateram em cada uma. */}
              <span style={css(`${MONO}; font-size: 11px; color: oklch(0.7 0.012 268)`)}>{key === "skills" ? skills.length : routines.length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="b-scroll" style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 0 10px 16px")}>
        {tab === "skills" &&
          groups.map((group) => (
            <div key={group.area}>
              <div style={css("display: flex; align-items: center; gap: 7px; padding: 14px 8px 4px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>
                <span style={css(`width: 7px; height: 7px; border-radius: 99px; background: ${hue(group.area)}`)}></span>
                {group.label}
              </div>
              {group.items.map((item) => {
                const fav = favSet.has(item.path);
                return (
                  <div key={item.path} style={css("display: flex; align-items: center; gap: 4px")}>
                    <button
                      className="b-btn b-row"
                      title="Ver no cérebro"
                      onClick={() => go(item.path)}
                      style={css(
                        "flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; font-size: 13px; text-align: left; cursor: pointer",
                      )}
                    >
                      <Robot />
                      <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{mark(item.label)}</span>
                    </button>
                    <button
                      className="b-btn b-ghost"
                      aria-label={fav ? "Tirar " + item.label + " das favoritas" : "Pôr " + item.label + " nas favoritas"}
                      aria-pressed={fav}
                      title={fav ? "Favorita" : full ? "Até 6 favoritas" : "Pôr nas favoritas"}
                      disabled={!fav && full}
                      onClick={() => toggleFav(item.path)}
                      style={css(
                        `flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: ${
                          fav ? "oklch(0.94 0.006 85)" : "oklch(0.66 0.012 268)"
                        }; cursor: pointer`,
                      )}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"></path>
                      </svg>
                    </button>
                    <button
                      className="b-btn b-solid"
                      aria-label={"Rodar " + item.label}
                      title="Rodar no Claude"
                      onClick={() => run(item)}
                      style={css(
                        "flex: none; display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px 0 8px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer",
                      )}
                    >
                      <Play />
                      Rodar
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        {tab === "routines" && (
          <>
            <div style={css("height: 8px")}></div>
            {routines.map((item) => {
              const at = next.get(item.path);
              return (
                <div key={item.path} style={css("display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-bottom: 1px solid oklch(1 0 0 / 6%)")}>
                  <RoutineMark size={15} weight={1.8} />
                  <button
                    className="b-btn"
                    title="Ver no cérebro"
                    onClick={() => go(item.path)}
                    style={css(
                      "flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 0; border: 0; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer",
                    )}
                  >
                    <span style={css("max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px")}>{mark(item.label)}</span>
                    <span style={css("max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11.5px; color: oklch(0.7 0.012 268)")}>
                      {[item.areaLabel, item.schedule].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  {at ? <span style={css(`flex: none; ${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{until(at, now)}</span> : null}
                  <button
                    className="b-btn b-ghost"
                    aria-label={"Rodar " + item.label + " agora"}
                    title="Rodar no Claude"
                    onClick={() => run(item)}
                    style={css("flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.86 0.008 268); cursor: pointer")}
                  >
                    <Play size={10} />
                  </button>
                </div>
              );
            })}
          </>
        )}
        {!here && (
          <div style={css("display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 20px 8px")}>
            <div style={css("font-size: 13px; line-height: 1.5; color: oklch(0.8 0.01 268)")}>
              {needle
                ? (tab === "skills" ? "Nenhuma skill" : "Nenhuma rotina") + " com “" + mq.trim() + "” no nome."
                : tab === "skills"
                  ? "Nenhuma skill no cérebro ainda. Elas vêm de .claude/skills/."
                  : "Nenhuma rotina ainda. Uma skill com schedule: no SKILL.md vira rotina."}
            </div>
            {/* Nada nesta aba, mas tem na outra: um atalho para ela. */}
            {!!needle && there > 0 && (
              <button
                className="b-btn b-solid"
                onClick={() => setTab(tab === "skills" ? "routines" : "skills")}
                style={css(
                  "display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px 0 11px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer",
                )}
              >
                {"Ver " + (tab === "skills" ? plural(there, "rotina", "rotinas") : plural(there, "skill", "skills")) + " com esse nome"}
                <Svg size={13} weight={2}>
                  <path d="m9 18 6-6-6-6"></path>
                </Svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div style={css("flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px 12px 20px; border-top: 1px solid oklch(1 0 0 / 8%)")}>
        <span style={css("font-size: 12px; color: oklch(0.72 0.012 268)")}>{tab === "routines" ? "O horário vem do schedule: de cada uma." : "A estrela põe a skill no widget."}</span>
        <button
          className="b-btn b-solid"
          onClick={customize}
          style={css(
            "flex: none; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer",
          )}
        >
          Personalizar o widget
        </button>
      </div>
    </aside>
  );
}
