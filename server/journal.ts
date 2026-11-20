// O "Meu dia" do Mission Control: o diário de hoje e os aprendizados recentes.
//
// O diário mora em memory/diario/AAAA-MM-DD.md, um arquivo por dia (o mesmo que a skill
// /fim-de-dia preenche). O app só cuida da seção "## Anotações do dia": lê e reescreve
// esse trecho e deixa o resto do arquivo como está.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEAD = "## Anotações do dia";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function section(text: string) {
  const start = text.indexOf(HEAD);
  if (start < 0) return { before: text, body: "", after: "" };
  const from = start + HEAD.length;
  const next = text.slice(from).search(/\n## /);
  const end = next < 0 ? text.length : from + next;
  return { before: text.slice(0, start), body: text.slice(from, end).trim(), after: text.slice(end) };
}

export function readJournal(brain: string) {
  const date = today();
  const file = join(brain, "memory", "diario", date + ".md");
  if (!existsSync(file)) return { date, notes: "", exists: false };
  return { date, notes: section(readFileSync(file, "utf8")).body, exists: true };
}

export function writeJournal(brain: string, notes: string) {
  const date = today();
  const dir = join(brain, "memory", "diario");
  const file = join(dir, date + ".md");
  mkdirSync(dir, { recursive: true });
  const clean = notes.replace(/\r/g, "").trim();
  const text = existsSync(file) ? readFileSync(file, "utf8") : `# ${date}\n`;
  const { before, after } = section(text);
  const block = clean ? `${HEAD}\n\n${clean}\n` : "";
  const head = text.includes(HEAD) ? before : before.replace(/\s*$/, "\n\n");
  writeFileSync(file, (head + block + (after.startsWith("\n") ? after : after ? "\n" + after : "")).replace(/\n{3,}/g, "\n\n"));
  return readJournal(brain);
}

// Os aprendizados mais recentes de memory/aprendizados.md (linhas "- AAAA-MM-DD · [tipo] ...").
export function readLearnings(brain: string, limit = 6) {
  const file = join(brain, "memory", "aprendizados.md");
  if (!existsSync(file)) return [];
  let topic = "";
  const out: { date: string; kind: string; text: string; topic: string }[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const head = line.match(/^##\s+(.*)$/);
    if (head) topic = head[1].trim();
    const item = line.match(/^- (\d{4}-\d{2}(?:-\d{2})?)\s*·\s*(?:\[([^\]]+)\]\s*)?(.+)$/);
    if (item) out.push({ date: item[1], kind: item[2] ?? "", text: item[3].trim(), topic });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
