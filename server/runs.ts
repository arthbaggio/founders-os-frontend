// As sessões do Claude que o app roda. Cada uma é um `claude -p` na pasta do
// cérebro: o app acompanha o que ela vai fazendo pelo stream-json e, no fim,
// guarda a resposta em sessoes/, na pasta do app, fora do cérebro.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

export type Run = {
  id: string;
  // Skill ou rotina: o caminho no mapa (../.claude/skills/<slug>/SKILL.md). Nota: fontes/notas/<id>.md.
  path: string;
  label: string;
  kind: "skill" | "routine" | "nota";
  area: string;
  areaLabel: string;
  text: string;
  // Só nas notas: qual nota e em que etapa da revisão.
  note: string | null;
  phase: "proposta" | "gravacao" | null;
  startedAt: number;
  endedAt: number | null;
  status: "rodando" | "pronta" | "falhou" | "parada";
  // O que a sessão está fazendo agora ou, no fim, como terminou.
  step: string;
  result: string;
  // O resultado salvo, com o caminho completo.
  file: string | null;
  session: string | null;
};

export type Spec = Pick<Run, "path" | "label" | "kind" | "area" | "areaLabel" | "text" | "note" | "phase"> & {
  prompt: string;
  access: string[];
  model: string;
  effort: string;
  // A sessão que esta continua (o ajuste e a gravação de uma nota).
  resume: string | null;
  // O nome do arquivo do resultado e o que vai no topo dele.
  slug: string;
  meta: string[];
  // Chamado quando a sessão termina bem.
  done?: () => void;
};

// O que cada sessão pode fazer. Ninguém responde pedido de permissão aqui: o
// que pediria permissão é negado na hora. Só o rodar é aberto (todas as
// ferramentas, web e MCP); propor e gravar seguem fechados.
const BASE = ["--permission-prompts", "none"];
const FECHADO = ["--strict-mcp-config"];
// Os conectores (Notion, ClickUp, etc.) moram na config do app Claude Desktop, que
// o `claude -p` não lê sozinho. O rodar aponta para ela, então o que você liga lá vale aqui.
export const CONECTORES = join(homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
export const ACCESS = {
  // Skills e rotinas fazem trabalho de verdade: editam o cérebro, menos o wiki/,
  // que só muda com o aceite do Arthur (CLAUDE.md). O wiki muda pelo Processar.
  rodar: ["--mcp-config", CONECTORES, "--permission-mode", "bypassPermissions", "--disallowedTools", "Edit(wiki/**)"],
  // A proposta de uma nota só lê.
  propor: [...FECHADO, "--tools", "Read,Glob,Grep", "--permission-mode", "dontAsk"],
  // Aprovada, a proposta grava, e só dentro do wiki/.
  gravar: [...FECHADO, "--tools", "Read,Glob,Grep,Edit,Write", "--permission-mode", "dontAsk", "--allowedTools", "Edit(wiki/**)"],
};

// O modelo e o esforço vêm do Personalizar; vazio é o padrão do Claude Code.
export const MODELS = new Set(["", "fable", "opus", "sonnet", "haiku"]);
export const EFFORTS = new Set(["", "low", "medium", "high", "xhigh", "max"]);

// Uma sessão que passa disso foi esquecida rodando: para.
const LIMIT = 30 * 60 * 1000;
const KEEP = 20;

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (t: number) => {
  const d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
};
const cut = (text: string, size = 90) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > size ? line.slice(0, size - 1) + "…" : line;
};

// O nome com que a skill se chama no Claude Code: o `name:` do SKILL.md ou a pasta.
export function skillName(file: string, slug: string) {
  const meta = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  const name = meta?.[1].match(/^name\s*:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
  return name || slug;
}

// Uma sessão aberta de dentro do Claude Code herdaria a sessão de quem abriu o
// servidor: a filha começa limpa.
export function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key.startsWith("CLAUDE_AGENT_SDK_")) delete env[key];
  return env;
}

export function runStore(brain: string, results: string) {
  let runs: Run[] = [];
  const procs = new Map<string, ChildProcess>();
  const bin = process.env.CLAUDE_BIN || "claude";

  const inside = (file: string) => {
    const rel = relative(brain, file);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : file;
  };

  // A etapa, tirada do que a sessão acabou de fazer.
  const describe = (tool: string, input: Record<string, unknown>) => {
    const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
    if (tool === "Read") return "Lendo " + inside(text("file_path"));
    if (tool === "Glob") return "Procurando " + text("pattern");
    if (tool === "Grep") return "Buscando “" + cut(text("pattern"), 40) + "”";
    if (tool === "Skill") return "Abrindo a skill " + text("skill");
    if (tool === "Write" || tool === "Edit") return "Escrevendo " + inside(text("file_path"));
    return "Usando " + tool;
  };

  // Guarda a resposta, com a origem no topo.
  const save = (run: Run, spec: Spec) => {
    mkdirSync(results, { recursive: true });
    const file = join(results, stamp(run.startedAt) + "-" + spec.slug + ".md");
    const meta = [
      "origem: sessão do Claude rodada no Founders OS",
      "cerebro: " + brain,
      ...spec.meta,
      ...(run.text ? ["instrucoes: " + JSON.stringify(run.text)] : []),
      "inicio: " + new Date(run.startedAt).toISOString(),
      "fim: " + new Date(run.endedAt ?? Date.now()).toISOString(),
      ...(run.session ? ["sessao: " + run.session] : []),
    ];
    writeFileSync(file, "---\n" + meta.join("\n") + "\n---\n\n# " + run.label + "\n\n" + run.result.trim() + "\n");
    return file;
  };

  const finish = (run: Run, spec: Spec, status: Run["status"], step: string) => {
    if (run.status !== "rodando") return;
    run.status = status;
    run.step = step;
    run.endedAt = Date.now();
    procs.delete(run.id);
    if (status !== "pronta") return;
    if (!run.result.trim()) run.step = "Terminou sem resposta";
    else {
      try {
        run.file = save(run, spec);
      } catch (error) {
        run.step = "Pronta, mas não deu para salvar: " + String(error);
      }
    }
    spec.done?.();
  };

  // Uma linha do stream-json: a etapa, a sessão e, no fim, a resposta.
  const read = (run: Run, spec: Spec, line: string) => {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === "system" && event.subtype === "init") {
      run.session = event.session_id ?? null;
      run.step = "Sessão aberta";
    } else if (event.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const part of event.message.content) {
        if (part.type === "tool_use") run.step = describe(part.name, part.input ?? {});
        else if (part.type === "text" && part.text.trim()) run.step = cut(part.text);
        else if (part.type === "thinking") run.step = "Pensando";
      }
    } else if (event.type === "result") {
      run.result = typeof event.result === "string" ? event.result : "";
      if (event.is_error || event.subtype !== "success") finish(run, spec, "falhou", cut(run.result || "A sessão terminou com erro"));
      else finish(run, spec, "pronta", "Resultado pronto");
    }
  };

  const stop = (run: Run) => {
    procs.get(run.id)?.kill();
    procs.delete(run.id);
    if (run.status !== "rodando") return;
    run.status = "parada";
    run.step = "Parada antes de terminar";
    run.endedAt = Date.now();
  };

  return {
    list(): Run[] {
      return runs;
    },

    // A última sessão de uma nota: diz em que pé a revisão está.
    latest(note: string): Run | undefined {
      return runs.find((run) => run.note === note);
    },

    start(spec: Spec): Run {
      const now = Date.now();
      const run: Run = {
        id: stamp(now) + "-" + Math.random().toString(36).slice(2, 6),
        path: spec.path,
        label: spec.label,
        kind: spec.kind,
        area: spec.area,
        areaLabel: spec.areaLabel,
        text: spec.text,
        note: spec.note,
        phase: spec.phase,
        startedAt: now,
        endedAt: null,
        status: "rodando",
        step: "Abrindo a sessão",
        result: "",
        file: null,
        session: spec.resume,
      };
      const args = [
        "-p",
        spec.prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        ...BASE,
        ...spec.access,
        ...(MODELS.has(spec.model) && spec.model ? ["--model", spec.model] : []),
        ...(EFFORTS.has(spec.effort) && spec.effort ? ["--effort", spec.effort] : []),
        ...(spec.resume ? ["--resume", spec.resume] : ["--name", "Founders OS · " + spec.label]),
      ];
      const proc = spawn(bin, args, { cwd: brain, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
      procs.set(run.id, proc);
      runs.unshift(run);
      // As que já terminaram e passaram do limite saem da lista. As que rodam ficam,
      // e as das notas também: saem quando a revisão é descartada.
      for (let i = runs.length - 1; i >= 0 && runs.length > KEEP; i--) if (runs[i].status !== "rodando" && !runs[i].note) runs.splice(i, 1);

      let rest = "";
      let errors = "";
      proc.stdout!.setEncoding("utf8");
      proc.stdout!.on("data", (chunk: string) => {
        const lines = (rest + chunk).split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) read(run, spec, line);
      });
      proc.stderr!.setEncoding("utf8");
      proc.stderr!.on("data", (chunk: string) => (errors = (errors + chunk).slice(-2000)));
      proc.on("error", (error: NodeJS.ErrnoException) =>
        finish(run, spec, "falhou", error.code === "ENOENT" ? "Não achei o claude no PATH do servidor" : cut(String(error))),
      );
      const timer = setTimeout(() => {
        if (run.status !== "rodando") return;
        proc.kill();
        finish(run, spec, "falhou", "Passou de 30 min: parada");
      }, LIMIT);
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (rest.trim()) read(run, spec, rest);
        finish(run, spec, "falhou", cut(errors.trim().split("\n").pop() || "A sessão parou sem resposta (código " + code + ")"));
      });
      return run;
    },

    // Rodando, a sessão para; terminada, sai da lista.
    dismiss(id: string): boolean {
      const run = runs.find((one) => one.id === id);
      if (!run) return false;
      if (run.status === "rodando") stop(run);
      else runs = runs.filter((one) => one !== run);
      return true;
    },

    // Descartar a revisão de uma nota: as sessões dela param e saem da lista.
    discard(note: string) {
      for (const run of runs) if (run.note === note) stop(run);
      runs = runs.filter((run) => run.note !== note);
    },

    // O servidor vai fechar: nenhuma sessão fica rodando sozinha.
    stopAll() {
      for (const proc of procs.values()) proc.kill();
    },
  };
}
