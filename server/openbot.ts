// A ponte local com o OpenBot. O OpenBot, quando algum agente liga "Local scripts",
// escuta em 127.0.0.1 numa porta livre e grava `url`, `token` e `headers` em
// <userData>/automation/. Aqui lemos esses arquivos a cada pedido (o token muda a
// cada início) e falamos com a API dele. Só o SERVIDOR do app fala com o OpenBot:
// o OpenBot recusa pedidos com `Origin`, que é o que um navegador manda.
//
// Só usamos três rotas dele: listar agentes, mandar mensagem e ler a entrega.
// Criar agente não existe nessa API: a criação é no app do OpenBot (por prompt).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type OpenBotAgent = { id: string; name: string };
export type OpenBotState =
  | { connected: true; agents: OpenBotAgent[] }
  | { connected: false; reason: "off" | "no-agents" | "error"; agents: [] };

const TIMEOUT_MS = 6000;

// A pasta de dados do OpenBot em cada sistema.
export function openbotRoot(): string {
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "OpenBot");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "OpenBot");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "OpenBot");
}

// Os servidores do OpenBot neste computador: o principal e os servidores locais
// (Settings › Servers). Cada servidor local é um processo do OpenBot com a própria
// pasta de dados, em local-servers/<id>/: agentes, padrões e Local scripts são dele.
export type OpenBotServer = { id: string | null; name: string };
export function listServers(): OpenBotServer[] {
  const out: OpenBotServer[] = [{ id: null, name: "Principal" }];
  try {
    const saved = JSON.parse(readFileSync(join(openbotRoot(), "openbot-local-servers-v1.json"), "utf8"));
    for (const one of Array.isArray(saved?.servers) ? saved.servers : [])
      if (typeof one?.id === "string" && /^[\w-]+$/.test(one.id)) out.push({ id: one.id, name: typeof one.name === "string" && one.name ? one.name : one.id });
  } catch {
    /* sem servidores locais */
  }
  return out;
}

// O servidor com que o Founders OS fala. A escolha da pessoa é guardada pelo app
// (brainApi). Sem escolha, o app segue o OpenBot aberto: usa o servidor que está
// com a API local de pé, para funcionar sozinho no computador de qualquer pessoa.
let selected: string | null = null;
let chosen = false;
export const selectedServer = () => selected;
export const serverChosen = () => chosen;
export function selectServer(id: string | null, byPerson = true): boolean {
  if (id !== null && !listServers().some((one) => one.id === id)) return false;
  selected = id;
  chosen = byPerson;
  return true;
}
// Sem escolha da pessoa: o servidor com a API local aberta (url e token na pasta).
function followOpenServer() {
  if (chosen || endpointIn(dataDirOf(selected))) return;
  const open = listServers().find((one) => endpointIn(dataDirOf(one.id)));
  if (open) selected = open.id;
}

// A pasta de dados do servidor escolhido. OPENBOT_AUTOMATION_DIR troca a pasta automation/ inteira.
const dataDirOf = (id: string | null) => (id ? join(openbotRoot(), "local-servers", id) : openbotRoot());
export const serverDataDir = () => {
  followOpenServer();
  return dataDirOf(selected);
};
export function automationDir(): string {
  if (process.env.OPENBOT_AUTOMATION_DIR) return process.env.OPENBOT_AUTOMATION_DIR;
  return join(serverDataDir(), "automation");
}

function endpoint(): { url: string; token: string } | null {
  return endpointIn(process.env.OPENBOT_AUTOMATION_DIR ? null : serverDataDir(), automationDir());
}
function endpointIn(dataDir: string | null, dir = dataDir ? join(dataDir, "automation") : automationDir()): { url: string; token: string } | null {
  try {
    const url = readFileSync(join(dir, "url"), "utf8").trim();
    const token = readFileSync(join(dir, "token"), "utf8").trim();
    // Só aceita o loopback: nunca mandamos o token para outro lugar.
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !token) return null;
    return { url, token };
  } catch {
    return null;
  }
}

async function call(path: string, init: { method?: string; json?: unknown } = {}) {
  const at = endpoint();
  if (!at) return { status: 0, body: null as any };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(at.url + path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${at.token}`, ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// Sem escolha da pessoa e com mais de um servidor aberto: fica com o que tem mais
// agentes do time (pelo nome). É o servidor onde o Configurar tudo montou o time.
// Empate: o servidor de agora. Roda a cada leitura da lista, mas só consulta a API
// local (127.0.0.1) dos servidores abertos.
export async function pickServerFor(names: string[]) {
  if (chosen || process.env.OPENBOT_AUTOMATION_DIR) return;
  const open = listServers().filter((one) => endpointIn(dataDirOf(one.id)));
  if (open.length < 2) return;
  const wanted = names.map((name) => ({ path: name, label: name }));
  let best = { id: selected, score: -1 };
  for (const server of open) {
    const at = endpointIn(dataDirOf(server.id))!;
    try {
      const res = await fetch(at.url + "/v1/agents", { headers: { Authorization: `Bearer ${at.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = res.ok ? await res.json() : [];
      const agents: OpenBotAgent[] = Array.isArray(body) ? body.filter((one: any) => typeof one?.id === "string" && typeof one?.name === "string") : [];
      const score = wanted.filter((area) => agentForArea(agents, area)).length;
      if (score > best.score || (score === best.score && server.id === selected)) best = { id: server.id, score };
    } catch {
      /* servidor que não respondeu fica de fora */
    }
  }
  if (best.score > 0) selected = best.id;
}

export async function openbotState(): Promise<OpenBotState> {
  if (!endpoint()) return { connected: false, reason: "off", agents: [] };
  try {
    const { status, body } = await call("/v1/agents");
    if (status !== 200 || !Array.isArray(body)) return { connected: false, reason: "error", agents: [] };
    const agents = body.filter((one) => one && typeof one.id === "string" && typeof one.name === "string").map((one) => ({ id: one.id, name: one.name }));
    return agents.length ? { connected: true, agents } : { connected: false, reason: "no-agents", agents: [] };
  } catch {
    return { connected: false, reason: "error", agents: [] };
  }
}

// O agente do OpenBot que cuida de uma área: o nome é o da área (sem acento nem
// maiúscula), com ou sem um "Agente de" na frente.
const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function agentForArea(agents: OpenBotAgent[], area: { path: string; label: string }): OpenBotAgent | null {
  const wanted = [plain(area.label), plain(area.path)].filter(Boolean);
  for (const agent of agents) {
    const name = plain(agent.name).replace(/^agente (de |do |da )?/, "");
    if (wanted.includes(name)) return agent;
  }
  return null;
}

// O Dr. Eggbot: o agente oficial do marketplace do OpenBot que desenha e cria
// outros agentes. Você explica o processo, ele pergunta o que falta e cria o agente.
export const EGGBOT_INSTALL = "openbot://marketplace/agents/openbot-curated-agent-dr-eggbot";
export const EGGBOT_PAGE = "https://openbot.run/marketplace/agents/openbot-curated-agent-dr-eggbot";
export const findEggbot = (agents: OpenBotAgent[]): OpenBotAgent | null => agents.find((one) => plain(one.name).replace(/ /g, "").includes("eggbot")) ?? null;

export const MAX_TEXT = 4000;

// Manda um texto para um agente que o OpenBot listou. O id vem SEMPRE da lista dele,
// nunca direto do pedido do navegador.
export async function sendToAgent(agentId: string, text: string, clientMessageId: string) {
  const state = await openbotState();
  if (!state.connected || !state.agents.some((one) => one.id === agentId)) return { status: 404, body: { error: "Agente não encontrado no OpenBot" } };
  const clean = text.trim();
  if (!clean || clean.length > MAX_TEXT) return { status: 400, body: { error: "Texto vazio ou maior que " + MAX_TEXT + " caracteres" } };
  const { status, body } = await call(`/v1/agents/${encodeURIComponent(agentId)}/messages`, {
    method: "POST",
    json: { text: clean, clientMessageId: clientMessageId.slice(0, 128) },
  });
  return { status: status || 502, body };
}

// O que espera uma pessoa: perguntas e aprovações do agente (sem histórico da conversa).
export async function pendingOf(agentId: string) {
  const empty = { prompts: [], approvals: [], browserTakeovers: [] };
  const state = await openbotState();
  if (!state.connected || !state.agents.some((one) => one.id === agentId)) return empty;
  const { status, body } = await call(`/v1/agents/${encodeURIComponent(agentId)}/pending`);
  return status === 200 && body ? body : empty;
}

// Aceitar ou recusar uma aprovação que a pessoa viu no front.
export async function respondApproval(agentId: string, requestId: string, decision: "accept" | "decline") {
  const state = await openbotState();
  if (!state.connected || !state.agents.some((one) => one.id === agentId)) return { status: 404, body: { error: "Agente não encontrado no OpenBot" } };
  const { status, body } = await call(`/v1/agents/${encodeURIComponent(agentId)}/approvals/${encodeURIComponent(requestId)}/respond`, { method: "POST", json: { decision } });
  return { status: status || 502, body };
}

// Responder uma pergunta do agente: { idDaPergunta: ["resposta"] }.
export async function answerPrompt(agentId: string, requestId: string, answers: Record<string, string[]>) {
  const state = await openbotState();
  if (!state.connected || !state.agents.some((one) => one.id === agentId)) return { status: 404, body: { error: "Agente não encontrado no OpenBot" } };
  const { status, body } = await call(`/v1/agents/${encodeURIComponent(agentId)}/prompts/${encodeURIComponent(requestId)}/answer`, { method: "POST", json: { answers } });
  return { status: status || 502, body };
}

export async function deliveryOf(agentId: string, deliveryId: string) {
  const state = await openbotState();
  if (!state.connected || !state.agents.some((one) => one.id === agentId)) return { status: 404, body: { error: "Agente não encontrado no OpenBot" } };
  const { status, body } = await call(`/v1/agents/${encodeURIComponent(agentId)}/deliveries/${encodeURIComponent(deliveryId)}`);
  return { status: status || 502, body };
}
