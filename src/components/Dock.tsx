// A barra de ferramentas, embaixo no meio: atalhos para os sistemas da empresa.
// O ícone é o desenho do tipo de ferramenta, tirado do nome ou do link. O design
// pedia o ícone do próprio site, mas Gmail, Agenda e Drive saem todos com o
// mesmo "G" do Google: o desenho distingue melhor.
import { css } from "../css";
import { TOOL_D, host, okUrl, toolIcon, type Tool } from "../home";
import { Svg } from "./Icons";

export function ToolIcon({ tool, size }: { tool: Tool; size: number }) {
  return (
    <Svg size={size}>
      <path d={TOOL_D[toolIcon(tool.name, tool.url)]}></path>
    </Svg>
  );
}

type Props = { tools: Tool[]; names: boolean; edit: () => void; manager: () => void; note: () => void };

export function Dock({ tools, names, edit, manager, note }: Props) {
  return (
    <nav
      aria-label="Ferramentas"
      style={css(
        "position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; max-width: calc(100% - 32px); box-sizing: border-box; padding: 5px; border-radius: 16px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(0.19 0.008 268 / 80%); backdrop-filter: blur(18px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 10px 30px oklch(0 0 0 / 30%); pointer-events: auto",
      )}
    >
      {tools
        .filter((tool) => okUrl(tool.url))
        .map((tool) => {
          const name = tool.name.trim() || host(tool.url);
          return (
            <a
              key={tool.id}
              className="b-btn b-tool"
              href={tool.url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={"Abrir " + name}
              style={css(
                `position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: ${names ? "64px" : "44px"}; height: ${
                  names ? "54px" : "44px"
                }; padding: 0 ${names ? "6px" : "0"}; box-sizing: border-box; border-radius: 11px; background: oklch(1 0 0 / 5%); color: oklch(0.9 0.008 268); text-decoration: none`,
              )}
            >
              <ToolIcon tool={tool} size={18} />
              {names && (
                <span style={css("max-width: 76px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 10.5px; font-weight: 500; color: oklch(0.8 0.01 268)")}>{name}</span>
              )}
              {!names && (
                <span
                  className="b-tip"
                  aria-hidden="true"
                  style={css(
                    "position: absolute; left: 50%; bottom: calc(100% + 9px); padding: 5px 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 11%); background: oklch(0.2 0.008 268 / 96%); box-shadow: 0 10px 26px oklch(0 0 0 / 45%); white-space: nowrap; font-size: 12px; font-weight: 500; color: oklch(0.94 0.006 85); pointer-events: none",
                  )}
                >
                  {name}
                </span>
              )}
            </a>
          );
        })}
      <span aria-hidden="true" style={css("width: 1px; height: 24px; margin: 0 3px; background: oklch(1 0 0 / 10%)")}></span>
      {/* No celular, os widgets somem: a barra leva até eles. */}
      <button
        className="b-btn b-ghost b-phone"
        aria-label="Skills e rotinas"
        onClick={manager}
        style={css("place-items: center; width: 40px; height: 40px; border: 0; border-radius: 11px; background: transparent; color: oklch(0.86 0.008 268); cursor: pointer")}
      >
        <Svg size={16}>
          <path d="M8 3.5 12.5 8 8 12.5 3.5 8z"></path>
          <path d="M16 11a5 5 0 1 0 0 10a5 5 0 1 0 0-10"></path>
        </Svg>
      </button>
      <button
        className="b-btn b-ghost b-phone"
        aria-label="Nova nota"
        onClick={note}
        style={css("place-items: center; width: 40px; height: 40px; border: 0; border-radius: 11px; background: transparent; color: oklch(0.86 0.008 268); cursor: pointer")}
      >
        <Svg size={16}>
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4z"></path>
        </Svg>
      </button>
      <button
        className="b-btn b-ghost"
        aria-label="Editar ferramentas"
        title="Editar ferramentas"
        onClick={edit}
        style={css("display: grid; place-items: center; width: 34px; height: 44px; border: 0; border-radius: 11px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
      >
        <Svg>
          <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"></path>
        </Svg>
      </button>
    </nav>
  );
}
