// Um agente novo pelo Dr. Eggbot. O pedido completo (o método criar-agente, o modelo
// escolhido e o que a pessoa descreveu) vai num arquivo dentro do cérebro, porque uma
// mensagem da API do OpenBot tem no máximo 4.000 caracteres; a mensagem só aponta
// para ele. Os modelos ficam em skills/criar-agente/modelos/.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { findEggbot, openbotState, sendToAgent } from "./openbot";

export type AgentTemplate = { slug: string; name: string; area: string; mission: string };

const methodDir = (appRoot: string) => join(appRoot, "skills", "criar-agente");

export function listTemplates(appRoot: string): AgentTemplate[] {
  const dir = join(methodDir(appRoot), "modelos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((one) => one.endsWith(".md"))
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      return {
        slug: file.replace(/\.md$/, ""),
        name: text.match(/^# Modelo:\s*(.+)$/m)?.[1].trim() ?? file,
        area: text.match(/^- Área:\s*`([^`]+)`/m)?.[1] ?? "",
        mission: text.match(/^- Missão:\s*(.+)$/m)?.[1].trim() ?? "",
      };
    });
}

export async function askEggbot(appRoot: string, brain: string, template: string, description: string) {
  const state = await openbotState();
  if (!state.connected) return { status: 409, body: { error: "Abra o OpenBot primeiro." } };
  const eggbot = findEggbot(state.agents);
  if (!eggbot) return { status: 409, body: { error: "Instale o Dr. Eggbot primeiro (etapa 6 do Configurar)." } };
  const text = description.trim();
  if (text.length < 15) return { status: 400, body: { error: "Descreva o processo em pelo menos uma frase." } };
  const model = template ? listTemplates(appRoot).find((one) => one.slug === template) : null;
  if (template && !model) return { status: 400, body: { error: "Modelo não encontrado" } };

  const method = readFileSync(join(methodDir(appRoot), "SKILL.md"), "utf8").replace(/^---[\s\S]*?---\s*/, "");
  const lines = [
    "# Pedido de agente novo",
    "",
    "Pedido do dono deste OpenBot, feito no Founders OS. Siga o método abaixo: faça as perguntas que faltarem, monte a tabela de etapas e mostre para o dono aprovar antes de criar o agente.",
    "",
    `Pasta do segundo cérebro: ${brain}`,
    "",
    "## O que o dono descreveu",
    "",
    text.slice(0, 6000),
    "",
  ];
  if (model) lines.push("## Modelo de partida", "", readFileSync(join(methodDir(appRoot), "modelos", model.slug + ".md"), "utf8"), "");
  lines.push("## O método", "", method);
  const dir = join(brain, ".openbot");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  const file = join(dir, "novo-agente.md");
  writeFileSync(file, lines.join("\n"));

  const message = [
    `Quero um agente novo${model ? ` (modelo: ${model.name})` : ""}.`,
    `O pedido completo está no arquivo ${file}. Leia o arquivo inteiro e siga o método dele: pergunte o que faltar e me mostre a tabela de etapas antes de criar.`,
    "",
    "Resumo: " + text.slice(0, 600),
  ].join("\n");
  const out = await sendToAgent(eggbot.id, message, "novo-agente-" + randomUUID());
  return out.status >= 200 && out.status < 300 ? { status: 200, body: { ok: true, eggbot } } : { status: out.status || 502, body: { error: out.body?.error || "O OpenBot não aceitou o pedido" } };
}
