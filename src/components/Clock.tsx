// O relógio da tela inicial: discreto, num canto de cima, sem caixa em volta.
// Ele anda sozinho, para o resto da tela não se redesenhar a cada segundo.
import { useEffect, useState } from "react";
import { css } from "../css";
import { MONTHS, WEEK, longDate, pad, type ClockOpts } from "../home";

const MONO = "font-family: 'Geist Mono', ui-monospace, monospace";

function useSecond() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let second = Math.floor(Date.now() / 1000);
    const timer = setInterval(() => {
      const next = Math.floor(Date.now() / 1000);
      if (next === second) return;
      second = next;
      setNow(Date.now());
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function parts(now: number, c: ClockOpts) {
  const d = new Date(now);
  const hour = d.getHours();
  const hm = (c.h24 ? pad(hour) : String(hour % 12 || 12)) + ":" + pad(d.getMinutes());
  return { d, hm, ss: pad(d.getSeconds()), ampm: hour < 12 ? "AM" : "PM", date: WEEK[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] };
}

export function Clock({ opts, onClick, edge = false }: { opts: ClockOpts; onClick: () => void; edge?: boolean }) {
  const p = parts(useSecond(), opts);
  return (
    <button
      className="b-btn b-ghost"
      title={longDate(p.d)}
      aria-label={"Agora são " + p.hm + ". Ajustes do relógio"}
      onClick={onClick}
      style={css(
        `flex: none; display: flex; align-items: center; gap: 8px; height: 38px; ${edge ? "margin-left: 2px; " : ""}padding: 0 9px; border: 0; border-radius: 10px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; cursor: pointer; pointer-events: auto`,
      )}
    >
      {opts.date && <span style={css("font-size: 12px; color: oklch(0.74 0.012 268)")}>{p.date}</span>}
      <time dateTime={p.d.toISOString()} style={css(`${MONO}; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: 0.02em`)}>
        {p.hm}
        {opts.seconds && <span style={css("color: oklch(0.7 0.012 268)")}>:{p.ss}</span>}
        {!opts.h24 && <span style={css("margin-left: 4px; font-size: 10.5px; color: oklch(0.7 0.012 268)")}>{p.ampm}</span>}
      </time>
    </button>
  );
}

// A prévia grande, na seção Relógio do Personalizar.
export function ClockPreview({ opts, dim }: { opts: ClockOpts; dim: boolean }) {
  const p = parts(useSecond(), opts);
  return (
    <div style={css("display: grid; place-items: center; height: 116px; margin: 4px 0 10px; border-radius: 12px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 3%)")}>
      <div style={css(`display: flex; align-items: baseline; gap: 12px; opacity: ${dim ? 0.4 : 1}; transition: opacity 0.15s ease`)}>
        {opts.date && <span style={css("font-size: 15px; color: oklch(0.74 0.012 268)")}>{p.date}</span>}
        <span style={css(`${MONO}; font-size: 40px; font-variant-numeric: tabular-nums; letter-spacing: 0.01em`)}>
          {p.hm}
          {opts.seconds && <span style={css("color: oklch(0.68 0.012 268)")}>:{p.ss}</span>}
          {!opts.h24 && <span style={css("margin-left: 6px; font-size: 15px; color: oklch(0.7 0.012 268)")}>{p.ampm}</span>}
        </span>
      </div>
    </div>
  );
}
