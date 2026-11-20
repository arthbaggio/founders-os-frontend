// O núcleo do "levar para o OpenBot", sem dependências: Node 18+ e nada mais.
// Usado pelas duas portas: o botão "Levar" do Founders OS (o servidor do app importa
// este arquivo) e a skill /levar-para-openbot, que roda no Claude Code.
//
// Ele faz três coisas:
//   1. diz ao Claude como desenhar o time a partir do cérebro (`instrucoes`);
//   2. confere o plano que o Claude escreveu e monta o prompt de cada agente;
//   3. gera o .zip no formato de importação oficial do OpenBot ("openbot-agent-import",
//      versão 1, o mesmo de resources/agent-import/grok-bot/SKILL.md no repositório
//      dele), mostra o arquivo e abre o OpenBot.
//
// A importação em si é no OpenBot (Server settings › Import): a API local dele não
// cria agentes, e o link openbot:// só serve para convites.
//
// Linha de comando:
//   node openbot-import.mjs instrucoes
//   node openbot-import.mjs montar --cerebro <pasta> --plano <arquivo> [--saida <pasta>] [--sem-abrir]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

// Esta skill não vai para o OpenBot, mesmo se estiver dentro do cérebro.
const SELF = "levar-para-openbot";

// Os limites do importador do OpenBot (agent-import-manifest.ts e input-limits.ts).
const NAME_MAX = 80;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const MEMORY_MAX = 500;
const SKILLS_MAX = 32;

const cut = (text, max) => (text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text);
const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const str = (value) => (typeof value === "string" ? value.trim() : "");
const list = (value) => (Array.isArray(value) ? value.filter((one) => typeof one === "string" && one.trim()).map((one) => one.trim()) : []);

// ── 1. Como desenhar o time ────────────────────────────────────────────────────

// Um agente para cada área do mapa, com o nome da área. Compartilhado não ganha
// agente: fica com a Empresa, o centro. O Claude não decide a divisão, só escreve
// a missão, os gatilhos, os limites e as instruções de trabalho de cada um.
const NAMES = { empresa: "Empresa", produtos: "Produtos", clientes: "Clientes", vendas: "Vendas", marketing: "Marketing", operacoes: "Operações", financas: "Finanças", administrativo: "Administrativo" };
const MERGED_INTO_EMPRESA = new Set(["compartilhado"]);

const titleOf = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").match(/^#\s+(.+?)\s*#*\s*$/m)?.[1].trim() ?? "";

// As áreas do mapa que ganham agente: [{ pasta, nome, titulo, owns }].
export function departmentsOf(brain) {
  const wiki = join(brain, "wiki");
  const folders = existsSync(wiki)
    ? readdirSync(wiki, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
    : [];
  if (!folders.includes("empresa")) folders.unshift("empresa");
  const titled = (pasta) => titleOf(read(join(wiki, pasta, "index.md")));
  const fallbackName = (pasta) => {
    const title = titled(pasta) || pasta.replace(/-/g, " ");
    return title.charAt(0).toUpperCase() + title.slice(1);
  };
  // A Empresa (o centro e o coordenador) primeiro, depois a ordem do mapa.
  const order = ["empresa", "vendas", "marketing", "clientes", "produtos", "operacoes", "financas", "administrativo"];
  const rank = (pasta) => (order.includes(pasta) ? order.indexOf(pasta) : order.length);
  return [...folders]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .filter((pasta) => !MERGED_INTO_EMPRESA.has(pasta))
    .map((pasta) => ({
      pasta,
      nome: NAMES[pasta] ?? fallbackName(pasta),
      titulo: titled(pasta),
      owns: pasta === "empresa" ? ["empresa", ...folders.filter((one) => MERGED_INTO_EMPRESA.has(one))] : [pasta],
    }));
}

export function designInstructions(brain) {
  const depts = departmentsOf(brain);
  const lines = depts.map((d) => `- "${d.nome}": dono de ${d.owns.map((one) => "wiki/" + one + "/").join(" e ")}${d.titulo && d.titulo !== d.nome ? ` (no mapa: "${d.titulo}")` : ""}`);
  return `Você vai escrever o time de agentes de IA desta empresa, a partir do segundo cérebro dela (a pasta onde você está).

O time é FIXO: um agente para cada área do mapa do cérebro, com o nome da área. Use exatamente estes agentes e nomes:
${lines.join("\n")}
O agente "Empresa" também coordena os outros: sabe o que cada área faz e passa o pedido para o agente certo.

1. Leia o CLAUDE.md e o AGENTS.md (se existir), o wiki/empresa/ e o index.md de cada área em wiki/. Abra as páginas que explicam como a empresa vende, entrega, cobra e se comunica.
2. Leia cada .claude/skills/<slug>/SKILL.md. As skills de uma área (o area: do frontmatter) são do agente daquela área; o app faz essa ligação, você não precisa listar.
3. Para cada agente, escreva: missão em uma frase (o que essa área entrega para a empresa), por que ele existe nesta empresa (cite o que você leu), quando acioná-lo (exemplos de pedidos reais), o que ele NÃO pode fazer sozinho, e que ferramentas externas ele precisaria (ex.: Gmail, Notion, CRM), só se o cérebro indicar.
4. Escreva em "guidance" as instruções de trabalho específicas dele, em português, curtas (3 a 8 linhas, uma por linha, com "- "): tom, critérios, passos que a empresa usa, o que conferir antes de responder.
5. Liste em "gaps" o que falta no cérebro para os agentes trabalharem bem.

Não grave nada no cérebro. Responda SÓ com um bloco \`\`\`json neste formato (um item por agente da lista, com o name exato):
{"summary": "como a empresa funciona, em 2 a 3 frases", "gaps": ["..."], "agents": [{"name": "Vendas", "mission": "...", "why": "...", "triggers": ["..."], "limits": ["..."], "tools": ["..."], "guidance": "- ...\\n- ..."}]}`;
}

// ── 2. O que o cérebro tem ─────────────────────────────────────────────────────

const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (at) out[at[1].toLowerCase()] = at[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

// A primeira frase do corpo do SKILL.md, sem o frontmatter nem títulos.
function firstLine(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("|")) continue;
    const clean = line.replace(/^[-*>\s]+/, "").replace(/[*_`]/g, "");
    return cut(clean, 150);
  }
  return "";
}

// As skills e rotinas do cérebro (.claude/skills/<slug>/SKILL.md).
export function readSkills(brain) {
  const dir = join(brain, ".claude", "skills");
  let slugs = [];
  try {
    slugs = readdirSync(dir).filter((name) => !name.startsWith(".") && name !== SELF && existsSync(join(dir, name, "SKILL.md")));
  } catch {
    return [];
  }
  return slugs.sort().map((slug) => {
    const text = read(join(dir, slug, "SKILL.md"));
    const meta = frontmatter(text);
    return {
      slug,
      label: meta.label || meta.title || meta.name || slug,
      area: meta.area || "",
      schedule: meta.schedule || "",
      paused: /^(sim|true)$/i.test(meta.pausada || ""),
      description: meta.description || firstLine(text) || meta.label || slug,
    };
  });
}

// "Todo dia, 19h" / "Sextas, 16h" / "Dia 1º, 8h" (o mesmo leitor do Founders OS).
export function readSchedule(text) {
  const lower = text.toLowerCase();
  const at = lower.match(/(\d{1,2})\s*h/);
  if (!at) return null;
  const hour = Number(at[1]);
  if (hour > 23) return null;
  const time = String(hour).padStart(2, "0") + ":00";
  if (lower.includes("todo dia")) return { kind: "daily", time };
  const date = lower.match(/dia\s+(\d{1,2})/);
  if (date) return { kind: "monthly", day: Math.min(31, Math.max(1, Number(date[1]))), time };
  const days = [["domingo", 0], ["segunda", 1], ["terça", 2], ["terca", 2], ["quarta", 3], ["quinta", 4], ["sexta", 5], ["sábado", 6], ["sabado", 6]];
  for (const [name, day] of days) if (lower.includes(name)) return { kind: "weekly", weekday: day, time };
  return { kind: "daily", time };
}

// ── 3. O plano e o prompt de cada agente ───────────────────────────────────────

// O prompt é montado aqui, não pelo Claude: o caminho do cérebro, as skills e as regras saem sempre certos.
export function composePrompt(brain, agent, skills) {
  const desc = (slug) => skills.find((one) => one.slug === slug)?.description ?? "";
  const lines = [`Você é o agente "${agent.name}" da minha empresa.`, `Missão: ${agent.mission}`, ""];
  lines.push("## Seu workspace");
  lines.push(`Minha pasta de segundo cérebro é: ${brain}`);
  lines.push("Antes de responder, leia `CLAUDE.md`, `AGENTS.md` (se existir) e `wiki/empresa/`.");
  if (agent.owns?.length) lines.push("Você é o dono destes departamentos do cérebro: " + agent.owns.map((one) => "`wiki/" + one + "/`").join(", ") + ". Responda por eles.");
  if (agent.areas.length) lines.push("Suas pastas principais: " + agent.areas.map((one) => "`" + one + "`").join(", ") + ".");
  lines.push("");
  if (agent.skills.length) {
    lines.push("## Skills que você usa");
    for (const slug of agent.skills) lines.push(`- \`${slug}\`` + (desc(slug) && desc(slug) !== slug ? ": " + desc(slug) : ""));
    lines.push("");
  }
  if (agent.routines.length) {
    lines.push("## Rotinas sob sua responsabilidade");
    for (const one of agent.routines) lines.push(`- \`${one.slug}\`` + (one.schedule ? ", " + one.schedule : ""));
    lines.push("");
  }
  if (agent.triggers.length) {
    lines.push("## Quando te chamam");
    for (const one of agent.triggers) lines.push("- " + one);
    lines.push("");
  }
  if (agent.guidance) {
    lines.push("## Como trabalhar nesta empresa");
    lines.push(agent.guidance);
    lines.push("");
  }
  lines.push("## Regras");
  lines.push("- Respostas curtas e diretas, em português.");
  lines.push("- Antes de afirmar algo sobre a empresa, confira no cérebro. Se não estiver lá, diga que não sabe.");
  lines.push("- Não edite `wiki/` sem eu aprovar a proposta. Você pode escrever em `fontes/notas/`.");
  lines.push("- Skill nova: quando um jeito de fazer for se repetir, guarde como skill no cérebro. Antes, rode `procurar_skill_parecida`; se houver uma parecida, edite essa (`salvar_skill` com `editar: true`) em vez de criar outra. Salve na área do seu papel" + (agent.owns?.length ? " (`" + agent.owns[0] + "`)" : "") + ", com `salvar_skill`.");
  for (const one of agent.limits) lines.push("- " + one);
  lines.push("- Em dúvida, pergunte antes de agir.");
  return lines.join("\n");
}

// Tira o JSON de um texto (a resposta do Claude ou o arquivo do plano).
export function extractJson(text) {
  const block = text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

// Monta o time: um agente por área do mapa (departmentsOf), com o nome da área.
// Do Claude vêm só os textos (missão, gatilhos, limites, instruções). As skills e
// rotinas de cada agente são as da área dele, pelo area: do SKILL.md.
export function normalizePlan(brain, raw) {
  if (!raw || typeof raw !== "object") return null;
  const skills = readSkills(brain);
  const depts = departmentsOf(brain);
  const items = Array.isArray(raw.agents) ? raw.agents : [];
  const findText = (dept) =>
    items.find((item) => plain(str(item?.name)) === plain(dept.nome)) ??
    items.find((item) => list(item?.owns).some((one) => one.replace(/^wiki\//, "").replace(/\/$/, "") === dept.pasta)) ??
    null;
  const notes = [];
  const bases = depts.map((dept) => {
    const item = findText(dept);
    if (!item) notes.push(`O desenho não trouxe texto para o agente ${dept.nome}: ele ficou só com as skills e as pastas da área.`);
    const mine = skills.filter((one) => dept.owns.includes(one.area || "empresa"));
    return {
      name: dept.nome,
      mission: str(item?.mission) || `Cuidar da área ${dept.titulo || dept.nome} do cérebro da empresa.`,
      why: str(item?.why),
      areas: [...dept.owns.map((one) => `wiki/${one}/`), ...(dept.pasta === "empresa" ? [] : ["wiki/empresa/"])],
      skills: mine.filter((one) => !one.schedule).map((one) => one.slug),
      routines: mine.filter((one) => one.schedule).map((one) => ({ slug: one.slug, schedule: one.schedule })),
      triggers: list(item?.triggers),
      limits: list(item?.limits),
      tools: list(item?.tools),
      guidance: str(item?.guidance),
      owns: dept.owns,
    };
  });
  // Uma skill com area: que não é de nenhuma área do mapa vai para a Empresa.
  const placed = new Set(bases.flatMap((one) => [...one.skills, ...one.routines.map((r) => r.slug)]));
  const empresa = bases.find((one) => one.owns.includes("empresa")) ?? bases[0];
  for (const skill of skills.filter((one) => !placed.has(one.slug))) {
    if (skill.schedule) empresa.routines.push({ slug: skill.slug, schedule: skill.schedule });
    else empresa.skills.push(skill.slug);
  }
  if (!bases.length) return null;
  const agents = bases.map((base) => ({ ...base, prompt: composePrompt(brain, base, skills) }));
  return { createdAt: str(raw.createdAt) || new Date().toISOString(), summary: str(raw.summary), gaps: [...list(raw.gaps), ...notes], agents };
}
// ── 4. O zip do importador ─────────────────────────────────────────────────────

// A chave do agente: minúsculas, dígitos e hífen, até 64 caracteres, sem hífen nas pontas.
export function keyOf(name, taken) {
  const base = plain(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56).replace(/-+$/, "") || "agente";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = base + "-" + n;
  taken.add(key);
  return key;
}

// O que nunca entra no zip: segredos e arquivos compactados (o importador recusa o zip inteiro).
const BLOCKED = /^\.env|private.*key|\.(zip|tar|gz|tgz|7z|rar)$/i;
const SKIP_DIRS = new Set([".git", "node_modules", ".openbot", ".obsidian", ".trash", "dist", "build", ".cache"]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(join(dir, entry.name)));
    } else if (entry.isFile() && !BLOCKED.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

// O importador exige `name` e `description` no SKILL.md. A cópia ganha o que faltar;
// o arquivo do cérebro não muda.
function skillMarkdown(text, slug, description) {
  const meta = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = "description: " + JSON.stringify(cut(description || slug, 900));
  if (!meta) return `---\nname: ${slug}\n${line}\n---\n\n${text}`;
  let head = meta[1];
  if (!/^name\s*:/m.test(head)) head = `name: ${slug}\n` + head;
  if (!/^description\s*:/m.test(head)) head += "\n" + line;
  return text.replace(meta[0], `---\n${head}\n---`);
}

function agentFiles(brain, agent, key, made) {
  const root = `agents/${key}/files`;
  const files = [];
  // A cópia do cérebro: o que o agente lê. Uma página dentro de uma pasta já copiada entra uma vez só.
  const seen = new Set();
  const sources = new Set(["AGENTS.md", "CLAUDE.md", "wiki/empresa", ...agent.areas.map((one) => one.replace(/\/$/, ""))]);
  for (const source of sources) {
    const full = resolve(brain, source);
    if (!full.startsWith(brain) || !existsSync(full)) continue;
    for (const file of statSync(full).isDirectory() ? walk(full) : [full]) {
      const rel = relative(brain, file).split(sep).join("/");
      if (seen.has(rel)) continue;
      seen.add(rel);
      files.push({ path: `${root}/cerebro/${rel}`, data: readFileSync(file) });
    }
  }
  const instructions = [
    agent.prompt,
    "",
    "## Onde está o cérebro",
    `O cérebro ao vivo está em: ${brain}. Leia de lá.`,
    `Se você não tiver acesso a essa pasta, use a cópia em \`imported/cerebro/\` (de ${made}) e avise que ela pode estar desatualizada.`,
    "As skills deste agente já estão instaladas no OpenBot, com o mesmo nome do cérebro.",
  ].join("\n");
  files.push({ path: `${root}/INSTRUCTIONS.md`, data: Buffer.from(instructions) });
  return files;
}

function description(brain, agent) {
  const full = agent.prompt + `\n\nO cérebro ao vivo está em: ${brain}. Sem acesso a ele, use a cópia em imported/cerebro/.`;
  if (full.length <= DESCRIPTION_MAX) return full;
  return cut(
    [
      `Você é o agente "${agent.name}" da empresa. Missão: ${agent.mission}`,
      "Antes de qualquer tarefa, leia `imported/INSTRUCTIONS.md`: são as suas instruções completas.",
      `O cérebro da empresa está em: ${brain} (cópia em imported/cerebro/).`,
      "Respostas curtas, em português. Não edite wiki/ sem aprovação. Em dúvida, pergunte.",
    ].join("\n"),
    DESCRIPTION_MAX,
  );
}

// O coordenador do grupo: quem cuida da empresa como um todo, ou quem tem mais rotinas.
function leadOf(agents) {
  const general = agents.find((one) => /gest|geral|empresa|ceo|diret|chief|coorden/.test(plain(one.name)));
  if (general) return general;
  return [...agents].sort((a, b) => b.routines.length - a.routines.length)[0] ?? null;
}

export function buildArchive(brain, plan) {
  brain = resolve(brain);
  const skillInfo = readSkills(brain);
  const made = new Date().toISOString().slice(0, 10);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  const taken = new Set();
  const entries = [];
  const manifestAgents = [];
  const keys = new Map();
  const warnings = [];
  let skills = 0;
  let routines = 0;

  const memories = [`O segundo cérebro da empresa está em ${brain}.`, ...plan.summary.split(/(?<=[.!?])\s+/).filter(Boolean)].map((one) =>
    cut(one, MEMORY_MAX),
  );

  for (const agent of plan.agents) {
    const key = keyOf(agent.name, taken);
    keys.set(agent.name, key);
    const skillPaths = [];
    // A rotina também vai como skill: é o passo a passo que ela segue.
    const slugs = [...agent.skills, ...agent.routines.map((one) => one.slug)];
    if (slugs.length > SKILLS_MAX) warnings.push(`${agent.name}: só as primeiras ${SKILLS_MAX} skills entraram.`);
    for (const slug of slugs.slice(0, SKILLS_MAX)) {
      const dir = join(brain, ".claude", "skills", slug);
      if (!existsSync(join(dir, "SKILL.md"))) continue;
      const base = `agents/${key}/skills/${slug}`;
      const desc = skillInfo.find((one) => one.slug === slug)?.description ?? slug;
      for (const file of walk(dir)) {
        const rel = relative(dir, file).split(sep).join("/");
        const data = rel === "SKILL.md" ? Buffer.from(skillMarkdown(readFileSync(file, "utf8"), slug, desc)) : readFileSync(file);
        entries.push({ path: `${base}/${rel}`, data });
      }
      skillPaths.push(base);
      skills++;
    }
    const agentRoutines = [];
    for (const one of agent.routines) {
      const schedule = readSchedule(one.schedule);
      if (!schedule) {
        warnings.push(`${agent.name}: a rotina ${one.slug} ficou de fora, porque não entendi o horário “${one.schedule}”. Use o formato “Todo dia, 8h”, “Sextas, 16h” ou “Dia 1º, 8h”.`);
        continue;
      }
      routines++;
      agentRoutines.push({
        name: cut(skillInfo.find((s) => s.slug === one.slug)?.label || one.slug, NAME_MAX),
        instruction: `Rode a skill \`${one.slug}\` e siga o passo a passo dela. No fim, diga em poucas linhas o que fez.`,
        active: !skillInfo.find((s) => s.slug === one.slug)?.paused,
        timezone,
        schedule,
      });
    }
    entries.push(...agentFiles(brain, agent, key, made));
    manifestAgents.push({
      key,
      name: cut(agent.name, NAME_MAX),
      title: cut(agent.mission || agent.name, TITLE_MAX),
      description: description(brain, agent),
      avatar: null,
      skills: skillPaths,
      routines: agentRoutines,
      memories: memories.slice(0, 64),
      files: `agents/${key}/files`,
    });
  }

  const lead = leadOf(plan.agents);
  const channels =
    plan.agents.length > 1
      ? [
          {
            key: "time",
            name: "Time da empresa",
            title: "Todos os agentes do segundo cérebro",
            instructions: cut(
              "Cada agente cuida da sua missão. Quando um pedido for de outro, passe para ele e devolva a resposta. " +
                (lead ? `${lead.name} coordena: divide o trabalho e junta as respostas. ` : "") +
                `O cérebro da empresa está em ${brain}.`,
              DESCRIPTION_MAX,
            ),
            members: [...keys.values()],
            lead: lead ? (keys.get(lead.name) ?? null) : null,
            routines: [],
            memories: memories.slice(0, 32),
          },
        ]
      : [];

  const manifest = {
    format: "openbot-agent-import",
    version: 1,
    source: { app: "founders-os", exportedAt: new Date().toISOString() },
    agents: manifestAgents,
    channels,
  };
  entries.unshift({ path: "openbot-import.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  return { entries, agents: manifestAgents.length, skills, routines, warnings };
}

// Um zip simples (deflate, nomes em UTF-8).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (data) => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const packed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(entry.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += 30 + name.length + packed.length;
  }
  const size = central.reduce((sum, one) => sum + one.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// Grava na pasta pedida ou em Downloads, trocando o arquivo de uma vez, como pede o OpenBot.
export function writeArchive(data, out) {
  const downloads = join(homedir(), "Downloads");
  const dir = out ? resolve(out) : existsSync(downloads) ? downloads : process.cwd();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `openbot-founders-os-${new Date().toISOString().slice(0, 10)}.zip`);
  const part = join(dir, "." + basename(file) + ".part");
  writeFileSync(part, data);
  renameSync(part, file);
  return file;
}

// Mostra o zip na pasta e abre o OpenBot, para a pessoa só escolher o arquivo no importador.
export function revealAndOpen(file) {
  const run = (cmd, args) => {
    try {
      spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    } catch {
      /* sem a pasta ou o app, a pessoa abre na mão */
    }
  };
  if (process.platform === "win32") {
    run("explorer", ["/select,", file]);
    const exe = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Programs", "OpenBot", "OpenBot.exe");
    if (existsSync(exe)) run(exe, []);
  } else if (process.platform === "darwin") {
    run("open", ["-R", file]);
    run("open", ["-a", "OpenBot"]);
  } else {
    run("xdg-open", [join(file, "..")]);
  }
}

// O caminho inteiro: plano conferido → zip → arquivo → OpenBot aberto.
export function exportPlan(brain, plan, options = {}) {
  const archive = buildArchive(brain, plan);
  const file = writeArchive(zip(archive.entries), options.out);
  if (options.open !== false) revealAndOpen(file);
  return { file, at: new Date().toISOString(), agents: archive.agents, skills: archive.skills, routines: archive.routines, warnings: archive.warnings };
}

// ── Linha de comando (a skill do Claude Code usa esta parte) ───────────────────

function arg(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

function main(argv) {
  const [command] = argv;
  if (command === "instrucoes") {
    process.stdout.write(designInstructions(resolve(arg(argv, "--cerebro") ?? process.cwd())) + "\n");
    return 0;
  }
  if (command === "montar") {
    const brain = resolve(arg(argv, "--cerebro") ?? process.cwd());
    const planFile = arg(argv, "--plano");
    if (!planFile || !existsSync(planFile)) {
      console.error("Passe o plano com --plano <arquivo.json>.");
      return 2;
    }
    if (!existsSync(join(brain, "wiki")) && !existsSync(join(brain, ".claude", "skills"))) {
      console.error(`Não achei um segundo cérebro em ${brain} (falta wiki/ ou .claude/skills/).`);
      return 2;
    }
    const plan = normalizePlan(brain, extractJson(readFileSync(planFile, "utf8")));
    if (!plan) {
      console.error("O plano não tem nenhum agente válido. Confira o formato em `instrucoes`.");
      return 1;
    }
    const out = exportPlan(brain, plan, { out: arg(argv, "--saida"), open: !argv.includes("--sem-abrir") });
    process.stdout.write(JSON.stringify({ ...out, nomes: plan.agents.map((one) => one.name) }, null, 2) + "\n");
    return 0;
  }
  console.error("Uso:\n  node openbot-import.mjs instrucoes\n  node openbot-import.mjs montar --cerebro <pasta> --plano <arquivo> [--saida <pasta>] [--sem-abrir]");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
