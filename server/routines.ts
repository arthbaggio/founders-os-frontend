// As rotinas: skills com `schedule:` que o servidor abre sozinho na hora marcada.
// Só dispara enquanto o servidor está de pé. Perdeu a hora (app fechado, Mac
// dormindo), a vez se perde: espera a próxima, sem correr atrás do atraso.
import { readdirSync } from "node:fs";
import { lastRun, rule } from "../src/home";
import { scan } from "./scan";
import type { Run } from "./runs";

const TICK = 30 * 1000;
// Quanto depois da hora ainda vale disparar: o suficiente para o relógio de 30 s.
const GRACE = 2 * 60 * 1000;

export type Due = { path: string; slug: string; label: string; area: string; areaLabel: string };

// Uma sessão desta skill já guardou resultado depois da hora? Os arquivos de
// sessoes/ se chamam AAAA-MM-DD-HHMMSS-<slug>.md, na hora local. Cobre o servidor
// que reiniciou logo depois de uma rotina rodar.
function saved(results: string, slug: string, since: number) {
  let names: string[] = [];
  try {
    names = readdirSync(results);
  } catch {
    return false;
  }
  return names.some((name) => {
    const at = name.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-(.+)\.md$/);
    if (!at || at[7] !== slug) return false;
    return new Date(+at[1], +at[2] - 1, +at[3], +at[4], +at[5], +at[6]).getTime() >= since;
  });
}

export function routineClock(brain: string, results: string, runs: { list(): Run[] }, fire: (item: Due) => void) {
  // A hora de cada rotina que já foi tratada, para não abrir duas vezes a mesma vez.
  const handled = new Map<string, number>();

  const tick = (now = Date.now()) => {
    for (const area of scan(brain).areas) {
      for (const item of area.routines ?? []) {
        if (item.paused) continue;
        const at = lastRun(rule(item.schedule ?? ""), now);
        if (!at || now - at > GRACE || handled.get(item.path) === at) continue;
        handled.set(item.path, at);
        const slug = item.path.match(/^\.\.\/\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
        // Já rodou depois da hora, à mão ou antes de o servidor reiniciar: não repete.
        if (!slug || runs.list().some((run) => run.path === item.path && run.startedAt >= at) || saved(results, slug, at)) continue;
        fire({ path: item.path, slug, label: item.label, area: area.path, areaLabel: area.label });
      }
    }
  };

  return {
    tick,
    // Liga o relógio; devolve o que o desliga.
    start() {
      const timer = setInterval(() => tick(), TICK);
      return () => clearInterval(timer);
    },
  };
}
