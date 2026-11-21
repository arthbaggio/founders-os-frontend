// O conector "Segundo Cérebro": um servidor MCP local (stdio, sem dependências,
// Node 18+) que dá aos agentes do OpenBot, ou de qualquer app com MCP, acesso ao
// segundo cérebro AO VIVO: ver as áreas, buscar, ler páginas e skills, e salvar
// notas. No OpenBot, um servidor MCP vale para todos os agentes do servidor; o
// papel de cada um (quais áreas são dele) vem das instruções do agente.
//
// O que ele pode mudar no cérebro: criar notas em fontes/notas/ (a caixa de
// notas do Founders OS, que vão para o wiki pelo Processar, com aprovação), salvar
// skills em .claude/skills/ (só depois de procurar uma parecida; editar guarda a
// versão anterior em .openbot/skills-anteriores/) e o registro de uso em
// .openbot/conector.json, que o Founders OS lê para saber que o conector está
// ligado. O wiki/ nunca é escrito daqui.
//
//   node mcp/segundo-cerebro.mjs --cerebro <pasta do cérebro>
//   (ou a variável BRAIN_DIR)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";

const VERSION = "1.1.0";
const at = process.argv.indexOf("--cerebro");
const BRAIN = resolve(at >= 0 ? process.argv[at + 1] : process.env.BRAIN_DIR || process.cwd());
const WIKI = join(BRAIN, "wiki");
const SKILLS = join(BRAIN, ".claude", "skills");
const NOTES = join(BRAIN, "fontes", "notas");
const HIDDEN = new Set([".git", ".openbot", ".obsidian", ".trash", "node_modules"]);
const PAGE_MAX = 60_000;

const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const rel = (file) => relative(BRAIN, file).split(sep).join("/");
const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

function walk(dir, ext = ".md") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (HIDDEN.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (pair) out[pair[1].toLowerCase()] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const titleOf = (text, file) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").match(/^#\s+(.+?)\s*#*\s*$/m)?.[1].trim() || file.split(/[\\/]/).pop().replace(/\.md$/, "");

function skills() {
  if (!existsSync(SKILLS)) return [];
  return readdirSync(SKILLS)
    .filter((slug) => !slug.startsWith(".") && existsSync(join(SKILLS, slug, "SKILL.md")))
    .sort()
    .map((slug) => {
      const meta = frontmatter(read(join(SKILLS, slug, "SKILL.md")));
      return { slug, nome: meta.label || meta.name || slug, area: meta.area || "empresa", horario: meta.schedule || null, descricao: meta.description || null };
    });
}

// As skills mais parecidas com uma nova, pelas palavras do nome e da descrição.
const STOP = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "um", "uma", "no", "na", "que", "skill"]);
const words = (text) => new Set(plain(text).split(/[^a-z0-9]+/).filter((one) => one.length > 2 && !STOP.has(one)));
function similarSkills(name, description) {
  const wanted = words(name + " " + description);
  if (!wanted.size) return [];
  return skills()
    .map((one) => {
      const have = words(one.slug.replace(/-/g, " ") + " " + one.nome + " " + (one.descricao ?? ""));
      const shared = [...wanted].filter((word) => have.has(word)).length;
      return { slug: one.slug, nome: one.nome, area: one.area, descricao: one.descricao, semelhanca: Math.round((shared / Math.min(wanted.size, have.size || 1)) * 100) / 100 };
    })
    .filter((one) => one.semelhanca >= 0.2)
    .sort((a, b) => b.semelhanca - a.semelhanca)
    .slice(0, 5);
}

// Um caminho pedido pelo agente: só .md dentro do cérebro, fora das pastas escondidas.
function safePath(path) {
  if (typeof path !== "string" || !path.trim()) return null;
  const file = resolve(BRAIN, path.trim().replace(/^\/+/, ""));
  if (!file.startsWith(BRAIN + sep) || !file.endsWith(".md")) return null;
  if (rel(file).split("/").some((part) => HIDDEN.has(part))) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

// ── As ferramentas ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "visao_geral",
    description:
      "Mostra o mapa do segundo cérebro da empresa: as áreas (departamentos) com quantas páginas cada uma tem, e as skills e rotinas de cada área. Use primeiro, para saber onde procurar.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() {
      const areas = existsSync(WIKI)
        ? readdirSync(WIKI, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !HIDDEN.has(entry.name))
            .map((entry) => ({ area: entry.name, pasta: `wiki/${entry.name}/`, paginas: walk(join(WIKI, entry.name)).length }))
        : [];
      const all = skills();
      return {
        cerebro: BRAIN,
        arquivos_de_base: ["CLAUDE.md", "AGENTS.md"].filter((name) => existsSync(join(BRAIN, name))),
        areas: areas.map((one) => ({
          ...one,
          skills: all.filter((s) => s.area === one.area && !s.horario).map((s) => s.slug),
          rotinas: all.filter((s) => s.area === one.area && s.horario).map((s) => `${s.slug} (${s.horario})`),
        })),
      };
    },
  },
  {
    name: "buscar",
    description:
      "Busca no segundo cérebro (wiki/ e fontes/) por palavras, sem diferença de acento ou maiúscula. Devolve as páginas mais relevantes com um trecho. Use `area` para buscar só num departamento, por exemplo \"vendas\".",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "O que procurar." },
        area: { type: "string", description: "Opcional: a pasta de wiki/ onde procurar, por exemplo vendas." },
        limite: { type: "number", description: "Quantas páginas devolver (padrão 8, máximo 20)." },
      },
      required: ["texto"],
      additionalProperties: false,
    },
    run({ texto, area, limite }) {
      const words = plain(String(texto ?? "")).split(/\s+/).filter((word) => word.length > 1);
      if (!words.length) throw new Error("Diga o que procurar em `texto`.");
      const roots = area ? [join(WIKI, String(area).replace(/[^\w-]/g, ""))] : [WIKI, join(BRAIN, "fontes")];
      const hits = [];
      for (const file of roots.flatMap((root) => walk(root))) {
        const text = read(file);
        const low = plain(text);
        if (!words.every((word) => low.includes(word))) continue;
        const score = words.reduce((sum, word) => sum + low.split(word).length - 1, 0) + (words.some((word) => plain(titleOf(text, file)).includes(word)) ? 10 : 0);
        const first = low.indexOf(words[0]);
        const snippet = text.slice(Math.max(0, first - 120), first + 220).replace(/\s+/g, " ").trim();
        hits.push({ caminho: rel(file), titulo: titleOf(text, file), trecho: snippet, score });
      }
      hits.sort((a, b) => b.score - a.score);
      const max = Math.min(20, Math.max(1, Number(limite) || 8));
      return { encontradas: hits.length, paginas: hits.slice(0, max).map(({ score, ...hit }) => hit) };
    },
  },
  {
    name: "ler_pagina",
    description: "Lê uma página do segundo cérebro pelo caminho a partir da raiz, por exemplo wiki/vendas/icp.md ou AGENTS.md.",
    inputSchema: {
      type: "object",
      properties: { caminho: { type: "string", description: "Caminho a partir da raiz do cérebro, terminando em .md." } },
      required: ["caminho"],
      additionalProperties: false,
    },
    run({ caminho }) {
      const file = safePath(caminho);
      if (!file) throw new Error(`Não achei a página “${caminho}”. Use visao_geral ou buscar para ver os caminhos.`);
      const text = read(file);
      return { caminho: rel(file), conteudo: text.length > PAGE_MAX ? text.slice(0, PAGE_MAX) + "\n\n[…página cortada]" : text };
    },
  },
  {
    name: "listar_skills",
    description: "Lista as skills e rotinas do cérebro (o passo a passo do que a empresa sabe fazer), com área e horário. Use `area` para só um departamento.",
    inputSchema: {
      type: "object",
      properties: { area: { type: "string", description: "Opcional: só as skills desta área." } },
      additionalProperties: false,
    },
    run({ area }) {
      const all = skills();
      return { skills: area ? all.filter((one) => one.area === String(area)) : all };
    },
  },
  {
    name: "ler_skill",
    description: "Lê o passo a passo de uma skill ou rotina do cérebro (o SKILL.md dela) pelo nome curto, por exemplo proposta-web.",
    inputSchema: {
      type: "object",
      properties: { skill: { type: "string", description: "O nome curto (slug) da skill." } },
      required: ["skill"],
      additionalProperties: false,
    },
    run({ skill }) {
      const slug = String(skill ?? "").replace(/[^\w-]/g, "");
      const file = join(SKILLS, slug, "SKILL.md");
      if (!slug || !existsSync(file)) throw new Error(`Não achei a skill “${skill}”. Use listar_skills.`);
      const extras = walk(join(SKILLS, slug), "").filter((one) => !one.endsWith("SKILL.md")).map(rel);
      return { skill: slug, conteudo: read(file), outros_arquivos: extras };
    },
  },
  {
    name: "procurar_skill_parecida",
    description:
      "Antes de criar uma skill nova, procure se já existe uma parecida no cérebro. Devolve as skills mais próximas pelo nome e pela descrição. Se uma servir, edite essa (salvar_skill com editar: true) em vez de criar outra.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "O nome da skill que você quer criar." },
        descricao: { type: "string", description: "O que ela faz, em uma frase." },
      },
      required: ["nome"],
      additionalProperties: false,
    },
    run({ nome, descricao }) {
      return { parecidas: similarSkills(String(nome ?? ""), String(descricao ?? "")) };
    },
  },
  {
    name: "salvar_skill",
    description:
      "Salva uma skill no cérebro, em .claude/skills/<slug>/SKILL.md, ligada à área do seu papel (`area`). Antes, rode procurar_skill_parecida: se houver uma parecida, a ferramenta recusa e mostra qual; edite essa (`editar: true` com o slug dela) ou, se for mesmo outra coisa, mande `nova_mesmo_assim: true`. Editar guarda uma cópia da versão anterior.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Nome curto, minúsculo, com hífens. Ex.: follow-up-pos-proposta." },
        area: { type: "string", description: "A área do cérebro (uma pasta de wiki/), por exemplo vendas." },
        nome: { type: "string", description: "Nome legível da skill." },
        descricao: { type: "string", description: "Quando usar a skill, em uma ou duas frases." },
        conteudo: { type: "string", description: "O passo a passo, em Markdown (sem o frontmatter)." },
        editar: { type: "boolean", description: "true para reescrever uma skill que já existe com esse slug." },
        nova_mesmo_assim: { type: "boolean", description: "true para criar mesmo havendo skills parecidas." },
        agente: { type: "string", description: "O seu nome de agente." },
      },
      required: ["slug", "area", "nome", "descricao", "conteudo"],
      additionalProperties: false,
    },
    run({ slug, area, nome, descricao, conteudo, editar, nova_mesmo_assim, agente }) {
      const name = String(slug ?? "").trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 60) throw new Error("O slug precisa ser minúsculo, com hífens, até 60 letras. Ex.: follow-up-pos-proposta.");
      const where = String(area ?? "").trim();
      const areas = existsSync(WIKI) ? readdirSync(WIKI, { withFileTypes: true }).filter((one) => one.isDirectory() && !HIDDEN.has(one.name)).map((one) => one.name) : [];
      if (!areas.includes(where)) throw new Error(`A área “${where}” não existe. Use uma destas: ${areas.join(", ")}.`);
      const body = String(conteudo ?? "").trim();
      if (!body || body.length > 100_000) throw new Error("O conteúdo precisa ter texto e no máximo 100 mil caracteres.");
      const dir = join(SKILLS, name);
      const file = join(dir, "SKILL.md");
      const exists = existsSync(file);
      if (exists && !editar) throw new Error(`Já existe a skill “${name}”. Leia com ler_skill e mande editar: true para reescrever, ou escolha outro slug.`);
      if (!exists && editar) throw new Error(`Não existe a skill “${name}” para editar. Use listar_skills.`);
      if (!exists && !nova_mesmo_assim) {
        const close = similarSkills(String(nome ?? ""), String(descricao ?? "")).filter((one) => one.semelhanca >= 0.25);
        if (close.length) return { salva: false, parecidas: close, aviso: "Há skills parecidas. Se uma servir, edite essa (editar: true). Se for mesmo outra coisa, repita com nova_mesmo_assim: true." };
      }
      if (exists) {
        const backup = join(BRAIN, ".openbot", "skills-anteriores");
        mkdirSync(backup, { recursive: true });
        writeFileSync(join(backup, `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`), read(file));
      }
      const old = exists ? frontmatter(read(file)) : {};
      const one = (text) => JSON.stringify(String(text ?? "").replace(/\s+/g, " ").trim());
      const meta = [`name: ${name}`, `label: ${one(nome)}`, `area: ${where}`, `description: ${one(descricao)}`];
      if (old.schedule) meta.push(`schedule: ${old.schedule}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, "---\n" + meta.join("\n") + "\n---\n\n" + body + "\n");
      const who = String(agente ?? "").trim().slice(0, 80);
      return { salva: true, arquivo: rel(file), editada: exists, aviso: `${exists ? "Skill atualizada" : "Skill criada"} na área ${where}${who ? " por " + who : ""}. O Founders OS já mostra no mapa.` };
    },
  },
  {
    name: "salvar_nota",
    description:
      "Salva uma nota na caixa de notas do cérebro (fontes/notas/), por exemplo o resumo de uma call, uma decisão ou algo que o wiki precisa aprender. A nota NÃO muda o wiki: a pessoa revisa e processa no Founders OS. Diga o seu nome de agente em `agente`.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto da nota." },
        texto: { type: "string", description: "O conteúdo, em Markdown." },
        agente: { type: "string", description: "O seu nome de agente." },
      },
      required: ["titulo", "texto"],
      additionalProperties: false,
    },
    run({ titulo, texto, agente }) {
      const title = String(titulo ?? "").trim().slice(0, 160);
      const body = String(texto ?? "").trim();
      if (!title || !body) throw new Error("A nota precisa de `titulo` e `texto`.");
      if (body.length > 200_000) throw new Error("A nota passou de 200 mil caracteres.");
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const id = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const slug = plain(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
      mkdirSync(NOTES, { recursive: true });
      let name = id + (slug ? "-" + slug : "") + ".md";
      // Duas notas no mesmo segundo: a segunda espera o nome livre.
      for (let n = 2; existsSync(join(NOTES, name)); n++) name = `${id}-${slug || "nota"}-${n}.md`;
      const who = String(agente ?? "").trim().slice(0, 80);
      const meta = [
        `origem: nota ${who ? "do agente " + who : "de um agente"}, pelo conector Segundo Cérebro`,
        "criada: " + now.toISOString(),
        "status: caixa",
        "titulo: " + JSON.stringify(title),
      ];
      writeFileSync(join(NOTES, name), "---\n" + meta.join("\n") + "\n---\n\n" + body + "\n");
      return { salva: `fontes/notas/${name}`, aviso: "A nota está na caixa do Founders OS, esperando revisão. O wiki não mudou." };
    },
  },
];

// O Founders OS lê este registro para saber que o conector está ligado e em uso.
function mark(event, extra = {}) {
  try {
    const dir = join(BRAIN, ".openbot");
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
    const file = join(dir, "conector.json");
    let state = {};
    try {
      state = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* primeiro uso */
    }
    state = { ...state, versao: VERSION, [event]: new Date().toISOString(), ...extra };
    writeFileSync(file, JSON.stringify(state, null, 2));
  } catch {
    /* sem registro, o conector continua funcionando */
  }
}

// ── O protocolo MCP (JSON-RPC 2.0, uma mensagem por linha) ─────────────────────

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  if (method === "initialize") {
    mark("conectado_em", { cliente: params?.clientInfo?.name ?? null });
    return reply(id, {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "segundo-cerebro", version: VERSION },
      instructions:
        "Acesso ao segundo cérebro da empresa. Comece por visao_geral, procure com buscar e leia com ler_pagina. Fique nas áreas do seu papel, salvo se pedirem outra. Para registrar algo, use salvar_nota: o wiki só muda com a aprovação da pessoa. Para guardar um jeito de fazer que vai se repetir, rode procurar_skill_parecida e depois salvar_skill na área do seu papel; edite a parecida em vez de duplicar.",
    });
  }
  if (method === "ping") return isRequest && reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS.map(({ run, ...tool }) => tool) });
  if (method === "tools/call") {
    const tool = TOOLS.find((one) => one.name === params?.name);
    if (!tool) return fail(id, -32602, `Ferramenta desconhecida: ${params?.name}`);
    try {
      const result = tool.run(params?.arguments ?? {});
      mark("ultimo_uso", { ultima_ferramenta: tool.name });
      return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (error) {
      return reply(id, { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true });
    }
  }
  if (isRequest) fail(id, -32601, `Método não suportado: ${method}`);
}

if (!existsSync(WIKI) && !existsSync(SKILLS)) {
  process.stderr.write(`segundo-cerebro: não achei um cérebro em ${BRAIN} (falta wiki/ ou .claude/skills/). Use --cerebro <pasta>.\n`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return fail(null, -32700, "JSON inválido");
  }
  for (const one of Array.isArray(message) ? message : [message]) handle(one);
});
