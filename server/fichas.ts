// A ficha de cada agente: as skills que ele usa além (ou no lugar) das da área, os
// conectores que pode usar e as regras próprias. Fica em sessoes/agentes/fichas.json,
// fora do cérebro e do git, e entra por cima do plano desenhado: o organograma, o
// Configurar tudo e o arquivo de importação já saem com ela. "Aplicar no OpenBot"
// manda a ficha a um agente que já existe, num arquivo dentro do cérebro.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { composePrompt, readSkills } from "../skills/levar-para-openbot/scripts/openbot-import.mjs";
import { sendToAgent } from "./openbot";

export type Ficha = { skillsAdd: string[]; skillsRemove: string[]; connectors: string[]; rules: string[]; appliedAt?: string | null };
type PlanAgent = { name: string; skills: string[]; limits: string[]; tools: string[]; prompt: string; owns?: string[]; [key: string]: unknown };
type Plan = { agents: PlanAgent[]; [key: string]: unknown };

const list = (value: unknown, max: number, size: number) =>
  Array.isArray(value) ? [...new Set(value.map((one) => String(one).trim()).filter(Boolean))].slice(0, max).map((one) => one.slice(0, size)) : [];

export function fichaStore(results: string) {
  const file = join(results, "agentes", "fichas.json");
  const read = (): Record<string, Ficha> => {
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    } catch {
      return {};
    }
  };
  const write = (all: Record<string, Ficha>) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(all, null, 2));
  };
  return {
    read,
    save(key: string, input: Partial<Ficha>, skillSlugs: string[]) {
      const all = read();
      const known = (slugs: string[]) => slugs.filter((one) => skillSlugs.includes(one));
      all[key] = {
        skillsAdd: known(list(input.skillsAdd, 60, 80)),
        skillsRemove: known(list(input.skillsRemove, 60, 80)),
        connectors: list(input.connectors, 30, 80),
        rules: list(input.rules, 20, 300),
        appliedAt: all[key]?.appliedAt ?? null,
      };
      write(all);
      return all[key];
    },
    applied(key: string) {
      const all = read();
      if (all[key]) all[key].appliedAt = new Date().toISOString();
      write(all);
    },
  };
}

// O plano com as fichas por cima: skills, conectores e regras. O prompt de todo
// agente é refeito, para as regras de sempre (como a de skill nova) valerem também
// para um time desenhado antes delas.
export function withFichas(brain: string, plan: Plan, fichas: Record<string, Ficha>): Plan {
  const skills = readSkills(brain);
  return {
    ...plan,
    agents: plan.agents.map((agent) => {
      const ficha = fichas["plano:" + agent.name];
      if (!ficha) return { ...agent, prompt: composePrompt(brain, agent, skills) };
      const next = {
        ...agent,
        skills: [...new Set([...agent.skills.filter((one) => !ficha.skillsRemove.includes(one)), ...ficha.skillsAdd])],
        limits: [...agent.limits, ...ficha.rules, ...(ficha.connectors.length ? [`Use só estes conectores: ${ficha.connectors.join(", ")}. Para outra ferramenta, peça antes.`] : [])],
        tools: ficha.connectors.length ? ficha.connectors : agent.tools,
      };
      return { ...next, prompt: composePrompt(brain, next, skills) };
    }),
  };
}

// Manda a ficha a um agente que já existe no OpenBot: as skills para instalar, o que
// deixar de usar e as instruções novas. O pedido completo vai num arquivo no cérebro.
export async function applyFicha(brain: string, agent: PlanAgent, botId: string, removed: string[]) {
  const dir = join(brain, ".openbot");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  const file = join(dir, "ficha-" + agent.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") + ".md");
  const skillDir = (slug: string) => join(brain, ".claude", "skills", slug);
  const lines = [
    `# Ficha atualizada: ${agent.name}`,
    "",
    "Pedido do dono deste OpenBot, feito no Founders OS. Aplique em você mesmo, na ordem, sem perguntar de novo.",
    "",
    "## 1. Skills",
    "Para cada skill abaixo que você ainda não tem: copie a pasta indicada para o seu workspace, rode `create_skill` com essa cópia (se a skill já estiver na biblioteca, use a que existe) e `install_local_skill` com o seu próprio agentId.",
    ...agent.skills.map((slug) => `- \`${slug}\`: ${skillDir(slug)}`),
    ...(removed.length ? ["", "Deixe de usar estas skills (desinstale se houver ferramenta para isso):", ...removed.map((slug) => `- \`${slug}\``)] : []),
    "",
    "## 2. Suas instruções",
    "Troque as suas instruções pelo texto abaixo, se houver ferramenta para editar o próprio agente. Se não houver, guarde como a regra principal da sua memória.",
    "",
    "```",
    agent.prompt,
    "```",
    "",
    "## 3. Responda",
    "Responda só com um ok curto e a lista do que instalou.",
  ];
  writeFileSync(file, lines.join("\n"));
  const text = `Sua ficha foi atualizada no Founders OS. Leia o arquivo ${file} inteiro e aplique em você mesmo, na ordem. Responda com um ok curto e o que instalou.`;
  return sendToAgent(botId, text, "ficha-" + randomUUID());
}
