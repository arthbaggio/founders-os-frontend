// O ponto de partida antes do "Desenhar agentes": um agente por departamento,
// com o prompt de criação montado do cérebro. Aqui só LEMOS o cérebro.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scan, type BrainNode } from "./scan";

export type AgentSkill = { label: string; slug: string; desc: string; schedule?: string; paused?: boolean };
export type AgentSpec = {
  path: string;
  label: string;
  skills: AgentSkill[];
  routines: AgentSkill[];
  pages: number;
  prompt: string;
};

const CENTER = "empresa";

// "../.claude/skills/<slug>/SKILL.md" -> slug
const slugOf = (path: string) => path.match(/skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? path;

// A primeira frase do corpo do SKILL.md, sem o frontmatter nem o título.
export function describe(brain: string, slug: string): string {
  let text = "";
  try {
    text = readFileSync(join(brain, ".claude", "skills", slug, "SKILL.md"), "utf8");
  } catch {
    return "";
  }
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("|")) continue;
    const clean = line.replace(/^[-*>\s]+/, "").replace(/[*_`]/g, "");
    return clean.length > 150 ? clean.slice(0, 147).trimEnd() + "…" : clean;
  }
  return "";
}

// Quantas páginas (.md) tem a pasta, contando as subpastas.
const countPages = (nodes: BrainNode[] = []): number =>
  nodes.reduce((sum, node) => sum + (node.children ? countPages(node.children) : 1), 0);

// O que o agente sabe: as pastas e páginas do primeiro nível, pelo nome que o mapa mostra.
const topics = (nodes: BrainNode[] = []) => nodes.slice(0, 10).map((node) => node.label);

function promptFor(brain: string, area: BrainNode, skills: AgentSkill[], routines: AgentSkill[], pages: number): string {
  const center = area.path === CENTER;
  const lines: string[] = [];
  lines.push(
    center
      ? "Você é o agente geral da minha empresa: o que conhece o negócio todo e ajuda em qualquer área."
      : `Você é o agente de ${area.label} da minha empresa.`,
  );
  lines.push(`Nome do agente: ${area.label}.`);
  lines.push("");
  lines.push("## Seu workspace");
  lines.push(`Minha pasta de segundo cérebro é: ${brain}`);
  lines.push(
    center
      ? "Leia `AGENTS.md` e `wiki/empresa/` antes de responder. Para os outros departamentos, abra `wiki/<departamento>/`."
      : `Leia \`AGENTS.md\` e \`wiki/${area.path}/\` antes de responder (${pages} ${pages === 1 ? "página" : "páginas"}). Para o contexto geral, use \`wiki/empresa/\`.`,
  );
  const known = topics(area.children);
  if (known.length) lines.push(`O que você encontra em ${area.label}: ${known.join(", ")}.`);
  lines.push("");
  if (skills.length) {
    lines.push("## Skills que você usa");
    lines.push("Para usar uma skill, abra `.claude/skills/<nome>/SKILL.md` e siga o passo a passo.");
    for (const skill of skills) lines.push(`- \`${skill.slug}\` — ${skill.label}${skill.desc ? ": " + skill.desc : ""}`);
    lines.push("");
  }
  if (routines.length) {
    lines.push("## Rotinas sob sua responsabilidade");
    lines.push("Rode cada uma no horário indicado, seguindo o `SKILL.md` dela:");
    for (const routine of routines) {
      const note = routine.paused ? " (pausada: só rode se eu pedir)" : "";
      lines.push(`- \`${routine.slug}\` — ${routine.label}, ${routine.schedule}${note}`);
    }
    lines.push("");
  }
  lines.push("## Como trabalhar");
  lines.push("- Respostas curtas e diretas, em português.");
  lines.push("- Antes de afirmar algo sobre a empresa, confira no cérebro. Se não estiver lá, diga que não sabe.");
  lines.push("- Não edite `wiki/` sem eu aprovar a proposta. Você pode escrever em `fontes/notas/`.");
  lines.push("- Em dúvida, pergunte antes de agir.");
  return lines.join("\n");
}

export function agentSpecs(brain: string): AgentSpec[] {
  const tree = scan(brain);
  return tree.areas.map((area) => {
    const read = (nodes: BrainNode[] = []): AgentSkill[] =>
      nodes.map((node) => {
        const slug = slugOf(node.path);
        return { label: node.label, slug, desc: describe(brain, slug), schedule: node.schedule, paused: node.paused };
      });
    const skills = read(area.skills);
    const routines = read(area.routines);
    const pages = countPages(area.children);
    return { path: area.path, label: area.label, skills, routines, pages, prompt: promptFor(brain, area, skills, routines, pages) };
  });
}
