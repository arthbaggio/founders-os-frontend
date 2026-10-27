import type { CSSProperties } from "react";

// Os estilos do design são texto CSS inline; aqui viram o objeto que o React
// espera, sem reescrever nada à mão.
const cache = new Map<string, CSSProperties>();

export function css(text: string): CSSProperties {
  let style = cache.get(text);
  if (style) return style;
  const out: Record<string, string> = {};
  for (const part of text.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (!key || !value) continue;
    out[key.startsWith("--") ? key : key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  style = out as CSSProperties;
  cache.set(text, style);
  return style;
}
