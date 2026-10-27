// As aplicações do anel: os conectores ligados ao Claude. Vêm de dois lugares:
// os da conta claude.ai, que só o `claude mcp list` conhece (e testa, o que
// leva meio minuto), e os locais da config do Claude Desktop, que o rodar usa.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { BrainApp } from "./scan";
import { CONECTORES, cleanEnv } from "./runs";

// De quanto em quanto tempo a lista da claude.ai se refaz.
const FRESH = 10 * 60 * 1000;

// Da config do Desktop, só os nomes: o resto (args, env) guarda chaves.
function desktop(): string[] {
  try {
    return Object.keys(JSON.parse(readFileSync(CONECTORES, "utf8")).mcpServers ?? {});
  } catch {
    return [];
  }
}

// Uma linha do `claude mcp list`: "claude.ai <Nome>: <url> - <estado>".
function parse(text: string) {
  const found: { name: string; status: string }[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^claude\.ai (.+?): \S+ - (.+)$/);
    if (!match) continue;
    const status = match[2].includes("Connected") ? "Conectado" : match[2].includes("Needs authentication") ? "Precisa de login" : "Com falha";
    found.push({ name: match[1].trim(), status });
  }
  return found;
}

export function appStore(onChange: () => void) {
  let cloud: { name: string; status: string }[] = [];
  let checkedAt = 0;
  let checking = false;
  const bin = process.env.CLAUDE_BIN || "claude";

  const refresh = () => {
    checking = true;
    let text = "";
    const proc = spawn(bin, ["mcp", "list"], { cwd: homedir(), env: cleanEnv(), stdio: ["ignore", "pipe", "ignore"] });
    proc.stdout.on("data", (chunk) => (text += chunk));
    const finish = (ok: boolean) => {
      checking = false;
      checkedAt = Date.now();
      if (!ok) return;
      const next = parse(text);
      if (JSON.stringify(next) === JSON.stringify(cloud)) return;
      cloud = next;
      onChange();
    };
    proc.on("error", () => finish(false));
    proc.on("close", (code) => finish(code === 0));
  };

  // Devolve o que já se sabe e, se estiver velho, pede a lista de novo.
  const current = (): BrainApp[] => {
    if (!checking && Date.now() - checkedAt > FRESH) refresh();
    const apps = new Map<string, BrainApp>();
    for (const { name, status } of cloud) apps.set(name.toLowerCase(), { path: "app:" + name, label: name, desc: status, tag: "claude.ai", links: [] });
    for (const name of desktop()) {
      const same = apps.get(name.toLowerCase());
      if (same) same.tag = "claude.ai + Claude Desktop";
      else apps.set(name.toLowerCase(), { path: "app:" + name, label: name, desc: "Local, no Claude Desktop", tag: "Claude Desktop", links: [] });
    }
    return [...apps.values()];
  };

  return { current, refresh };
}
