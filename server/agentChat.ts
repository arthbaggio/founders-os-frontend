// As conversas com os agentes do OpenBot, guardadas pelo app.
//
// A API local do OpenBot manda mensagens e devolve a resposta de cada entrega, mas
// não lista o histórico de uma conversa. Então o app guarda o que foi dito por aqui:
// uma conversa por agente, em sessoes/agentes/conversas/<agente>.json. O que alguém
// escreve direto no OpenBot não aparece aqui.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ChatMessage = {
  id: string;
  role: "voce" | "agente";
  text: string;
  at: string;
  // Só nas respostas do agente: a entrega no OpenBot e como ela está.
  agentId?: string;
  deliveryId?: string | null;
  status?: string;
  error?: string | null;
};

export const DONE = ["completed", "failed", "interrupted", "cancelled"];
const KEEP = 200;

export function chatStore(results: string) {
  const dir = join(results, "agentes", "conversas");
  const fileOf = (key: string) => join(dir, createHash("sha1").update(key).digest("hex").slice(0, 16) + ".json");

  const read = (key: string): ChatMessage[] => {
    const file = fileOf(key);
    if (!existsSync(file)) return [];
    try {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      return Array.isArray(saved?.messages) ? saved.messages : [];
    } catch {
      return [];
    }
  };
  const write = (key: string, messages: ChatMessage[]) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(fileOf(key), JSON.stringify({ key, messages: messages.slice(-KEEP) }, null, 2));
  };

  return {
    list: read,
    // A pergunta da pessoa e o lugar da resposta, que se completa quando a entrega termina.
    ask(key: string, text: string, agentId: string, deliveryId: string | null) {
      const now = new Date().toISOString();
      const stamp = Date.now().toString(36);
      const messages = read(key);
      messages.push({ id: "v" + stamp, role: "voce", text, at: now });
      messages.push({
        id: "a" + stamp,
        role: "agente",
        text: "",
        at: now,
        agentId,
        deliveryId,
        status: deliveryId ? "queued" : "failed",
        error: deliveryId ? null : "O OpenBot não devolveu a entrega.",
      });
      write(key, messages);
      return messages;
    },
    // As respostas que ainda estão rodando no OpenBot.
    open: (key: string) => read(key).filter((one) => one.role === "agente" && one.deliveryId && !DONE.includes(one.status ?? "")),
    update(key: string, id: string, patch: Partial<ChatMessage>) {
      const messages = read(key).map((one) => (one.id === id ? { ...one, ...patch } : one));
      write(key, messages);
      return messages;
    },
    clear(key: string) {
      rmSync(fileOf(key), { force: true });
    },
  };
}
