// A leitura: a gaveta da direita com o texto da página, como no design. O
// texto vem do arquivo de verdade, renderizado do Markdown.
import { useEffect, useState, type MouseEvent } from "react";
import { marked } from "marked";
import type { Brief } from "../brain/engine";
import { css } from "../css";
import { Close, Copy, External } from "./Icons";

export type Page = Brief;

type Props = {
  page: Page;
  crumb: string;
  kind: string;
  color: string;
  path: string;
  device: () => void;
  copy: () => void;
  close: () => void;
  follow: (path: string) => void;
};

// Junta um link relativo ao caminho da página (os dois relativos ao wiki).
function resolve(from: string, href: string) {
  const parts = from.split("/").slice(0, -1);
  for (const part of href.split("/")) {
    if (!part || part === ".") continue;
    if (part === ".." && parts.length && parts[parts.length - 1] !== "..") parts.pop();
    else parts.push(part);
  }
  let path = parts.join("/");
  // O índice de uma pasta é a própria pasta no mapa.
  if (path === "index.md") return "";
  if (path.endsWith("/index.md")) path = path.slice(0, -"/index.md".length);
  return path;
}

export function Reader({ page, crumb, kind, color, path, device, copy, close, follow }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/page?path=" + encodeURIComponent(page.path))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ markdown }: { markdown: string }) => {
        if (!live) return;
        // O título já está em cima: o primeiro H1 do arquivo não se repete.
        const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/^\s*#\s+.*\n?/, "");
        setHtml(marked.parse(body, { async: false, gfm: true }) as string);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [page.path]);

  const click = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || href.startsWith("#")) return;
    event.preventDefault();
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      window.open(href, "_blank", "noopener");
      return;
    }
    const target = resolve(page.path, decodeURI(href.split("#")[0]).replace(/\/$/, ""));
    if (target) follow(target);
  };

  return (
    <aside
      aria-label="Leitura"
      style={css(
        "position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; background: oklch(0.165 0.008 268 / 96%); backdrop-filter: blur(24px); border-left: 1px solid oklch(1 0 0 / 9%); box-shadow: -30px 0 70px oklch(0 0 0 / 40%); animation: b-slide 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
      )}
    >
      <div style={css("flex: none; display: flex; align-items: center; gap: 6px; height: 54px; padding: 0 12px 0 22px; border-bottom: 1px solid oklch(1 0 0 / 8%)")}>
        <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; color: oklch(0.74 0.012 268)")}>{crumb}</span>
        <button
          className="b-btn b-solid"
          onClick={device}
          style={css(
            "flex: none; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer",
          )}
        >
          <External />
          Abrir no dispositivo
        </button>
        <button
          className="b-btn b-solid"
          aria-label="Copiar caminho"
          title="Copiar caminho"
          onClick={copy}
          style={css(
            "flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); cursor: pointer",
          )}
        >
          <Copy />
        </button>
        <button
          className="b-btn b-ghost"
          aria-label="Fechar"
          onClick={close}
          style={css("flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
        >
          <Close />
        </button>
      </div>
      <div className="b-scroll" style={css("flex: 1; overflow-y: auto; padding: 30px 32px 40px")}>
        <span
          style={css(
            "display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 9px 0 8px; border-radius: 99px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 5%); font-size: 12px; color: oklch(0.86 0.008 268)",
          )}
        >
          <span style={css(`width: 7px; height: 7px; border-radius: 99px; background: ${color}`)}></span>
          {kind}
        </span>
        <h2 style={css("margin: 14px 0 0; font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; text-wrap: balance")}>{page.label}</h2>
        <div style={css("margin-top: 8px; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; color: oklch(0.74 0.012 268); overflow-wrap: anywhere")}>{path}</div>
        <div style={css("margin: 28px 0 0; padding-top: 22px; border-top: 1px solid oklch(1 0 0 / 8%)")}>
          {html === null ? (
            <p style={css("margin: 0; font-size: 14px; line-height: 1.6; color: oklch(0.74 0.012 268)")}>{failed ? "Não deu para ler esta página." : "Abrindo…"}</p>
          ) : html.trim() ? (
            <div className="b-prose" onClick={click} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p style={css("margin: 0; font-size: 14px; line-height: 1.6; color: oklch(0.74 0.012 268)")}>Página ainda em branco.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
