// A configuração do OpenBot feita de dentro do Founders OS:
//
// - Local scripts para todos os agentes. O OpenBot tem um padrão do servidor
//   (Server settings › Agent defaults › Local scripts) guardado em
//   <dados do OpenBot>/openbot-agent-defaults-v1.json, campo `allowAutomation`. Todo
//   agente sem escolha própria segue esse padrão. O OpenBot só lê o arquivo ao abrir
//   e depois o mantém na memória (src/main/preference-file.ts), então o arquivo é
//   gravado com o OpenBot FECHADO; aberto, ele sobrescreveria a mudança. Antes de
//   gravar, guardamos uma cópia do arquivo.
//
// - O conector "Segundo Cérebro" (mcp/segundo-cerebro.mjs): o comando para o
//   OpenBot rodar e o registro de uso que o próprio conector grava no cérebro.
import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { automationDir } from "./openbot";

const DEFAULTS_FILE = "openbot-agent-defaults-v1.json";

// A pasta de dados do OpenBot: a mãe da pasta automation/.
export const userDataDir = () => dirname(automationDir());

export function executable(): string | null {
  if (process.platform === "win32") {
    const exe = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Programs", "OpenBot", "OpenBot.exe");
    return existsSync(exe) ? exe : null;
  }
  if (process.platform === "darwin") return ["/Applications/OpenBot.app", join(homedir(), "Applications", "OpenBot.app")].find((one) => existsSync(one)) ?? null;
  return null;
}

// O logo do OpenBot instalado (o ícone dos dois olhos), lido do próprio app da pessoa.
// O Founders OS mostra como selo de "conectado"; nenhuma imagem do OpenBot vai no repositório.
export function openbotLogo(color = "gold"): string | null {
  const app = executable();
  if (!app) return null;
  const base = process.platform === "darwin" ? join(app, "Contents", "Resources") : join(dirname(app), "resources");
  const file = join(base, "icons", "logo-colors", `icon-${/^[a-z]+$/.test(color) ? color : "gold"}.png`);
  return existsSync(file) ? file : null;
}

const run = (cmd: string, args: string[]) =>
  new Promise<string>((done) => execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (_error, stdout) => done(String(stdout ?? ""))));

export async function isRunning(): Promise<boolean> {
  if (process.platform === "win32") return /OpenBot\.exe/i.test(await run("tasklist", ["/FI", "IMAGENAME eq OpenBot.exe", "/NH"]));
  if (process.platform === "darwin") return Boolean((await run("pgrep", ["-x", "OpenBot"])).trim());
  return Boolean((await run("pgrep", ["-if", "openbot"])).trim());
}

function readDefaults(): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(join(userDataDir(), DEFAULTS_FILE), "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// Sem arquivo, o OpenBot lê tudo como desligado.
export const localScriptsByDefault = () => readDefaults()?.allowAutomation === true;

// Fecha o OpenBot pedindo, sem matar: no Windows, taskkill sem /F manda fechar a janela.
export async function closeOpenBot(): Promise<boolean> {
  if (process.platform === "win32") await run("taskkill", ["/IM", "OpenBot.exe"]);
  else if (process.platform === "darwin") await run("osascript", ["-e", 'quit app "OpenBot"']);
  else await run("pkill", ["-TERM", "-if", "openbot"]);
  for (let i = 0; i < 20; i++) {
    if (!(await isRunning())) return true;
    await new Promise((done) => setTimeout(done, 1000));
  }
  return false;
}

export function launchOpenBot() {
  const exe = executable();
  try {
    if (process.platform === "darwin") spawn("open", ["-a", "OpenBot"], { detached: true, stdio: "ignore" }).unref();
    else if (exe) spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* a pessoa abre na mão */
  }
}

// Abre um link openbot:// pelo sistema, como um clique fora do navegador. Pelo
// navegador, o Chrome pergunta "Quer abrir o OpenBot?" a cada vez. Só aceita links
// openbot:// do marketplace, e sem shell (o link vai como um argumento só).
export function openOpenBotLink(link: string): boolean {
  if (!/^openbot:\/\/marketplace\/[\w/-]+$/.test(link)) return false;
  try {
    const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [link]] : process.platform === "darwin" ? ["open", [link]] : ["xdg-open", [link]];
    spawn(cmd, args as string[], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

// Liga o padrão. Só com o OpenBot fechado; guarda uma cópia do arquivo antes.
export function writeLocalScriptsDefault(): { file: string; backup: string | null } {
  const dir = userDataDir();
  if (!existsSync(dir)) throw new Error("Não achei a pasta de dados do OpenBot. Ele já foi aberto alguma vez neste computador?");
  const file = join(dir, DEFAULTS_FILE);
  let backup: string | null = null;
  if (existsSync(file)) {
    backup = file + ".founders-os-" + new Date().toISOString().replace(/[:.]/g, "-") + ".bak";
    copyFileSync(file, backup);
  }
  // Mantém o que já estava (os outros padrões) e liga só o Local scripts.
  const value = { ...(readDefaults() ?? {}), version: 1, allowAutomation: true };
  const part = file + ".founders-os.part";
  writeFileSync(part, JSON.stringify(value, null, 2));
  renameSync(part, file);
  return { file, backup };
}

// O conector: como o OpenBot o roda e quando foi usado pela última vez.
export function connectorInfo(appRoot: string, brain: string) {
  const script = resolve(appRoot, "mcp", "segundo-cerebro.mjs");
  let usage: Record<string, string> | null = null;
  try {
    usage = JSON.parse(readFileSync(join(brain, ".openbot", "conector.json"), "utf8"));
  } catch {
    usage = null;
  }
  return {
    name: "segundo-cerebro",
    command: "node",
    args: [script, "--cerebro", brain],
    line: `node "${script}" --cerebro "${brain}"`,
    connectedAt: usage?.conectado_em ?? null,
    client: usage?.cliente ?? null,
    lastUse: usage?.ultimo_uso ?? null,
    lastTool: usage?.ultima_ferramenta ?? null,
  };
}

export async function setupState(appRoot: string, brain: string) {
  return {
    installed: Boolean(executable()) || existsSync(userDataDir()),
    running: await isRunning(),
    localScripts: localScriptsByDefault(),
    connector: connectorInfo(appRoot, brain),
  };
}
