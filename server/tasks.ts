// O quadro de tarefas do Mission Control.
//
// As tarefas moram no próprio cérebro, em memory/to-dos.md, no formato da skill /todo:
// "## Abertos" e "## Concluídos", cada uma como "- [ ] Título" com os detalhes em
// sub-itens ("  - ID: ...", "  - Área: ...", "  - Prazo: ..."). O quadro acrescenta dois
// detalhes legíveis: "Status" (a-fazer, com-agente, revisao) e "Agente". Assim o /todo,
// o quadro e os agentes enxergam a mesma lista.
//
// O que é técnico (a entrega no OpenBot, a resposta do agente) fica fora do cérebro,
// em sessoes/agentes/tarefas.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type Status = "a-fazer" | "com-agente" | "revisao" | "feito";
export type Task = { id: string; title: string; done: boolean; meta: Record<string, string>; extra: string[] };
export type Run = { agentKey: string; agentName: string; agentId: string; deliveryId: string | null; at: string; status: string; answer: string; error: string | null };

const KNOWN = ["ID", "Área", "Projeto", "Prazo", "Foco", "Criado", "Status", "Agente", "Concluído"];

function parse(text: string): Task[] {
  const tasks: Task[] = [];
  let section: "abertos" | "concluidos" | null = null;
  let current: Task | null = null;
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^##\s+(.*)$/);
    if (head) {
      const name = head[1].toLowerCase();
      section = name.startsWith("conclu") ? "concluidos" : name.startsWith("abert") ? "abertos" : section;
      current = null;
      continue;
    }
    const item = line.match(/^- \[( |x|X)\]\s+(.*)$/);
    if (item) {
      current = { id: "", title: item[2].trim(), done: item[1] !== " " || section === "concluidos", meta: {}, extra: [] };
      tasks.push(current);
      continue;
    }
    const sub = line.match(/^\s{2,3}-\s+([^:]+):\s*(.*)$/);
    if (sub && current) {
      current.meta[sub[1].trim()] = sub[2].trim();
      continue;
    }
    if (/^\s{2,}\S/.test(line) && current) current.extra.push(line);
  }
  for (const task of tasks) task.id = task.meta.ID || "";
  return tasks;
}

function serialize(tasks: Task[]): string {
  const item = (task: Task) => {
    const lines = [`- [${task.done ? "x" : " "}] ${task.title}`];
    for (const key of [...KNOWN, ...Object.keys(task.meta).filter((one) => !KNOWN.includes(one))]) if (task.meta[key]) lines.push(`  - ${key}: ${task.meta[key]}`);
    return [...lines, ...task.extra].join("\n");
  };
  const open = tasks.filter((one) => !one.done);
  const done = tasks.filter((one) => one.done);
  return ["# To-dos", "", "## Abertos", "", ...(open.length ? [open.map(item).join("\n")] : []), "", "## Concluídos", "", ...(done.length ? [done.map(item).join("\n")] : []), ""].join("\n");
}

// As notas livres de uma tarefa: as linhas recuadas abaixo dos detalhes.
const notesOf = (task: Task) =>
  task.extra
    .map((line) => line.replace(/^\s{2,}/, ""))
    .join("\n")
    .trim();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function taskStore(brain: string, results: string) {
  const file = join(brain, "memory", "to-dos.md");
  const runsFile = join(results, "agentes", "tarefas.json");

  const read = (): Task[] => (existsSync(file) ? parse(readFileSync(file, "utf8")) : []);
  const write = (tasks: Task[]) => {
    mkdirSync(join(brain, "memory"), { recursive: true });
    writeFileSync(file, serialize(tasks));
  };
  const readRuns = (): Record<string, Run> => {
    try {
      const saved = JSON.parse(readFileSync(runsFile, "utf8"));
      return saved.brain === brain && saved.runs ? saved.runs : {};
    } catch {
      return {};
    }
  };
  const writeRuns = (runs: Record<string, Run>) => {
    mkdirSync(join(results, "agentes"), { recursive: true });
    writeFileSync(runsFile, JSON.stringify({ brain, runs }, null, 2));
  };
  // Uma tarefa sem ID (escrita à mão) ganha um, no padrão do /todo.
  const withIds = (tasks: Task[]) => {
    let changed = false;
    const used = new Set(tasks.map((one) => one.id).filter(Boolean));
    for (const task of tasks) {
      if (task.id) continue;
      const day = today().replace(/-/g, "");
      let n = 1;
      while (used.has(`todo-${day}-${String(n).padStart(3, "0")}`)) n++;
      task.id = task.meta.ID = `todo-${day}-${String(n).padStart(3, "0")}`;
      used.add(task.id);
      changed = true;
    }
    if (changed) write(tasks);
    return tasks;
  };
  const statusOf = (task: Task): Status => {
    if (task.done) return "feito";
    const status = (task.meta.Status || "").toLowerCase();
    return status === "com-agente" || status === "revisao" ? status : "a-fazer";
  };
  const update = (id: string, change: (task: Task) => void) => {
    const tasks = read();
    const task = tasks.find((one) => one.id === id);
    if (!task) return null;
    change(task);
    write(tasks);
    return task;
  };

  return {
    list() {
      const runs = readRuns();
      return withIds(read()).map((task) => ({
        id: task.id,
        title: task.title,
        area: task.meta["Área"] ?? "",
        project: task.meta.Projeto ?? "",
        due: task.meta.Prazo ?? "",
        created: task.meta.Criado ?? "",
        doneAt: task.meta["Concluído"] ?? "",
        agent: task.meta.Agente ?? "",
        notes: notesOf(task),
        focus: task.meta.Foco === today() && !task.done,
        status: statusOf(task),
        run: runs[task.id] ?? null,
      }));
    },
    create(title: string, area: string, due: string) {
      const tasks = withIds(read());
      const day = today().replace(/-/g, "");
      let n = 1;
      const used = new Set(tasks.map((one) => one.id));
      while (used.has(`todo-${day}-${String(n).padStart(3, "0")}`)) n++;
      const id = `todo-${day}-${String(n).padStart(3, "0")}`;
      tasks.push({ id, title, done: false, meta: { ID: id, ...(area ? { "Área": area } : {}), ...(due ? { Prazo: due } : {}), Criado: today(), Status: "a-fazer" }, extra: [] });
      write(tasks);
      return id;
    },
    move(id: string, status: Status) {
      return update(id, (task) => {
        task.done = status === "feito";
        if (task.done) task.meta["Concluído"] = today();
        else delete task.meta["Concluído"];
        task.meta.Status = status === "feito" ? "" : status;
        if (status === "a-fazer") delete task.meta.Agente;
      });
    },
    remove(id: string) {
      const tasks = read();
      const next = tasks.filter((one) => one.id !== id);
      if (next.length === tasks.length) return false;
      write(next);
      const runs = readRuns();
      delete runs[id];
      writeRuns(runs);
      return true;
    },
    // A tarefa foi para um agente: o cérebro guarda quem; o app guarda a entrega.
    assigned(id: string, run: Run) {
      update(id, (task) => {
        task.done = false;
        task.meta.Status = "com-agente";
        task.meta.Agente = run.agentName;
        delete task.meta["Concluído"];
      });
      const runs = readRuns();
      runs[id] = run;
      writeRuns(runs);
    },
    // Detalhes editados no cartão: título, área, prazo, projeto e as notas livres.
    edit(id: string, patch: { title?: string; area?: string; due?: string; project?: string; notes?: string; focus?: boolean }) {
      return update(id, (task) => {
        // "Foco" marca a tarefa como uma das três do dia; vale só para a data marcada.
        if (patch.focus === true) task.meta.Foco = today();
        if (patch.focus === false) delete task.meta.Foco;
        if (typeof patch.title === "string" && patch.title.trim()) task.title = patch.title.trim().slice(0, 300);
        const set = (key: string, value?: string) => {
          if (typeof value !== "string") return;
          if (value.trim()) task.meta[key] = value.trim().replace(/\s*\n\s*/g, " ");
          else delete task.meta[key];
        };
        set("Área", patch.area);
        set("Prazo", patch.due);
        set("Projeto", patch.project);
        if (typeof patch.notes === "string")
          task.extra = patch.notes
            .replace(/\r/g, "")
            .split("\n")
            .map((line) => line.trimEnd())
            .filter(Boolean)
            .map((line) => "    " + line);
      });
    },
    runs: readRuns,
    // A entrega terminou: a resposta fica guardada e a tarefa vai para a revisão.
    finished(id: string, patch: Partial<Run>) {
      const runs = readRuns();
      if (!runs[id]) return;
      runs[id] = { ...runs[id], ...patch };
      writeRuns(runs);
      if (patch.status === "completed") update(id, (task) => (task.meta.Status = "revisao"));
    },
    get: (id: string) => read().find((one) => one.id === id) ?? null,
  };
}

// As prioridades do cérebro: a lista numerada de memory/prioridades.md.
export function readPriorities(brain: string) {
  const file = join(brain, "memory", "prioridades.md");
  if (!existsSync(file)) return { updated: "", items: [] as { title: string; detail: string }[] };
  const text = readFileSync(file, "utf8");
  const updated = text.match(/Atualizado em ([0-9-]+)/)?.[1] ?? "";
  const items = [...text.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => {
    const line = match[1].trim();
    const cut = line.search(/[:.]\s/);
    return cut > 0 && cut < 90 ? { title: line.slice(0, cut), detail: line.slice(cut + 1).trim() } : { title: line, detail: "" };
  });
  return { updated, items };
}

// O que está "Pendente" nas páginas do wiki: uma linha por item, com a página e a área.
export function readPending(brain: string, limit = 80) {
  const wiki = join(brain, "wiki");
  const out: { page: string; area: string; text: string }[] = [];
  const walk = (dir: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(dir, { withFileTypes: true }).map((one) => (one.isDirectory() ? one.name + sep : one.name));
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= limit) return;
      const path = join(dir, name);
      if (name.endsWith(sep)) walk(path);
      else if (name.endsWith(".md")) {
        const page = relative(wiki, path).split(sep).join("/");
        for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
          const match = line.match(/Pendente:?\s*(.+)/);
          if (!match || /^#/.test(line)) continue;
          const text = match[1].replace(/[|*`]/g, "").trim();
          if (text.length < 4) continue;
          out.push({ page, area: page.split("/")[0], text });
          if (out.length >= limit) return;
        }
      }
    }
  };
  walk(wiki);
  return out;
}
