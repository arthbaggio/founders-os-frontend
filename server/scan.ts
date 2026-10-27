// Lê o cérebro (wiki/ e .claude/skills/) e devolve a árvore no formato do
// mapa: uma lista de áreas, a empresa primeiro, cada uma com o que guarda.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type BrainNode = {
  path: string;
  label: string;
  children?: BrainNode[];
  skills?: BrainNode[];
  routines?: BrainNode[];
  schedule?: string;
  // `pausada: sim` no SKILL.md: aparece como rotina, mas o servidor não a dispara.
  paused?: boolean;
};

export type BrainApp = { path: string; label: string; desc: string; tag: string; links: string[] };

export type BrainTree = { areas: BrainNode[]; apps: BrainApp[] };

// A ordem do anel. O que não estiver aqui entra depois, em ordem alfabética.
const ORDER = ["empresa", "produtos", "clientes", "vendas", "marketing", "operacoes", "financas", "administrativo", "compartilhado"];
const CENTER = "empresa";

// Nomes de pasta sem `index.md`: as palavras ganham de volta os acentos.
const WORDS: Record<string, string> = {
  acoes: "ações", administracao: "administração", agencia: "agência", analise: "análise", automacao: "automação",
  comparacoes: "comparações", conteudo: "conteúdo", criticas: "críticas", decisao: "decisão", decisoes: "decisões", economicos: "econômicos",
  financas: "finanças", gestao: "gestão", integracoes: "integrações", juridico: "jurídico", operacoes: "operações",
  pagina: "página", paginas: "páginas", politicas: "políticas", precificacao: "precificação", preco: "preço",
  principios: "princípios", publico: "público", reunioes: "reuniões", servico: "serviço", servicos: "serviços",
  objecoes: "objeções", societario: "societário", ia: "IA", crm: "CRM", sops: "SOPs", os: "OS", repositorio: "repositório",
  metricas: "métricas", padroes: "padrões", tecnico: "técnico", visao: "visão", negocios: "negócios", licoes: "lições",
};

const pretty = (slug: string) => {
  const text = slug
    .replace(/\.md$/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => WORDS[word.toLowerCase()] ?? word)
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

// O título de uma página: o primeiro H1, fora o frontmatter.
const title = (text: string) => {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const match = body.match(/^#\s+(.+?)\s*#*\s*$/m);
  return match ? match[1].trim() : "";
};

// O frontmatter simples (chave: valor), sem dependências.
const frontmatter = (text: string) => {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!match) return out;
  for (const line of match[1].split("\n")) {
    const at = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (at) out[at[1].toLowerCase()] = at[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
};

// A ordem de um índice: os links do `index.md` da pasta, na ordem em que aparecem.
const indexOrder = (dir: string) => {
  const text = read(join(dir, "index.md"));
  const order: string[] = [];
  for (const match of text.matchAll(/\]\(([^)#\s]+)/g)) {
    const first = decodeURI(match[1]).replace(/^\.\//, "").split("/")[0];
    if (first && !order.includes(first)) order.push(first);
  }
  return order;
};

const visible = (name: string) => !name.startsWith(".") && name !== "node_modules";

function folder(wiki: string, dir: string): BrainNode[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter(visible);
  } catch {
    return [];
  }
  const order = indexOrder(dir);
  const rank = (name: string) => {
    const at = order.indexOf(name);
    return at < 0 ? order.length + (name === "visao-geral.md" ? 0 : 1) : at;
  };
  const pages: BrainNode[] = [];
  const folders: BrainNode[] = [];
  const sorted = names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR"));
  for (const name of sorted) {
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    const path = relative(wiki, full).split(sep).join("/");
    if (stat.isDirectory()) {
      // Sem índice, a pasta usa o título da visão geral dela, se houver.
      const label = title(read(join(full, "index.md"))) || title(read(join(full, "visao-geral.md"))) || pretty(name);
      folders.push({ path, label, children: folder(wiki, full) });
    } else if (name.endsWith(".md") && name !== "index.md") {
      pages.push({ path, label: title(read(full)) || pretty(name) });
    }
  }
  return [...pages, ...folders];
}

export function scan(brain: string): BrainTree {
  const wiki = join(brain, "wiki");
  const areas: BrainNode[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(wiki).filter((name) => visible(name) && statSync(join(wiki, name)).isDirectory());
  } catch {
    names = [];
  }
  const rank = (name: string) => {
    const at = ORDER.indexOf(name);
    return at < 0 ? ORDER.length : at;
  };
  if (!names.includes(CENTER)) names.push(CENTER);
  names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR"));
  for (const name of names) {
    const dir = join(wiki, name);
    const label = title(read(join(dir, "index.md"))) || pretty(name);
    areas.push({ path: name, label, children: existsSync(dir) ? folder(wiki, dir) : [], skills: [], routines: [] });
  }
  const center = areas.find((area) => area.path === CENTER)!;
  // O log do wiki fica pendurado na empresa.
  const log = join(wiki, "log.md");
  if (existsSync(log)) center.children!.push({ path: "log.md", label: title(read(log)) || "Log do wiki" });

  // Skills e rotinas: uma pasta por skill, com o SKILL.md. Uma skill com
  // `schedule` no frontmatter é uma rotina; a área vem de `area` (padrão: empresa).
  const skills = join(brain, ".claude", "skills");
  let slugs: string[] = [];
  try {
    slugs = readdirSync(skills).filter((name) => visible(name) && existsSync(join(skills, name, "SKILL.md")));
  } catch {
    slugs = [];
  }
  for (const slug of slugs.sort()) {
    const text = read(join(skills, slug, "SKILL.md"));
    const meta = frontmatter(text);
    const wanted = (meta.area ?? "").toLowerCase();
    const home =
      areas.find((area) => area.path === wanted) ??
      areas.find((area) => area.label.toLowerCase() === wanted) ??
      center;
    const node: BrainNode = { path: `../.claude/skills/${slug}/SKILL.md`, label: meta.label || meta.title || pretty(meta.name || slug) };
    if (meta.schedule) {
      node.schedule = meta.schedule;
      if (/^(sim|true)$/i.test(meta.pausada ?? "")) node.paused = true;
      home.routines!.push(node);
    } else home.skills!.push(node);
  }
  return { areas, apps: [] };
}
