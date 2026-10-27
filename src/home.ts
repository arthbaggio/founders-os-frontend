// A tela inicial da v3: o que aparece em volta do mapa, o padrão de cada coisa
// (o Personalizar volta para ele) e as contas pequenas que os widgets usam.
import type { BrainNode } from "../server/scan";

// --- O que aparece e como (Personalizar) ---
export type Show = { skills: boolean; tools: boolean; notes: boolean; clock: boolean; views: boolean; title: boolean; search: boolean; legendBar: boolean };
export const SHOW: Show = { skills: true, tools: true, notes: true, clock: true, views: true, title: true, search: true, legendBar: true };

export type ClockOpts = { side: "left" | "right"; seconds: boolean; date: boolean; h24: boolean };
export const CLOCK: ClockOpts = { side: "right", seconds: true, date: false, h24: true };

export type Tool = { id: string; name: string; url: string };
// Os sistemas que a empresa usa, de wiki/compartilhado/sistemas-e-ferramentas.md.
export const TOOLS: Tool[] = [
  { id: "t-clickup", name: "ClickUp", url: "https://app.clickup.com" },
  { id: "t-pipedrive", name: "Pipedrive", url: "https://app.pipedrive.com" },
  { id: "t-gmail", name: "Gmail", url: "https://mail.google.com" },
  { id: "t-agenda", name: "Google Agenda", url: "https://calendar.google.com" },
  { id: "t-drive", name: "Google Drive", url: "https://drive.google.com" },
  { id: "t-notion", name: "Notion", url: "https://www.notion.so" },
];
export const MIN_TOOLS = 4;
export const MAX_TOOLS = 8;
export const MAX_FAVS = 6;
export const NEXT = 2;

// O modelo e o esforço das sessões do Claude. Vazio é o padrão do Claude Code (o settings.json dele).
export const MODELS: [string, string][] = [
  ["", "Padrão"],
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
];
export const EFFORTS: [string, string][] = [
  ["", "Padrão"],
  ["low", "Baixo"],
  ["medium", "Médio"],
  ["high", "Alto"],
  ["xhigh", "Extra"],
  ["max", "Máximo"],
];

// --- Ferramentas ---
// Os ícones da barra, por tipo de ferramenta.
export const TOOL_D: Record<string, string> = {
  crm: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  tasks: "M9 11.5l2.5 2.5L20 5.5M20 12.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9.5",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 7.5l8.5 6 8.5-6",
  calendar: "M8 3v3.5M16 3v3.5M5 5.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2zM3 10.5h18",
  chat: "M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.1-4.2A8.5 8.5 0 1 1 20.5 12z",
  doc: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8",
  drive: "M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01",
  money: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M7 15h4",
  code: "m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  design: "M4 20l4.5-1L19 8.5 15.5 5 5 15.5zM13.5 7l3.5 3.5",
  video: "M4 6.5h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM16 10.5l5-3v9l-5-3",
  chart: "M3.5 20.5h17M6.5 17v-5M11 17V7M15.5 17V9M20 17v-3",
  link: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
};

export function toolIcon(name: string, url: string) {
  const text = (name + " " + url).toLowerCase();
  const rules: [RegExp, string][] = [
    [/crm|hubspot|pipedrive|salesforce|rd ?station|kommo|attio/, "crm"],
    [/clickup|asana|trello|jira|linear|monday|todoist|tarefa/, "tasks"],
    [/agenda|calendar|calend[áa]rio|cal\.com/, "calendar"],
    [/gmail|outlook|e-?mail|mail\./, "mail"],
    [/slack|whatsapp|discord|teams|chat/, "chat"],
    [/notion|docs|wiki|confluence|coda|obsidian/, "doc"],
    [/drive|dropbox|onedrive|arquivos/, "drive"],
    [/stripe|asaas|pagar|banco|financeiro|conta ?azul|omie|cakto/, "money"],
    [/github|gitlab|bitbucket|vercel|supabase|c[óo]digo/, "code"],
    [/figma|canva|framer|design/, "design"],
    [/meet|zoom|whereby|v[íi]deo/, "video"],
    [/analytics|metabase|looker|dashboard|m[ée]trica/, "chart"],
  ];
  for (const [pattern, key] of rules) if (pattern.test(text)) return key;
  return "link";
}

export function host(url: string) {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const okUrl = (url: string) => /^https?:\/\/[^\s/]+\.[^\s]+/.test(url.trim());

// --- Tempo, em português e sem enrolação ---
export const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const pad = (n: number) => String(n).padStart(2, "0");
export const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
export const words = (text: string) => (text.trim().match(/\S+/g) || []).length;

// Um momento, em relação a agora: hoje, 09:00 · amanhã, 08:00 · sex, 16:00 · 1º nov, 08:00.
export function when(t: number, now: number) {
  const a = new Date(t);
  const b = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(a) - day(b)) / 86400000);
  const hm = pad(a.getHours()) + ":" + pad(a.getMinutes());
  if (diff === 0) return "hoje, " + hm;
  if (diff === 1) return "amanhã, " + hm;
  if (diff === -1) return "ontem, " + hm;
  if (Math.abs(diff) < 7) return WEEK[a.getDay()] + ", " + hm;
  return (a.getDate() === 1 ? "1º" : a.getDate()) + " " + MONTHS[a.getMonth()] + ", " + hm;
}

export function ago(t: number, now: number) {
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return "há " + minutes + " min";
  if (new Date(t).toDateString() === new Date(now).toDateString()) return "há " + Math.floor(minutes / 60) + " h";
  return when(t, now);
}

// Quanto tempo uma sessão está rodando: 2:14.
export function span(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ":" + pad(total % 60);
}

export function until(t: number, now: number) {
  const minutes = Math.max(1, Math.round((t - now) / 60000));
  if (minutes < 60) return "em " + minutes + " min";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return "em " + hours + " h";
  const days = Math.round(hours / 24);
  return "em " + days + (days === 1 ? " dia" : " dias");
}

let longFmt: Intl.DateTimeFormat | null = null;
export function longDate(d: Date) {
  try {
    longFmt ??= new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return longFmt.format(d);
  } catch {
    return d.toDateString();
  }
}

// --- Skills e rotinas ---
type Rule = { hour: number; day?: number; date?: number };

// A agenda de uma rotina, lida do `schedule:` dela: "Segundas, 8h", "Todo dia, 9h",
// "Dia 1º, 8h". Sem uma hora no texto, não se inventa a próxima vez.
export function rule(schedule: string): Rule | null {
  const text = schedule.toLowerCase();
  const at = text.match(/(\d{1,2})\s*h/);
  if (!at) return null;
  const hour = Number(at[1]);
  if (text.includes("todo dia")) return { hour };
  const date = text.match(/dia\s+(\d{1,2})/);
  if (date) return { hour, date: Number(date[1]) };
  const days: [string, number][] = [["domingo", 0], ["segunda", 1], ["terça", 2], ["terca", 2], ["quarta", 3], ["quinta", 4], ["sexta", 5], ["sábado", 6], ["sabado", 6]];
  for (const [name, day] of days) if (text.includes(name)) return { hour, day };
  return { hour };
}

export function nextRun(rule: Rule | null, now: number) {
  if (!rule) return 0;
  const base = new Date(now);
  for (let i = 0; i < 64; i++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, rule.hour, 0, 0, 0);
    if (at.getTime() <= now) continue;
    if (rule.day !== undefined && at.getDay() !== rule.day) continue;
    if (rule.date !== undefined && at.getDate() !== rule.date) continue;
    return at.getTime();
  }
  return 0;
}

// A última vez que a agenda marcou, até agora (0 se não houver). O servidor usa para disparar a rotina.
export function lastRun(rule: Rule | null, now: number) {
  if (!rule) return 0;
  const base = new Date(now);
  for (let i = 0; i < 64; i++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, rule.hour, 0, 0, 0);
    if (at.getTime() > now) continue;
    if (rule.day !== undefined && at.getDay() !== rule.day) continue;
    if (rule.date !== undefined && at.getDate() !== rule.date) continue;
    return at.getTime();
  }
  return 0;
}

export type Runnable = { path: string; label: string; kind: "skill" | "routine"; area: string; areaLabel: string; schedule: string; rule: Rule | null };
export type Catalog = { skills: Runnable[]; routines: Runnable[]; byPath: Record<string, Runnable> };

// Todas as skills e rotinas do cérebro, com o departamento de cada uma.
const catalogs = new WeakMap<BrainNode[], Catalog>();
export function catalog(tree: BrainNode[]): Catalog {
  const known = catalogs.get(tree);
  if (known) return known;
  const out: Catalog = { skills: [], routines: [], byPath: {} };
  for (const area of tree) {
    const walk = (node: BrainNode) => {
      const add = (kind: "skill" | "routine") => (source: BrainNode) => {
        const schedule = source.schedule || "";
        const item: Runnable = { path: source.path, label: source.label, kind, area: area.path, areaLabel: area.label, schedule, rule: kind === "routine" ? rule(schedule) : null };
        (kind === "skill" ? out.skills : out.routines).push(item);
        out.byPath[item.path] = item;
      };
      (node.skills || []).forEach(add("skill"));
      (node.routines || []).forEach(add("routine"));
      (node.children || []).forEach(walk);
    };
    walk(area);
  }
  catalogs.set(tree, out);
  return out;
}
