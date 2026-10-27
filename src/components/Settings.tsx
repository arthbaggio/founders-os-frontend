// O Personalizar: o diálogo que diz o que aparece em volta do mapa e como o
// mapa se mostra. Tudo muda na hora e fica guardado neste navegador.
import { useState } from "react";
import type { View } from "../brain/engine";
import { css } from "../css";
import { EFFORTS, MAX_FAVS, MAX_TOOLS, MIN_TOOLS, MODELS, okUrl, type Catalog, type ClockOpts, type Show, type Tool } from "../home";
import { ClockPreview } from "./Clock";
import { ToolIcon } from "./Dock";
import { Svg } from "./Icons";

export type Tab = "home" | "map" | "skills" | "tools" | "clock" | "notes";
export type Home = { show: Show; clock: ClockOpts; tools: Tool[]; toolNames: boolean; favs: string[]; nextCount: number; archive: boolean; model: string; effort: string };
export type MapOpts = { view: View; group: "dept" | "folder"; names: boolean; spin: number; springs: number };

const TABS: { key: Tab; label: string; desc: string; d: string }[] = [
  { key: "home", label: "Tela inicial", desc: "Escolha o que aparece em volta do cérebro.", d: "M4 4.5h6.5V12H4zM13.5 4.5H20V9h-6.5zM13.5 12H20v7.5h-6.5zM4 15h6.5v4.5H4z" },
  {
    key: "map",
    label: "Mapa",
    desc: "Como o mapa se mostra em cada vista; o que não vale para a vista escolhida fica apagado. Enquanto você segura um controle, só ele fica na tela e o mapa aparece mudando por trás.",
    d: "M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20",
  },
  { key: "skills", label: "Skills e rotinas", desc: "O que o widget mostra, quais skills ficam à mão e com que modelo as sessões rodam.", d: "M12 3.5 20.5 12 12 20.5 3.5 12z" },
  {
    key: "tools",
    label: "Ferramentas",
    desc: "Os atalhos da barra de baixo, de 4 a 8.",
    d: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  },
  { key: "clock", label: "Relógio", desc: "Discreto, num canto de cima.", d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5V12l3 2" },
  { key: "notes", label: "Notas", desc: "Como as notas viram wiki.", d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4z" },
];

const VIEWS: [View, string][] = [
  ["depts", "Departamentos"],
  ["rings", "Anéis"],
  ["force", "Força"],
];

const MONO = "font-family: 'Geist Mono', ui-monospace, monospace";
const ROW = "display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid oklch(1 0 0 / 6%)";
const SOLID =
  "display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 11px 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer";
const GHOST = "flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer";
const seg = (on: boolean, extra = "height: 24px; padding: 0 9px") =>
  css(
    `${extra}; border: 0; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; background: ${on ? "oklch(1 0 0 / 13%)" : "transparent"}; color: ${
      on ? "oklch(0.96 0.006 85)" : "oklch(0.74 0.012 268)"
    }`,
  );

function Switch({ on, toggle, labelledBy }: { on: boolean; toggle: () => void; labelledBy: string }) {
  return (
    <button
      className="b-btn"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={toggle}
      style={css(
        `flex: none; display: flex; justify-content: ${on ? "flex-end" : "flex-start"}; width: 32px; height: 18px; box-sizing: border-box; padding: 2px; border: 0; border-radius: 99px; background: ${
          on ? "oklch(0.94 0.006 85)" : "oklch(1 0 0 / 18%)"
        }; cursor: pointer`,
      )}
    >
      <span style={css(`display: block; width: 14px; height: 14px; border-radius: 99px; background: ${on ? "oklch(0.2 0.008 268)" : "oklch(0.82 0.008 268)"}`)}></span>
    </button>
  );
}

function Label({ id, label, desc }: { id?: string; label: string; desc: string }) {
  return (
    <div style={css("flex: 1; min-width: 0")}>
      <div id={id} style={css("font-weight: 500")}>
        {label}
      </div>
      <div style={css("margin-top: 2px; font-size: 12px; color: oklch(0.7 0.012 268)")}>{desc}</div>
    </div>
  );
}

type Props = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  close: () => void;
  reset: (tab: Tab) => void;
  home: Home;
  patch: (next: Partial<Home>) => void;
  map: MapOpts;
  setMap: (next: Partial<MapOpts>) => void;
  removed: number;
  restore: () => void;
  cat: Catalog;
  manage: () => void;
};

export function Settings({ tab, setTab, close, reset, home, patch, map, setMap, removed, restore, cat, manage }: Props) {
  // Enquanto um controle deslizante está seguro, o diálogo some e só ele fica: dá para ver o mapa mudando.
  const [peek, setPeek] = useState<"spin" | "springs" | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const head = TABS.find((item) => item.key === tab) ?? TABS[0];
  const fade = peek ? 0 : 1;
  const { show, clock } = home;
  const flip = (key: keyof Show) => () => patch({ show: { ...show, [key]: !show[key] } });
  const setClock = (next: Partial<ClockOpts>) => () => patch({ clock: { ...clock, ...next } });

  const hold = (key: "spin" | "springs") => () => {
    setPeek(key);
    const stop = () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setPeek(null);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  // --- Tela inicial ---
  const toggle = (key: keyof Show, label: string, desc: string) => (
    <div key={key} onMouseEnter={() => setZone(key)} onMouseLeave={() => setZone(null)} style={css(ROW)}>
      <Label id={"b-sw-" + key} label={label} desc={desc} />
      <Switch on={show[key]} toggle={flip(key)} labelledBy={"b-sw-" + key} />
    </div>
  );
  const left = clock.side === "left";
  // A miniatura tem a proporção da tela (16:10): cada bloco fica onde ele fica de verdade.
  const zones: [string, string, string, string, string, string, string, boolean][] = [
    ["views", left ? "8.1%" : "1.1%", "1.6%", "21.1%", "4.2%", "4px", "", show.views],
    ["clock", left ? "1.1%" : "92.6%", "2.2%", "6.3%", "3%", "3px", "", show.clock],
    ["title", "42%", "1.8%", "16%", "8%", "4px", "", show.title],
    ["search", left ? "72.4%" : "65.6%", "1.6%", "17.2%", "4.2%", "4px", "", show.search],
    ["gear", left ? "90.2%" : "83.4%", "1.6%", "8.7%", "4.2%", "4px", "", true],
    ["skills", "1.1%", "52%", "21.4%", "46.2%", "6px", "Skills e rotinas", show.skills],
    ["tools", "38.2%", "92%", "23.7%", "6.2%", "6px", "Ferramentas", show.tools],
    ["notes", "78.1%", show.legendBar ? "70.4%" : "76%", "20.8%", "22.2%", "6px", "Notas", show.notes],
    ["legendBar", "85.2%", "94%", "13.7%", "4.2%", "4px", "", show.legendBar],
  ];

  // --- Mapa: o que não vale para a vista escolhida fica apagado, mas continua ajustável ---
  const graph = map.view !== "depts";
  const slider = (key: "spin" | "springs", label: string, desc: string, dim: number) => {
    const held = peek === key;
    const value = map[key];
    return (
      <label
        style={css(
          `display: flex; flex-direction: column; gap: 4px; padding: 12px 0 6px; border-bottom: 1px solid ${peek ? "transparent" : "oklch(1 0 0 / 6%)"}; border-radius: ${held ? "10px" : "0"}; background: ${
            held ? "oklch(0.21 0.008 268 / 96%)" : "transparent"
          }; box-shadow: ${
            held ? "0 0 0 14px oklch(0.21 0.008 268 / 96%), 0 0 0 15px oklch(1 0 0 / 12%), 0 18px 44px oklch(0 0 0 / 50%)" : "none"
          }; opacity: ${peek ? (held ? 1 : 0) : dim}; transition: opacity 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease`,
        )}
      >
        <span style={css("display: flex; align-items: flex-start; justify-content: space-between; gap: 12px")}>
          <span style={css("display: flex; flex-direction: column; gap: 2px")}>
            <span style={css("font-weight: 500")}>{label}</span>
            <span style={css("font-size: 12px; color: oklch(0.7 0.012 268)")}>{desc}</span>
          </span>
          <span style={css(`flex: none; ${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{(value / 100).toFixed(2)}</span>
        </span>
        <input
          className="b-range"
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(event) => setMap({ [key]: Number(event.target.value) })}
          onPointerDown={hold(key)}
          // O trilho preenchido até o centro do botão, que anda 16px a menos que a largura.
          style={{ background: `linear-gradient(to right, oklch(0.94 0.006 85 / 85%) calc(8px + (100% - 16px) * ${value / 100}), oklch(1 0 0 / 14%) calc(8px + (100% - 16px) * ${value / 100})) center / 100% 4px no-repeat` }}
        />
      </label>
    );
  };

  // --- Skills e rotinas ---
  const favSet = new Set(home.favs);
  const full = home.favs.length >= MAX_FAVS;
  const groups: { area: string; label: string; items: Catalog["skills"] }[] = [];
  for (const item of cat.skills) {
    const last = groups[groups.length - 1];
    if (last && last.area === item.area) last.items.push(item);
    else groups.push({ area: item.area, label: item.areaLabel, items: [item] });
  }
  const toggleFav = (path: string) => patch({ favs: favSet.has(path) ? home.favs.filter((one) => one !== path) : full ? home.favs : [...home.favs, path] });

  // --- Ferramentas ---
  const tools = home.tools;
  const setTool = (index: number, next: Partial<Tool>) => patch({ tools: tools.map((tool, i) => (i === index ? { ...tool, ...next } : tool)) });
  const moveTool = (index: number, by: number) => {
    const list = tools.slice();
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    patch({ tools: list });
  };
  const bad = (url: string) => url.trim().length > 8 && !okUrl(url);

  return (
    <div style={css("position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box")}>
      <button
        className="b-scrim"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={close}
        style={css(
          `position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: ${peek ? "oklch(0.1 0.008 268 / 0%)" : "oklch(0.1 0.008 268 / 55%)"}; backdrop-filter: ${
            peek ? "none" : "blur(3px)"
          }; cursor: default; transition: background-color 0.18s ease`,
        )}
      ></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Personalizar"
        className="b-set"
        style={css(
          `position: relative; display: flex; width: 800px; max-width: 100%; height: 620px; max-height: 100%; overflow: hidden; border-radius: 16px; border: 1px solid ${
            peek ? "transparent" : "oklch(1 0 0 / 10%)"
          }; background: ${peek ? "transparent" : "oklch(0.17 0.008 268 / 98%)"}; box-shadow: ${
            peek ? "none" : "0 1px 0 oklch(1 0 0 / 6%) inset, 0 40px 90px oklch(0 0 0 / 60%)"
          }; transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; animation: b-dialog 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)`,
        )}
      >
        <nav
          aria-label="Seções"
          className="b-setnav"
          style={css(
            `flex: none; display: flex; flex-direction: column; gap: 2px; width: 204px; box-sizing: border-box; padding: 14px 10px; border-right: 1px solid oklch(1 0 0 / 8%); background: oklch(1 0 0 / 2%); opacity: ${fade}; transition: opacity 0.18s ease`,
          )}
        >
          <div className="b-setnav-title" style={css("padding: 4px 10px 12px; font-size: 13px; font-weight: 600")}>
            Personalizar
          </div>
          {TABS.map((item) => {
            const on = item.key === tab;
            return (
              <button
                key={item.key}
                className="b-btn b-nav"
                aria-current={on ? "page" : "false"}
                onClick={() => {
                  setTab(item.key);
                  setZone(null);
                }}
                style={css(
                  `flex: none; display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: ${on ? "oklch(1 0 0 / 9%)" : "transparent"}; color: ${
                    on ? "oklch(0.97 0.006 85)" : "oklch(0.78 0.012 268)"
                  }; font: inherit; font-size: 13px; font-weight: 500; text-align: left; white-space: nowrap; cursor: pointer`,
                )}
              >
                <Svg style={{ flex: "none" }}>
                  <path d={item.d}></path>
                </Svg>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={css("flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column")}>
          <div style={css(`flex: none; display: flex; align-items: flex-start; gap: 12px; padding: 18px 14px 12px 24px; opacity: ${fade}; transition: opacity 0.18s ease`)}>
            <div style={css("flex: 1; min-width: 0")}>
              <h2 style={css("margin: 0; font-size: 16px; font-weight: 600")}>{head.label}</h2>
              <p style={css("margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: oklch(0.74 0.012 268); text-wrap: pretty")}>{head.desc}</p>
            </div>
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
          <div className={"b-scroll" + (peek ? " b-peeking" : "")} style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 4px 24px 20px")}>
            {tab === "home" && (
              <>
                <div
                  aria-hidden="true"
                  style={css(
                    "position: relative; width: min(100%, 420px); aspect-ratio: 16 / 10; margin: 4px auto 16px; overflow: hidden; border-radius: 12px; border: 1px solid oklch(1 0 0 / 10%); background: radial-gradient(120% 90% at 50% 45%, oklch(0.18 0.008 268), oklch(0.12 0.008 268))",
                  )}
                >
                  <span style={css("position: absolute; left: 50%; top: 51%; height: 52%; aspect-ratio: 1 / 1; transform: translate(-50%, -50%); box-sizing: border-box; border-radius: 99px; border: 1px dashed oklch(1 0 0 / 22%)")}></span>
                  <span
                    style={css(
                      "position: absolute; left: 50%; top: 51%; width: 24px; height: 24px; transform: translate(-50%, -50%); border-radius: 99px; background: radial-gradient(circle, oklch(0.94 0.006 85 / 55%), oklch(0.94 0.006 85 / 0%) 70%)",
                    )}
                  ></span>
                  {zones.map(([key, x, y, w, h, r, tag, on]) => {
                    const hot = zone === key;
                    return (
                      <span
                        key={key}
                        style={css(
                          `position: absolute; left: ${x}; top: ${y}; width: ${w}; height: ${h}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: ${r}; border: 1px ${
                            on ? "solid" : "dashed"
                          } ${hot ? "oklch(0.94 0.006 85 / 75%)" : on ? "oklch(1 0 0 / 16%)" : "oklch(1 0 0 / 24%)"}; background: ${
                            hot ? "oklch(0.94 0.006 85 / 18%)" : on ? "oklch(1 0 0 / 10%)" : "transparent"
                          }; opacity: ${on || hot ? 1 : 0.55}; font-size: 9.5px; font-weight: 500; white-space: nowrap; color: oklch(0.86 0.008 268); transition: opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease`,
                        )}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
                <div style={css("font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Widgets</div>
                {toggle("skills", "Skills e rotinas", "As favoritas à mão e as próximas rotinas")}
                {toggle("tools", "Ferramentas", "De 4 a 8 atalhos na barra de baixo")}
                {toggle("notes", "Notas", "Anote rápido e mande para a wiki")}
                {toggle("clock", "Relógio", "Hora, minuto e segundo, num canto de cima")}
                <div style={css("padding-top: 20px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Barra e controles</div>
                {toggle("views", "Vistas do mapa", "Departamentos, Anéis e Força")}
                {toggle("title", "Título e resumo", "O nome do que está em foco e o que tem dentro")}
                {toggle("search", "Busca", "Procure qualquer coisa no cérebro com /")}
                {toggle("legendBar", "Controles do mapa", "Legenda, expandir pastas e recentrar, embaixo à direita")}
                <p style={css("margin: 14px 0 0; font-size: 12px; color: oklch(0.68 0.012 268)")}>O botão Personalizar fica sempre no topo, para você poder voltar aqui.</p>
              </>
            )}

            {tab === "map" && (
              <>
                <div style={css(`display: flex; align-items: center; gap: 12px; padding: 4px 0 14px; border-bottom: 1px solid oklch(1 0 0 / 6%); opacity: ${fade}; transition: opacity 0.15s ease`)}>
                  <Label id="b-view" label="Vista" desc="Troca o mapa aqui mesmo" />
                  <div role="radiogroup" aria-labelledby="b-view" style={css("flex: none; display: flex; flex-wrap: wrap; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
                    {VIEWS.map(([key, label]) => (
                      <button key={key} className="b-btn b-seg" role="radio" aria-checked={map.view === key} onClick={() => setMap({ view: key })} style={seg(map.view === key, "height: 24px; padding: 0 8px")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={css(`${ROW}; opacity: ${peek ? 0 : map.view === "force" ? 1 : 0.5}; transition: opacity 0.15s ease`)}>
                  <Label id="b-group" label="Agrupar por" desc="Na vista Força" />
                  <div role="radiogroup" aria-labelledby="b-group" style={css("flex: none; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
                    {(["dept", "folder"] as const).map((key) => (
                      <button key={key} className="b-btn b-seg" role="radio" aria-checked={map.group === key} onClick={() => setMap({ group: key })} style={seg(map.group === key)}>
                        {key === "dept" ? "Departamento" : "Pasta"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={css(`${ROW}; opacity: ${peek ? 0 : graph ? 1 : 0.5}; transition: opacity 0.15s ease`)}>
                  <Label id="b-names" label="Nomes dos arquivos" desc="Nas vistas Anéis e Força" />
                  <Switch on={map.names} toggle={() => setMap({ names: !map.names })} labelledBy="b-names" />
                </div>
                {slider("spin", "Giro dos anéis", "Nas vistas Departamentos e Anéis", map.view === "force" ? 0.5 : 1)}
                {slider("springs", "Molas das ligações", "Nas vistas Anéis e Força", graph ? 1 : 0.5)}
                <div style={css(`display: flex; align-items: center; gap: 12px; padding: 12px 0; opacity: ${fade}; transition: opacity 0.15s ease`)}>
                  <Label
                    label="Itens tirados do mapa"
                    desc={removed ? (removed === 1 ? "1 item tirado" : removed + " itens tirados") + " · nada foi apagado" : "Nenhum. Dá para tirar um item pelo cartão dele."}
                  />
                  <button className="b-btn b-solid" disabled={!removed} onClick={restore} style={css(SOLID + "; flex: none; height: 30px; padding: 0 10px 0 9px; gap: 6px")}>
                    <Svg size={13}>
                      <path d="M4 9h10a5 5 0 0 1 0 10H9M4 9l4-4M4 9l4 4"></path>
                    </Svg>
                    Restaurar
                  </button>
                </div>
              </>
            )}

            {tab === "skills" && (
              <>
                <div style={css(ROW)}>
                  <Label id="b-next" label="Próximas rotinas" desc="Quantas aparecem no widget" />
                  <div role="radiogroup" aria-labelledby="b-next" style={css("flex: none; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button key={n} className="b-btn b-seg" role="radio" aria-checked={home.nextCount === n} onClick={() => patch({ nextCount: n })} style={seg(home.nextCount === n, "min-width: 28px; height: 24px; padding: 0 8px")}>
                        {n ? String(n) : "Nenhuma"}
                      </button>
                    ))}
                  </div>
                </div>
                {(
                  [
                    ["b-model", "Modelo", "O que roda as skills, as rotinas e as notas. Padrão é o do Claude Code.", MODELS, "model"],
                    ["b-effort", "Esforço", "Quanto o modelo pensa antes de responder. Mais é mais lento.", EFFORTS, "effort"],
                  ] as const
                ).map(([id, label, desc, options, key]) => (
                  <div key={id} style={css(ROW + "; flex-wrap: wrap")}>
                    <Label id={id} label={label} desc={desc} />
                    <div role="radiogroup" aria-labelledby={id} style={css("flex: none; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
                      {options.map(([value, name]) => (
                        <button key={value} className="b-btn b-seg" role="radio" aria-checked={home[key] === value} onClick={() => patch({ [key]: value })} style={seg(home[key] === value)}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={css("display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-top: 20px")}>
                  <span style={css("font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Skills favoritas</span>
                  <span style={css(`${MONO}; font-size: 11.5px; color: oklch(0.7 0.012 268)`)}>{home.favs.length + " de " + MAX_FAVS}</span>
                </div>
                <p style={css("margin: 3px 0 4px; font-size: 12px; color: oklch(0.7 0.012 268)")}>Aparecem no widget para rodar com um clique. Até 6.</p>
                {!cat.skills.length && (
                  <p style={css("margin: 10px 0 0; font-size: 12.5px; color: oklch(0.8 0.01 268)")}>
                    Nenhuma skill no cérebro ainda. Elas vêm de <span style={css(`${MONO}; font-size: 11.5px`)}>.claude/skills/</span>.
                  </p>
                )}
                {groups.map((group) => (
                  <div key={group.area}>
                    <div style={css("display: flex; align-items: center; gap: 7px; padding: 10px 8px 2px; font-size: 11.5px; color: oklch(0.72 0.012 268)")}>
                      <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: var(--area-${group.area})`)}></span>
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const fav = favSet.has(item.path);
                      return (
                        <button
                          key={item.path}
                          className="b-btn b-row"
                          role="checkbox"
                          aria-checked={fav}
                          disabled={!fav && full}
                          onClick={() => toggleFav(item.path)}
                          style={css(
                            "display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer",
                          )}
                        >
                          <span
                            style={css(
                              `flex: none; display: grid; place-items: center; width: 16px; height: 16px; box-sizing: border-box; border-radius: 5px; border: 1px solid ${fav ? "oklch(0.94 0.006 85)" : "oklch(1 0 0 / 28%)"}; background: ${
                                fav ? "oklch(0.94 0.006 85)" : "transparent"
                              }; color: oklch(0.18 0.008 268)`,
                            )}
                          >
                            <Svg size={11} weight={3} style={{ visibility: fav ? "visible" : "hidden" }}>
                              <path d="m5 12.5 4.5 4.5L19 7"></path>
                            </Svg>
                          </span>
                          <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                <button className="b-btn b-solid" onClick={manage} style={css(SOLID + "; margin-top: 16px; padding: 0 9px 0 11px")}>
                  Gerenciar skills e rotinas
                  <Svg size={13} weight={2}>
                    <path d="m9 18 6-6-6-6"></path>
                  </Svg>
                </button>
              </>
            )}

            {tab === "tools" && (
              <>
                <div style={css(ROW)}>
                  <Label id="b-sw-names" label="Mostrar os nomes" desc="O nome embaixo de cada ícone, na barra" />
                  <Switch on={home.toolNames} toggle={() => patch({ toolNames: !home.toolNames })} labelledBy="b-sw-names" />
                </div>
                <div style={css("display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 20px 0 6px")}>
                  <span style={css("font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Atalhos</span>
                  <span style={css(`${MONO}; font-size: 11.5px; color: oklch(0.7 0.012 268)`)}>{tools.length + " de " + MAX_TOOLS}</span>
                </div>
                {tools.map((tool, i) => {
                  const name = tool.name.trim() || "ferramenta";
                  const wrong = bad(tool.url);
                  const locked = tools.length <= MIN_TOOLS;
                  return (
                    <div key={tool.id} style={css("display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid oklch(1 0 0 / 6%)")}>
                      <span style={css("flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: oklch(1 0 0 / 6%); color: oklch(0.9 0.008 268)")}>
                        <ToolIcon tool={tool} size={16} />
                      </span>
                      <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px")}>
                        <input
                          className="b-input"
                          type="text"
                          value={tool.name}
                          onChange={(event) => setTool(i, { name: event.target.value })}
                          aria-label={"Nome da ferramenta " + (i + 1)}
                          placeholder="Nome"
                          autoComplete="off"
                          style={css(
                            "width: 100%; height: 30px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 4%); color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px",
                          )}
                        />
                        <input
                          className="b-input"
                          type="url"
                          value={tool.url}
                          onChange={(event) => setTool(i, { url: event.target.value })}
                          aria-label={"Link da ferramenta " + (i + 1)}
                          aria-invalid={wrong}
                          placeholder="https://"
                          autoComplete="off"
                          spellCheck={false}
                          style={css(
                            `width: 100%; height: 30px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; border: 1px solid ${
                              wrong ? "oklch(0.75 0.13 55 / 60%)" : "oklch(1 0 0 / 10%)"
                            }; background: oklch(1 0 0 / 4%); color: oklch(0.94 0.006 85); ${MONO}; font-size: 11.5px`,
                          )}
                        />
                      </div>
                      <div style={css("flex: none; display: flex; flex-direction: column; gap: 2px")}>
                        <button className="b-btn b-ghost" aria-label={"Subir " + name} disabled={i === 0} onClick={() => moveTool(i, -1)} style={css(GHOST)}>
                          <Svg size={14} weight={2}>
                            <path d="M12 19V5M6 11l6-6 6 6"></path>
                          </Svg>
                        </button>
                        <button className="b-btn b-ghost" aria-label={"Descer " + name} disabled={i === tools.length - 1} onClick={() => moveTool(i, 1)} style={css(GHOST)}>
                          <Svg size={14} weight={2}>
                            <path d="M12 5v14M6 13l6 6 6-6"></path>
                          </Svg>
                        </button>
                      </div>
                      <button
                        className="b-btn b-risk"
                        aria-label={"Tirar " + name}
                        title={locked ? "No mínimo 4 atalhos" : "Tirar da barra"}
                        disabled={locked}
                        onClick={() => patch({ tools: tools.filter((_, at) => at !== i) })}
                        style={css(GHOST)}
                      >
                        <Svg size={14}>
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path>
                        </Svg>
                      </button>
                    </div>
                  );
                })}
                {tools.some((tool) => bad(tool.url)) && <p style={css("margin: 6px 0 0; font-size: 12px; color: oklch(0.82 0.12 55)")}>Use o link completo, começando com https://</p>}
                <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 12px")}>
                  <button className="b-btn b-solid" disabled={tools.length >= MAX_TOOLS} onClick={() => patch({ tools: [...tools, { id: "t" + Date.now(), name: "", url: "https://" }] })} style={css(SOLID)}>
                    <Svg size={13} weight={2}>
                      <path d="M12 5v14M5 12h14"></path>
                    </Svg>
                    Adicionar ferramenta
                  </button>
                  <span style={css("font-size: 12px; color: oklch(0.7 0.012 268)")}>De 4 a 8. O ícone sai do nome ou do link.</span>
                </div>
              </>
            )}

            {tab === "clock" && (
              <>
                <ClockPreview opts={clock} dim={!show.clock} />
                <div style={css(ROW)}>
                  <Label id="b-side" label="Canto" desc="Onde ele fica, em cima" />
                  <div role="radiogroup" aria-labelledby="b-side" style={css("flex: none; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: oklch(1 0 0 / 6%)")}>
                    {(["left", "right"] as const).map((side) => (
                      <button key={side} className="b-btn b-seg" role="radio" aria-checked={clock.side === side} onClick={setClock({ side })} style={seg(clock.side === side, "height: 24px; padding: 0 10px")}>
                        {side === "left" ? "Esquerdo" : "Direito"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={css(ROW)}>
                  <Label id="b-sw-clock" label="Mostrar o relógio" desc="Fica na tela inicial, sem caixa em volta" />
                  <Switch on={show.clock} toggle={flip("clock")} labelledBy="b-sw-clock" />
                </div>
                <div style={css(ROW)}>
                  <Label id="b-sw-sec" label="Segundos" desc="hh:mm:ss em vez de hh:mm" />
                  <Switch on={clock.seconds} toggle={setClock({ seconds: !clock.seconds })} labelledBy="b-sw-sec" />
                </div>
                <div style={css(ROW)}>
                  <Label id="b-sw-date" label="Data" desc="O dia da semana e a data, antes da hora" />
                  <Switch on={clock.date} toggle={setClock({ date: !clock.date })} labelledBy="b-sw-date" />
                </div>
                <div style={css(ROW)}>
                  <Label id="b-sw-24" label="Formato de 24 horas" desc="Desligado, mostra de 1 a 12 com AM e PM" />
                  <Switch on={clock.h24} toggle={setClock({ h24: !clock.h24 })} labelledBy="b-sw-24" />
                </div>
              </>
            )}

            {tab === "notes" && (
              <>
                <div style={css(ROW)}>
                  <Label id="b-sw-archive" label="Arquivar as que já foram" desc="Notas enviadas ao Claude saem do widget" />
                  <Switch on={home.archive} toggle={() => patch({ archive: !home.archive })} labelledBy="b-sw-archive" />
                </div>
                <div style={css(ROW)}>
                  <Label label="Nova nota" desc="Abre uma nota de qualquer lugar da tela" />
                  <kbd
                    style={css(
                      `flex: none; display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box; border-radius: 6px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(1 0 0 / 5%); ${MONO}; font-size: 11.5px; color: oklch(0.86 0.008 268)`,
                    )}
                  >
                    N
                  </kbd>
                </div>
                <p style={css("margin: 14px 0 0; font-size: 12px; line-height: 1.5; color: oklch(0.68 0.012 268)")}>
                  Cada nota é um arquivo em <span style={css(`${MONO}; font-size: 11.5px`)}>fontes/notas/</span>. Processar abre uma sessão do Claude, que segue o CLAUDE.md e
                  propõe as mudanças; nada vai para o wiki antes de você aprovar. Gravada, a nota vira fonte e não muda mais.
                </p>
              </>
            )}
          </div>
          <div style={css(`flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px 12px 18px; border-top: 1px solid oklch(1 0 0 / 8%); opacity: ${fade}; transition: opacity 0.18s ease`)}>
            <button
              className="b-btn b-ghost"
              onClick={() => reset(tab)}
              style={css("height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.8 0.012 268); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer")}
            >
              Restaurar o padrão
            </button>
            <div style={css("display: flex; align-items: center; gap: 12px")}>
              <span style={css("font-size: 12px; color: oklch(0.7 0.012 268)")}>Muda na hora</span>
              <button
                className="b-btn b-main"
                onClick={close}
                style={css("height: 30px; padding: 0 14px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer")}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
