// "Criar meu segundo cérebro": para quem abre o Founders OS sem cérebro. Segue o
// método do os-builder: entrevista → proposta (nada é gravado) → a pessoa aprova
// ou pede ajuste → só então o Claude cria os arquivos. Nunca inventa: o que a
// pessoa não disse fica marcado como pendente.
//
// Duas sessões do Claude Code, na pasta do cérebro:
// - a proposta só lê (e não há o que ler: a pasta está vazia);
// - a criação escreve, e só dentro da pasta do cérebro (acceptEdits na cwd).
// O rascunho (respostas e proposta) fica em sessoes/cerebro/criacao.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanEnv } from "./runs";

export type Answers = Record<string, string>;
export type Proposal = {
  nome: string;
  resumo: string;
  areas: { pasta: string; nome: string; oQue: string; paginas: { arquivo: string; titulo: string; conteudo: string }[] }[];
  skills: { slug: string; label: string; area: string; oQueFaz: string; horario: string | null }[];
  fontes: { dominio: string; ferramenta: string }[];
  naoCriar: string[];
  testes: string[];
  pendencias: string[];
};
export type BuildState = {
  phase: "idle" | "propondo" | "proposta" | "criando" | "pronto" | "falhou";
  step: string;
  answers: Answers;
  proposal: Proposal | null;
  error: string;
  created: { pages: number; skills: number } | null;
};

// As perguntas da entrevista: as mesmas no front e no prompt.
export const QUESTIONS: { key: string; label: string }[] = [
  { key: "nome", label: "Como se chama a empresa" },
  { key: "vende", label: "O que a empresa vende e para quem" },
  { key: "areas", label: "Quais áreas existem de fato hoje" },
  { key: "time", label: "Quem é o time e o que cada um faz" },
  { key: "prioridades", label: "As 1 a 3 prioridades de agora" },
  { key: "processos", label: "O que se repete toda semana ou todo mês" },
  { key: "esquece", label: "O que se refaz do zero ou se esquece de acompanhar" },
  { key: "ferramentas", label: "As ferramentas e onde vive cada informação" },
  { key: "fora", label: "O que NÃO deve entrar no cérebro" },
  { key: "testes", label: "Três perguntas que o cérebro precisa responder em segundos" },
  { key: "material", label: "Material colado pela pessoa (site, apresentação, anotações)" },
];

const LIMIT = 20 * 60 * 1000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const interview = (answers: Answers) =>
  QUESTIONS.filter((q) => answers[q.key]?.trim())
    .map((q) => `### ${q.label}\n${answers[q.key].trim().slice(0, 20_000)}`)
    .join("\n\n");

const RULES = `Regras que valem sempre:
- Nunca invente. Nome, número, preço, cliente, ferramenta ou processo que a pessoa não disse não entra. O que falta vira uma pendência explícita ("Pendente: …").
- As pastas das áreas usam os departamentos do Founders OS, que o mapa conhece (cor e ícone próprios): empresa, produtos, clientes, vendas, marketing, operacoes, financas, administrativo, compartilhado. Encaixe o que a pessoa contou neles: conteúdo e marketing vai em "marketing"; projetos e entregas para clientes em "clientes"; programas, cursos e ofertas em "produtos"; automações, sistemas e processos internos em "operacoes"; cobrança e caixa em "financas"; modelos e materiais de uso comum em "compartilhado". O nome que a pessoa usa vai no título da área (o "# Nome" do index.md), não na pasta. Crie outra pasta só se nada disso servir: minúsculas, sem acento, com hífen. A área "empresa" sempre existe: é o centro (visão geral, oferta, prioridades, time).
- Só crie uma área se houver conteúdo ou trabalho real para ela. Comece pequeno.
- Uma skill é um trabalho que se repete e tem passo a passo. Uma rotina é uma skill com horário, escrito do jeito do Founders OS: "Todo dia, 8h", "Segundas, 9h", "Sextas, 16h" ou "Dia 1º, 8h".`;

const PROPOSE = (answers: Answers) => `Você vai desenhar o segundo cérebro de uma empresa, a partir da entrevista abaixo. Ainda NÃO crie nenhum arquivo.

${RULES}

## Entrevista
${interview(answers)}

Responda SÓ com um bloco \`\`\`json neste formato:
{"nome": "nome da empresa", "resumo": "como a empresa funciona, em 2 a 3 frases", "areas": [{"pasta": "vendas", "nome": "Vendas", "oQue": "o que vive nesta área, em uma frase", "paginas": [{"arquivo": "pipeline.md", "titulo": "Pipeline", "conteudo": "o que esta página vai ter, só com o que a pessoa disse"}]}], "skills": [{"slug": "revisao-do-pipeline", "label": "Revisão do pipeline", "area": "vendas", "oQueFaz": "o passo a passo em uma frase", "horario": "Sextas, 16h ou null"}], "fontes": [{"dominio": "Pipeline de vendas", "ferramenta": "o CRM que a pessoa citou"}], "naoCriar": ["o que você decidiu não criar e por quê"], "testes": ["as três perguntas que o cérebro deve responder"], "pendencias": ["o que falta a pessoa contar"]}`;

const ADJUST = (text: string) => `Ajuste a proposta: ${text}\n\nAinda não crie nada. Responda com a proposta inteira, revisada, no mesmo formato json.`;

const BUILD = (answers: Answers, proposal: Proposal) => `Crie agora o segundo cérebro desta empresa, nesta pasta (a pasta atual), EXATAMENTE como na proposta aprovada abaixo. Escreva só dentro desta pasta.

${RULES}

## Proposta aprovada
\`\`\`json
${JSON.stringify(proposal, null, 2)}
\`\`\`

## Entrevista (a fonte de todo o conteúdo)
${interview(answers)}

## O que criar
1. \`AGENTS.md\`: o mapa do cérebro, menos de 200 linhas. Nele, as skills moram em \`.claude/skills/<slug>/SKILL.md\` (a pasta skills-novas/ é só de passagem: não a cite). Quem é a empresa (2 linhas), uma tabela de rotas (pasta · o que tem · quando usar · onde salvar coisa nova), as fontes da verdade (ferramenta → domínio), o que não entra no cérebro, os três testes, e o "Fluxo para registrar conhecimento": uma nota nova vai para fontes/notas/; para ir ao wiki/, propor a mudança, a pessoa aprova, gravar a página, atualizar o index.md da área e registrar em wiki/log.md. NÃO crie CLAUDE.md.
2. \`wiki/<pasta>/index.md\` de cada área: "# Nome da área", uma frase do que vive ali e a lista de links para as páginas dela.
3. Cada página da proposta, em \`wiki/<pasta>/<arquivo>\`: "# Título" e o conteúdo, só com o que a pessoa disse. O que faltar, numa seção "## Pendente".
4. \`wiki/log.md\`: "# Log do wiki" e uma linha com a data de hoje: cérebro criado pelo Founders OS.
5. Cada skill em \`skills-novas/<slug>/SKILL.md\` (o Founders OS move para \`.claude/skills/\` depois; não escreva em \`.claude/\`), começando com este frontmatter:
---
name: <slug>
label: <nome legível>
area: <pasta da área>
description: <o que faz, em uma frase>
schedule: <só nas rotinas, o horário>
---
e depois "# <nome legível>" e o passo a passo numerado: o que ler no cérebro, o que fazer, onde salvar o resultado (uma nota em fontes/notas/ ou a página da área). Se faltar informação para um passo, escreva "Pendente: …".
6. A memória: \`memory/AGENTS.md\` (para que serve cada arquivo), \`memory/aprendizados.md\`, \`memory/to-dos.md\`, \`memory/prioridades.md\` (com as prioridades da entrevista) e \`memory/diario/.gitkeep\`.
7. \`fontes/notas/.gitkeep\`.

No fim, responda SÓ com um bloco \`\`\`json: {"paginas": <quantas páginas do wiki>, "skills": <quantas skills>, "pendencias": ["o que ficou pendente"]}`;

// ── Uma sessão do Claude Code: devolve a resposta final e mostra o passo atual ──

function runClaude(opts: { cwd: string; prompt: string; tools: string; write: boolean; resume: string | null; onStep: (step: string) => void }) {
  return new Promise<{ ok: boolean; result: string; session: string | null; error: string }>((done) => {
    const args = [
      "-p",
      opts.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-prompts",
      "none",
      "--strict-mcp-config",
      "--tools",
      opts.tools,
      "--permission-mode",
      opts.write ? "acceptEdits" : "dontAsk",
      ...(opts.resume ? ["--resume", opts.resume] : ["--name", "Founders OS · Criar o cérebro"]),
    ];
    const child = spawn(process.env.CLAUDE_BIN || "claude", args, { cwd: opts.cwd, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let rest = "";
    let errors = "";
    let session: string | null = opts.resume;
    let result = "";
    let ok = false;
    const timer = setTimeout(() => child.kill(), LIMIT);
    const describe = (tool: string, input: Record<string, unknown>) => {
      const file = typeof input.file_path === "string" ? input.file_path.replace(opts.cwd, "").replace(/^[\\/]/, "") : "";
      if (tool === "Write") return "Criando " + file;
      if (tool === "Edit") return "Ajustando " + file;
      if (tool === "Read") return "Lendo " + file;
      return "Usando " + tool;
    };
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "system" && event.subtype === "init") session = event.session_id ?? session;
        else if (event.type === "assistant" && Array.isArray(event.message?.content)) {
          for (const part of event.message.content) {
            if (part.type === "tool_use") opts.onStep(describe(part.name, part.input ?? {}));
            else if (part.type === "thinking") opts.onStep("Pensando");
            else if (part.type === "text" && part.text.trim()) opts.onStep("Escrevendo");
          }
        } else if (event.type === "result") {
          result = typeof event.result === "string" ? event.result : "";
          ok = !event.is_error && event.subtype === "success";
        }
      }
    });
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => (errors = (errors + chunk).slice(-1500)));
    child.on("error", (error: NodeJS.ErrnoException) =>
      done({ ok: false, result: "", session, error: error.code === "ENOENT" ? "Não achei o Claude Code (comando claude) neste computador." : String(error) }),
    );
    child.on("close", () => {
      clearTimeout(timer);
      done({ ok, result, session, error: ok ? "" : errors.trim().split("\n").pop() || "A sessão terminou com erro" });
    });
  });
}

const json = (text: string): any => {
  const block = text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
};
const str = (value: unknown, max = 4000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const strs = (value: unknown) => (Array.isArray(value) ? value.map((one) => str(one, 600)).filter(Boolean) : []);

// Confere a proposta: pastas e slugs válidos, a área "empresa" presente, skills em áreas que existem.
export function readProposal(raw: any): Proposal | null {
  if (!raw || typeof raw !== "object") return null;
  const areas: Proposal["areas"] = [];
  for (const one of Array.isArray(raw.areas) ? raw.areas.slice(0, 12) : []) {
    const pasta = str(one?.pasta, 40).toLowerCase();
    if (!SLUG.test(pasta) || areas.some((a) => a.pasta === pasta)) continue;
    const paginas = (Array.isArray(one.paginas) ? one.paginas.slice(0, 15) : [])
      .map((p: any) => ({ arquivo: str(p?.arquivo, 60).toLowerCase(), titulo: str(p?.titulo, 120), conteudo: str(p?.conteudo, 2000) }))
      .filter((p: { arquivo: string; titulo: string }) => /^[a-z0-9-]+\.md$/.test(p.arquivo) && p.arquivo !== "index.md" && p.titulo);
    areas.push({ pasta, nome: str(one.nome, 60) || pasta, oQue: str(one.oQue, 300), paginas });
  }
  if (!areas.some((a) => a.pasta === "empresa")) areas.unshift({ pasta: "empresa", nome: "Empresa", oQue: "Visão geral, oferta, prioridades e time.", paginas: [] });
  const pastas = new Set(areas.map((a) => a.pasta));
  const skills: Proposal["skills"] = [];
  for (const one of Array.isArray(raw.skills) ? raw.skills.slice(0, 20) : []) {
    const slug = str(one?.slug, 50).toLowerCase();
    if (!SLUG.test(slug) || skills.some((s) => s.slug === slug)) continue;
    const area = pastas.has(str(one.area, 40)) ? str(one.area, 40) : "empresa";
    const horario = str(one.horario, 40);
    skills.push({ slug, label: str(one.label, 80) || slug, area, oQueFaz: str(one.oQueFaz, 400), horario: horario && horario !== "null" ? horario : null });
  }
  return {
    nome: str(raw.nome, 120),
    resumo: str(raw.resumo, 1200),
    areas,
    skills,
    fontes: (Array.isArray(raw.fontes) ? raw.fontes.slice(0, 20) : [])
      .map((f: any) => ({ dominio: str(f?.dominio, 120), ferramenta: str(f?.ferramenta, 120) }))
      .filter((f: { dominio: string; ferramenta: string }) => f.dominio && f.ferramenta),
    naoCriar: strs(raw.naoCriar),
    testes: strs(raw.testes).slice(0, 5),
    pendencias: strs(raw.pendencias),
  };
}

// Quantas páginas (.md, fora os index.md e o log) há numa pasta.
function countPages(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countPages(join(dir, entry.name));
    else if (entry.name.endsWith(".md") && entry.name !== "index.md" && entry.name !== "log.md") count++;
  }
  return count;
}

// O cérebro está vazio? Sem página no wiki e sem skill.
export function brainIsEmpty(brain: string): boolean {
  const skills = existsSync(join(brain, ".claude", "skills")) ? readdirSync(join(brain, ".claude", "skills")).length : 0;
  return countPages(join(brain, "wiki")) === 0 && skills === 0;
}

// O Claude Code protege a pasta .claude/ (pede permissão, que aqui ninguém dá), então
// as skills são escritas em skills-novas/ e o app as move para .claude/skills/.
const STAGING = "skills-novas";
function moveSkills(brain: string): number {
  const from = join(brain, STAGING);
  const to = join(brain, ".claude", "skills");
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  let moved = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SLUG.test(entry.name) || !existsSync(join(from, entry.name, "SKILL.md")) || existsSync(join(to, entry.name))) continue;
    renameSync(join(from, entry.name), join(to, entry.name));
    moved++;
  }
  // Só some a pasta de preparo se ficou vazia (nada se perde).
  if (!readdirSync(from).length) rmdirSync(from);
  return moved;
}

export function builderStore(brain: string, results: string) {
  const file = join(results, "cerebro", "criacao.json");
  let session: string | null = null;
  let state: BuildState = { phase: "idle", step: "", answers: {}, proposal: null, error: "", created: null };
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    // O rascunho é de um cérebro: com outra pasta, começa do zero.
    if (saved.brain !== brain) throw new Error("outro cérebro");
    state = { ...state, answers: saved.answers ?? {}, proposal: saved.proposal ?? null, phase: saved.proposal ? "proposta" : "idle" };
    session = saved.session ?? null;
  } catch {
    /* começo */
  }
  const save = () => {
    mkdirSync(join(results, "cerebro"), { recursive: true });
    writeFileSync(file, JSON.stringify({ brain, answers: state.answers, proposal: state.proposal, session }, null, 2));
  };
  const busy = () => state.phase === "propondo" || state.phase === "criando";
  const step = (text: string) => (state.step = text);

  return {
    state: () => state,

    saveAnswers(answers: Answers) {
      if (busy()) return state;
      const clean: Answers = {};
      for (const q of QUESTIONS) if (typeof answers[q.key] === "string") clean[q.key] = answers[q.key].slice(0, 30_000);
      state = { ...state, answers: clean };
      save();
      return state;
    },

    // Monta (ou ajusta) a proposta. Nada é gravado no cérebro.
    async propose(adjust?: string) {
      if (busy()) return state;
      if (!state.answers.nome?.trim() || !state.answers.vende?.trim()) {
        state = { ...state, phase: "falhou", error: "Responda pelo menos o nome da empresa e o que ela vende." };
        return state;
      }
      mkdirSync(brain, { recursive: true });
      const resume = adjust && session ? session : null;
      state = { ...state, phase: "propondo", step: "Lendo a entrevista", error: "" };
      runClaude({ cwd: brain, prompt: resume ? ADJUST(adjust!) : PROPOSE(state.answers), tools: "Read", write: false, resume, onStep: step }).then((out) => {
        const proposal = out.ok ? readProposal(json(out.result)) : null;
        if (!proposal) {
          state = { ...state, phase: state.proposal ? "proposta" : "falhou", error: out.error || "A proposta não veio no formato certo. Tente de novo." };
          return;
        }
        session = out.session;
        state = { ...state, phase: "proposta", proposal, step: "", error: "" };
        save();
      });
      return state;
    },

    // Cria os arquivos. Só numa pasta de cérebro vazia, para nunca sobrescrever um cérebro existente.
    async build() {
      if (busy() || !state.proposal) return state;
      if (!brainIsEmpty(brain)) {
        state = { ...state, phase: "falhou", error: "Esta pasta já tem um cérebro. Nada foi alterado." };
        return state;
      }
      mkdirSync(brain, { recursive: true });
      const proposal = state.proposal;
      state = { ...state, phase: "criando", step: "Começando", error: "" };
      runClaude({ cwd: brain, prompt: BUILD(state.answers, proposal), tools: "Read,Glob,Grep,Write,Edit", write: true, resume: null, onStep: step }).then((out) => {
        const moved = moveSkills(brain);
        const created = !brainIsEmpty(brain);
        if (!created) {
          state = { ...state, phase: "falhou", error: out.error || "O Claude não criou os arquivos. Tente de novo." };
          return;
        }
        state = {
          ...state,
          phase: "pronto",
          step: "",
          created: { pages: countPages(join(brain, "wiki")), skills: moved },
          error: out.ok ? "" : "A sessão parou antes do fim: confira o que foi criado.",
        };
        save();
      });
      return state;
    },
  };
}
