// O organograma do time: quem responde a quem, e os chefes que não são uma área
// (um Chief of Staff, um Head de Operações). Fica em sessoes/agentes/organograma.json,
// fora do cérebro e do git. Sem escolha, todo agente responde à Empresa.
//
// O OpenBot não tem hierarquia: um chefe é um agente comum cujas instruções dizem
// quem ele coordena. "Avisar os chefes" manda isso a cada chefe; um chefe que ainda
// não existe no OpenBot é pedido ao Dr. Eggbot.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { agentForArea, findEggbot, openbotState, sendToAgent, MAX_TEXT, type OpenBotAgent } from "./openbot";

export type OrgHead = { key: string; name: string; title: string; mission: string };
export type OrgNode = { key: string; name: string; mission: string; owns?: string[]; title?: string };
export type OrgResult = { at: string; sent: string[]; askedEggbot: string[]; missing: string[]; failed: string[] };
export type Org = { heads: OrgHead[]; reportsTo: Record<string, string | null>; applied: OrgResult | null };

const empty = (): Org => ({ heads: [], reportsTo: {}, applied: null });
const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Quem é o chefe de um nó. Sem escolha guardada: a Empresa (ou ninguém, para a própria Empresa).
export function parentOf(org: Org, nodes: OrgNode[], key: string): string | null {
  if (key in org.reportsTo) {
    const chosen = org.reportsTo[key];
    return chosen && nodes.some((one) => one.key === chosen) ? chosen : null;
  }
  if (org.heads.some((one) => one.key === key)) return null;
  const company = nodes.find((one) => one.owns?.includes("empresa"));
  return company && company.key !== key ? company.key : null;
}

// Verdadeiro se `maybe` está abaixo de `key` (para não fechar um ciclo).
function below(org: Org, nodes: OrgNode[], key: string, maybe: string): boolean {
  let at: string | null = maybe;
  for (let i = 0; at && i < 50; i++) {
    if (at === key) return true;
    at = parentOf(org, nodes, at);
  }
  return false;
}

export function orgStore(results: string) {
  const file = join(results, "agentes", "organograma.json");
  const read = (): Org => {
    try {
      if (!existsSync(file)) return empty();
      const saved = JSON.parse(readFileSync(file, "utf8"));
      return { heads: Array.isArray(saved.heads) ? saved.heads : [], reportsTo: saved.reportsTo && typeof saved.reportsTo === "object" ? saved.reportsTo : {}, applied: saved.applied ?? null };
    } catch {
      return empty();
    }
  };
  const write = (org: Org) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(org, null, 2));
    return org;
  };

  return {
    read,
    // Muda o chefe de um nó. Recusa um ciclo (um chefe abaixo do próprio subordinado).
    move(nodes: OrgNode[], key: string, to: string | null) {
      const org = read();
      if (!nodes.some((one) => one.key === key)) return { error: "Agente não encontrado" };
      if (to !== null && (!nodes.some((one) => one.key === to) || to === key || below(org, nodes, key, to))) return { error: "Esse agente já está abaixo dele" };
      org.reportsTo[key] = to;
      return { org: write(org) };
    },
    addHead(name: string, title: string, mission: string) {
      const org = read();
      const clean = name.trim().slice(0, 60);
      if (!clean) return { error: "Dê um nome ao chefe" };
      const key = "chefe:" + (slug(clean) || randomUUID().slice(0, 8));
      if (org.heads.some((one) => one.key === key)) return { error: "Já existe um chefe com esse nome" };
      org.heads.push({ key, name: clean, title: title.trim().slice(0, 60), mission: mission.trim().slice(0, 600) });
      return { org: write(org) };
    },
    // Tira um chefe; quem respondia a ele passa a responder ao chefe dele.
    removeHead(nodes: OrgNode[], key: string) {
      const org = read();
      if (!org.heads.some((one) => one.key === key)) return { error: "Chefe não encontrado" };
      const up = parentOf(org, nodes, key);
      for (const [child, boss] of Object.entries(org.reportsTo)) if (boss === key) org.reportsTo[child] = up;
      delete org.reportsTo[key];
      org.heads = org.heads.filter((one) => one.key !== key);
      return { org: write(org) };
    },
    saveResult(result: OrgResult) {
      const org = read();
      org.applied = result;
      return write(org);
    },
  };
}

// Os nós do organograma: os agentes do time e os chefes, cada um com o agente do OpenBot dele.
export function orgNodes(org: Org, team: OrgNode[]): OrgNode[] {
  return [...team, ...org.heads.map((one) => ({ key: one.key, name: one.name, mission: one.mission, title: one.title }))];
}
export const matchHead = (agents: OpenBotAgent[], name: string) => agentForArea(agents, { path: name, label: name });

const clip = (text: string, size: number) => (text.length > size ? text.slice(0, size - 1).trimEnd() + "…" : text);

// Manda a cada chefe quem ele coordena. Um chefe fora do OpenBot vai para o Dr. Eggbot criar.
export async function applyOrg(org: Org, nodes: OrgNode[], openbotOf: (node: OrgNode) => OpenBotAgent | null): Promise<OrgResult> {
  const result: OrgResult = { at: new Date().toISOString(), sent: [], askedEggbot: [], missing: [], failed: [] };
  const state = await openbotState();
  const eggbot = state.connected ? findEggbot(state.agents) : null;
  const childrenOf = (key: string) => nodes.filter((one) => parentOf(org, nodes, one.key) === key);
  for (const node of nodes) {
    const team = childrenOf(node.key);
    if (!team.length) continue;
    const boss = parentOf(org, nodes, node.key);
    const bossName = boss ? nodes.find((one) => one.key === boss)?.name : null;
    const role = node.title ? `${node.name} (${node.title})` : node.name;
    const list = team.map((one) => `- ${one.name}${one.mission ? ": " + clip(one.mission, 160) : ""}`).join("\n");
    const bot = openbotOf(node);
    if (bot) {
      const text = clip(
        [
          "Organograma do time, definido pelo dono no Founders OS. Guarde isto como parte das suas instruções.",
          "",
          `Você é ${role} e coordena estes agentes:`,
          list,
          "",
          "Quando um pedido for da área de um deles, delegue a ele pela conversa entre agentes, acompanhe até a resposta e me devolva o resultado consolidado. Não faça o trabalho deles no lugar deles.",
          bossName ? `Você responde a ${bossName}.` : "Você responde direto ao dono.",
          "Responda só com um ok curto.",
        ].join("\n"),
        MAX_TEXT,
      );
      const out = await sendToAgent(bot.id, text, "org-" + randomUUID()).catch(() => ({ status: 0 }));
      (out.status >= 200 && out.status < 300 ? result.sent : result.failed).push(node.name);
    } else if (eggbot) {
      const text = clip(
        [
          "Pedido do dono, feito no Founders OS: crie um agente novo para o organograma do time.",
          "",
          `Nome: ${node.name}`,
          node.title ? `Cargo: ${node.title}` : "",
          node.mission ? `Missão: ${node.mission}` : "",
          "",
          "Ele é um chefe: não executa o trabalho, entende o pedido, planeja e delega aos agentes que coordena, pela conversa entre agentes, e devolve a resposta consolidada.",
          "Coordena:",
          list,
          bossName ? `Responde a ${bossName}.` : "Responde direto ao dono.",
          "",
          "Use exatamente esse nome no agente. Se faltar algo importante, pergunte antes de criar.",
        ]
          .filter((line, i, all) => line || all[i - 1])
          .join("\n"),
        MAX_TEXT,
      );
      const out = await sendToAgent(eggbot.id, text, "org-" + randomUUID()).catch(() => ({ status: 0 }));
      (out.status >= 200 && out.status < 300 ? result.askedEggbot : result.failed).push(node.name);
    } else result.missing.push(node.name);
  }
  return result;
}
