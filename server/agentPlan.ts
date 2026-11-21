// O "Desenhar agentes": uma sessão do Claude lê o cérebro inteiro, entende como a
// empresa funciona e propõe quais agentes criar no OpenBot, com o papel, as
// skills e as rotinas de cada um. A sessão só lê (Read, Glob, Grep). O plano fica
// em agentes/plano.json, na pasta de resultados do app, fora do cérebro.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACCESS, cleanEnv } from "./runs";
import { designInstructions, extractJson, normalizePlan } from "../skills/levar-para-openbot/scripts/openbot-import.mjs";

export type PlannedAgent = {
  name: string;
  mission: string;
  why: string;
  areas: string[];
  skills: string[];
  routines: { slug: string; schedule: string }[];
  triggers: string[];
  limits: string[];
  tools: string[];
  guidance: string;
  // Os departamentos (pastas de wiki/) de que o agente é dono.
  owns?: string[];
  prompt: string;
};
export type Plan = { createdAt: string; summary: string; gaps: string[]; agents: PlannedAgent[] };
export type PlanState = { status: "nenhum" | "rodando" | "pronto" | "falhou"; step: string; plan: Plan | null };

const LIMIT = 20 * 60 * 1000;


// O plano da resposta do Claude: o núcleo confere cada campo e monta os prompts.
export const parsePlan = (brain: string, text: string): Plan | null => normalizePlan(brain, extractJson(text)) as Plan | null;

export function planStore(brain: string, results: string) {
  const file = join(results, "agentes", "plano.json");
  let proc: ChildProcess | null = null;
  let state: PlanState = { status: "nenhum", step: "", plan: null };
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      // O plano é de um cérebro: com outra pasta, não vale.
      if (!saved.brain || saved.brain === brain) state = { status: "pronto", step: "", plan: saved };
    } catch {
      /* plano corrompido: começa vazio */
    }
  }

  const describe = (tool: string, input: Record<string, unknown>) => {
    const text = (key: string) => (typeof input[key] === "string" ? String(input[key]).replace(brain, "").replace(/^[\\/]/, "") : "");
    if (tool === "Read") return "Lendo " + text("file_path");
    if (tool === "Glob") return "Procurando " + text("pattern");
    if (tool === "Grep") return "Buscando no cérebro";
    return "Usando " + tool;
  };

  return {
    state: () => state,
    stop() {
      proc?.kill();
    },
    start() {
      if (state.status === "rodando") return state;
      const previous = state.plan;
      state = { status: "rodando", step: "Abrindo a sessão", plan: previous };
      const bin = process.env.CLAUDE_BIN || "claude";
      // Um agente por área do mapa: as instruções listam as áreas deste cérebro.
      const args = ["-p", designInstructions(brain), "--output-format", "stream-json", "--verbose", "--permission-prompts", "none", ...ACCESS.propor, "--name", "Founders OS · Desenhar agentes"];
      const child = spawn(bin, args, { cwd: brain, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
      proc = child;
      let rest = "";
      let result = "";
      let ok = false;
      const fail = (step: string) => {
        if (state.status === "rodando") state = { status: "falhou", step, plan: previous };
      };
      const timer = setTimeout(() => {
        child.kill();
        fail("Passou de 20 min: parada");
      }, LIMIT);
      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => {
        const lines = (rest + chunk).split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) {
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "assistant" && Array.isArray(event.message?.content)) {
            for (const part of event.message.content) {
              if (part.type === "tool_use") state.step = describe(part.name, part.input ?? {});
              else if (part.type === "thinking") state.step = "Pensando na estrutura";
              else if (part.type === "text" && part.text.trim()) state.step = "Escrevendo o plano";
            }
          } else if (event.type === "result") {
            result = typeof event.result === "string" ? event.result : "";
            ok = !event.is_error && event.subtype === "success";
          }
        }
      });
      child.on("error", (error: NodeJS.ErrnoException) => fail(error.code === "ENOENT" ? "Não achei o claude no PATH do servidor" : String(error)));
      child.on("close", () => {
        clearTimeout(timer);
        proc = null;
        if (state.status !== "rodando") return;
        if (!ok) return fail("A sessão terminou com erro");
        const plan = parsePlan(brain, result);
        if (!plan) return fail("A resposta não veio no formato do plano");
        mkdirSync(join(results, "agentes"), { recursive: true });
        writeFileSync(file, JSON.stringify({ ...plan, brain }, null, 2));
        state = { status: "pronto", step: "", plan };
      });
      return state;
    },
  };
}
