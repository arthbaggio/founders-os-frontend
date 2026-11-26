// As rotas locais do Founders OS: a árvore do cérebro, o texto de uma página,
// "abrir no dispositivo", as notas e as sessões do Claude. Rodam dentro do
// servidor do Vite (dev e preview). O app só escreve no cérebro as notas, em
// fontes/notas/. O resultado das sessões fica fora dele, em sessoes/ do app.
// As sessões em si escrevem conforme o ACCESS de runs.ts.
import type { Plugin, ViteDevServer, PreviewServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { spawn } from "node:child_process";
import { scan } from "./scan";
import { agentSpecs, describe } from "./agents";
import { planStore } from "./agentPlan";
import { brainIsEmpty, builderStore } from "./brainBuilder";
import { exportPlan } from "../skills/levar-para-openbot/scripts/openbot-import.mjs";
import { closeOpenBot, connectorInfo, openOpenBotLink, isRunning, launchOpenBot, localScriptsByDefault, openbotLogo, setupState, writeLocalScriptsDefault } from "./openbotSetup";
import { agentForArea, answerPrompt, EGGBOT_INSTALL, findEggbot, deliveryOf, listServers, openbotState, pendingOf, respondApproval, pickServerFor, selectServer, selectedServer, sendToAgent, serverChosen } from "./openbot";
import { MAX_ATTEMPTS, connectorOrder, pickBuilder, teamStore, writeTeamOrder } from "./openbotTeam";
import { NOTES_DIR, noteStore } from "./notes";
import { DONE as CHAT_DONE, chatStore } from "./agentChat";
import { historyAvailable, readAvatars, readHistory, readMission } from "./openbotHistory";
import { readPending, readPriorities, taskStore, type Status } from "./tasks";
import { readJournal, readLearnings, writeJournal } from "./journal";
import { widgetStore } from "./widgets";
import { askEggbot, listTemplates } from "./newAgent";
import { applyFicha, fichaStore, withFichas } from "./fichas";
import { readSkills } from "../skills/levar-para-openbot/scripts/openbot-import.mjs";
import { applyOrg, matchHead, orgNodes, orgStore, parentOf, type OrgNode } from "./org";
import { ACCESS, runStore, skillName } from "./runs";
import { appStore } from "./apps";
import { routineClock } from "./routines";

type Server = ViteDevServer | PreviewServer;

// Os pedidos de cada etapa do Processar, que segue o fluxo do CLAUDE.md: a
// sessão propõe, o Arthur ajusta ou aprova, e só então ela grava no wiki/.
const PROPOR = (file: string) =>
  `Processe a nota ${file} no wiki, seguindo o "Fluxo para registrar conhecimento" do CLAUDE.md até o passo 3. Nesta etapa, só proponha: não grave nada. ` +
  "Responda com a proposta em Markdown: para cada mudança, a página (caminho), se é nova ou já existe e o que entra, com link para a nota. " +
  "Inclua o index.md da área e a entrada no wiki/log.md. O que for dúvida, pergunte em vez de supor.";
const AJUSTAR = (text: string) => "Ajuste a proposta: " + text + "\n\nAinda não grave nada. Responda com a proposta inteira, revisada.";
const GRAVAR =
  "A proposta foi aprovada. Grave no wiki exatamente o que foi proposto, com o index.md da área e a entrada no wiki/log.md (passos 4 e 5 do CLAUDE.md). " +
  "Só escreva dentro de wiki/. No fim, liste em poucas linhas o que foi gravado.";

// O Dr. Eggbot no OpenBot aberto, se ele já foi instalado.
const eggbotNow = () => openbotState().then((state) => (state.connected ? findEggbot(state.agents) : null)).catch(() => null);

export function brainApi(brainDir: string, resultsDir: string): Plugin {
  const brain = resolve(brainDir);
  const results = resolve(resultsDir);
  // A raiz do app: os resultados ficam em <app>/sessoes (vite.config.ts).
  const appRoot = resolve(results, "..");
  // O servidor do OpenBot escolhido na gaveta (o principal, se nada foi escolhido).
  const serverFile = join(results, "agentes", "openbot-servidor.json");
  try {
    selectServer(JSON.parse(readFileSync(serverFile, "utf8")).id ?? null);
  } catch {
    /* o principal */
  }
  const wiki = join(brain, "wiki");
  const notes = noteStore(brain);
  const runs = runStore(brain, results);
  const space = widgetStore(brain, results);
  const org = orgStore(results);
  const fichas = fichaStore(results);
  // O plano desenhado com as fichas dos agentes por cima (skills, conectores, regras).
  const fichaPlan = () => {
    const plan = plans.state().plan;
    return plan ? (withFichas(brain, plan as any, fichas.read()) as unknown as typeof plan) : null;
  };
  // Os nós do organograma (o time desenhado + os chefes) e o agente do OpenBot de cada um.
  const teamNodes = (): OrgNode[] => designed().map((one) => ({ key: one.key, name: one.name, mission: one.mission, owns: one.owns }));
  const botOf = (agents: { id: string; name: string }[]) => (node: OrgNode) =>
    node.key.startsWith("chefe:") ? matchHead(agents, node.name) : agentForArea(agents, { path: node.owns?.[0] ?? node.name, label: node.name });
  const orgView = (agents: { id: string; name: string }[], avatars: Record<string, { seed: string; hue: number | null }>) => {
    const saved = org.read();
    const nodes = orgNodes(saved, teamNodes());
    const bot = botOf(agents);
    return {
      heads: saved.heads.map((one) => {
        const found = bot({ key: one.key, name: one.name, mission: one.mission });
        return { ...one, openbot: found ? { ...found, avatar: avatars[found.id] ?? { seed: found.id, hue: null } } : null };
      }),
      parents: Object.fromEntries(nodes.map((one) => [one.key, parentOf(saved, nodes, one.key)])),
      applied: saved.applied,
    };
  };
  // Quando a lista de conectores muda, o mapa busca a árvore de novo (só no dev, que tem ws).
  let pushed: (() => void) | null = null;
  const apps = appStore(() => pushed?.());
  const plans = planStore(brain, results);
  const builder = builderStore(brain, results);
  const team = teamStore(brain, results);
  const chats = chatStore(results);
  const tasks = taskStore(brain, results);
  // Manda uma tarefa do quadro para um agente do time e registra a entrega.
  const sendTask = async (id: string, wanted: string, extra = "") => {
    const task = tasks.get(id);
    if (!task) return { status: 404, body: { error: "Tarefa não encontrada" } };
    const team = designed();
    const plainText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const area = plainText(task.meta["Área"] ?? "");
    // Automático: o agente da área da tarefa; sem área (ou sem agente dela), a Empresa.
    const one =
      wanted !== "auto"
        ? team.find((item) => item.key === wanted)
        : (area && team.find((item) => (item.owns ?? []).some((own) => area.includes(plainText(own))) || plainText(item.name).includes(area))) ??
          team.find((item) => (item.owns ?? []).includes("empresa")) ??
          team[0];
    if (!one) return { status: 404, body: { error: "Agente não encontrado" } };
    const agent = await agentOf(one);
    if (!agent) return { status: 404, body: { error: "O agente “" + one.name + "” não está no OpenBot" } };
    const details = [task.meta["Área"] && "Área: " + task.meta["Área"], task.meta.Projeto && "Projeto: " + task.meta.Projeto, task.meta.Prazo && "Prazo: " + task.meta.Prazo].filter(Boolean).join(" · ");
    const notes = task.extra.map((line) => line.trim()).filter(Boolean).join("\n");
    const text =
      `Tarefa do quadro do Mission Control (${id}):\n\n${task.title}` +
      (details ? `\n${details}` : "") +
      (notes ? `\n\nNotas da tarefa:\n${notes}` : "") +
      (extra ? `\n\n${extra}` : "") +
      `\n\nFaça a tarefa usando o cérebro (conector segundo-cerebro) e as suas skills. No fim, responda com o resultado em poucas linhas: o que fez, o que entregou e o que ficou pendente.`;
    const out = await sendToAgent(agent.id, text.slice(0, 3900), "fos-tarefa-" + id + "-" + Date.now());
    if (out.status !== 202) return { status: out.status || 502, body: out.body ?? { error: "O OpenBot recusou a tarefa" } };
    tasks.assigned(id, { agentKey: one.key, agentName: one.name, agentId: agent.id, deliveryId: out.body?.deliveries?.[0]?.id ?? null, at: new Date().toISOString(), status: "queued", answer: "", error: null });
    return { status: 200, body: { ok: true, agent: one.name } };
  };
  // No modo automático, segue o servidor aberto que tem os agentes do time (no máximo a cada 10 s).
  let followedAt = 0;
  const followTeam = async () => {
    if (Date.now() - followedAt < 10000) return;
    followedAt = Date.now();
    await pickServerFor(designed().flatMap((one) => [one.name, ...(one.owns ?? [])])).catch(() => null);
  };
  // O agente do OpenBot com o nome de um agente do time (achado na lista dele).
  // Pelo nome do agente ou pela pasta da área dele (o time sem desenho usa o nome da área).
  const agentOf = async (one: { name: string; owns?: string[] }) => {
    const bot = await openbotState();
    return bot.connected ? agentForArea(bot.agents, { path: one.owns?.[0] ?? one.name, label: one.name }) : null;
  };
  // A última exportação para o OpenBot: o arquivo e quando.
  const lastExport = () => {
    try {
      const saved = JSON.parse(readFileSync(join(results, "agentes", "exportacao.json"), "utf8"));
      return saved.brain === brain ? saved : null;
    } catch {
      return null;
    }
  };

  // Os agentes da gaveta: os do plano desenhado pelo cérebro ou, sem plano, um por departamento.
  const designed = () => {
    const specs = agentSpecs(brain);
    const plan = fichaPlan();
    if (!plan) {
      return specs.map((spec) => ({
        key: "area:" + spec.path,
        owns: [spec.path],
        name: spec.label,
        mission: "",
        why: "",
        areas: ["wiki/" + spec.path + "/"],
        tools: [] as string[],
        triggers: [] as string[],
        skills: spec.skills.map(({ label, slug }) => ({ label, slug })),
        routines: spec.routines.map(({ label, slug, schedule }) => ({ label, slug, schedule })),
        pages: spec.pages,
        prompt: spec.prompt,
      }));
    }
    const labels = new Map(specs.flatMap((spec) => [...spec.skills, ...spec.routines]).map((one) => [one.slug, one.label]));
    return plan.agents.map((one) => ({
      key: "plano:" + one.name,
      owns: one.owns ?? [],
      name: one.name,
      mission: one.mission,
      why: one.why,
      areas: one.areas,
      tools: one.tools,
      triggers: one.triggers,
      skills: one.skills.map((slug) => ({ label: labels.get(slug) ?? slug, slug })),
      routines: one.routines.map(({ slug, schedule }) => ({ label: labels.get(slug) ?? slug, slug, schedule })),
      pages: 0,
      prompt: one.prompt,
    }));
  };

  // Um caminho do mapa (relativo ao wiki; as skills começam com "../") vira um
  // arquivo de verdade, desde que fique dentro do cérebro. Um resultado de
  // sessão vem com o caminho completo, de dentro de sessoes/.
  const locate = (path: string) => {
    const file = resolve(wiki, path);
    if (file.startsWith(results + sep)) return file;
    if (file !== brain && !file.startsWith(brain + sep)) return null;
    return file;
  };

  // Com uma sessão rodando ou uma proposta esperando revisão, a nota não muda.
  const busy = (id: string) => {
    const last = runs.latest(id);
    return !!last && (last.status === "rodando" || last.status === "pronta");
  };

  // Uma etapa do Processar: propor, ajustar a proposta ou gravar a aprovada.
  const processNote = (id: string, step: string, opts: { label: string; text: string; model: string; effort: string }) => {
    const note = notes.get(id);
    if (!note) return { error: "Nota não encontrada" };
    const last = runs.latest(id);
    if (last?.status === "rodando") return { error: "A nota já está com o Claude" };
    const file = notes.path(id)!;
    const base = { path: file, label: opts.label || "Nota", kind: "nota" as const, area: "", areaLabel: "Notas", note: id, model: opts.model, effort: opts.effort, slug: "nota-" + id };
    if (step === "propor") {
      if (note.status !== "caixa") return { error: "A nota já é fonte" };
      runs.discard(id);
      return { run: runs.start({ ...base, phase: "proposta", text: "", prompt: PROPOR(file), access: ACCESS.propor, resume: null, meta: ["nota: " + file, "etapa: proposta"] }) };
    }
    // Ajustar e gravar continuam a sessão da proposta.
    if (last?.status !== "pronta" || last.phase !== "proposta" || !last.session) return { error: "Não há proposta para revisar" };
    if (step === "ajustar" && opts.text.trim())
      return {
        run: runs.start({ ...base, phase: "proposta", text: opts.text.trim(), prompt: AJUSTAR(opts.text.trim()), access: ACCESS.propor, resume: last.session, meta: ["nota: " + file, "etapa: ajuste"] }),
      };
    if (step === "gravar")
      return {
        run: runs.start({
          ...base,
          phase: "gravacao",
          text: "",
          prompt: GRAVAR,
          access: ACCESS.gravar,
          resume: last.session,
          meta: ["nota: " + file, "etapa: gravação"],
          // Gravada no wiki, a nota vira fonte e não muda mais.
          done: () => notes.send(id),
        }),
      };
    return { error: "Etapa desconhecida" };
  };

  // Rodar uma skill ou rotina: a sessão abre com todas as ferramentas (ACCESS.rodar).
  const startSkill = (slug: string, o: { path: string; label: string; kind: "skill" | "routine"; area: string; areaLabel: string; text: string; model: string; effort: string }) =>
    runs.start({
      path: o.path,
      label: o.label,
      kind: o.kind,
      area: o.area,
      areaLabel: o.areaLabel,
      text: o.text,
      note: null,
      phase: null,
      prompt: ("/" + skillName(join(brain, ".claude", "skills", slug, "SKILL.md"), slug) + " " + o.text).trim(),
      access: ACCESS.rodar,
      model: o.model,
      effort: o.effort,
      resume: null,
      slug,
      meta: ["skill: .claude/skills/" + slug + "/SKILL.md"],
    });

  // As rotinas abrem sozinhas na hora do schedule:. O modelo e o esforço do Personalizar
  // vivem no navegador, então aqui vale o padrão do Claude Code.
  let announce: (() => void) | null = null;
  const clock = routineClock(brain, results, runs, (due) => {
    startSkill(due.slug, { path: due.path, label: due.label, kind: "routine", area: due.area, areaLabel: due.areaLabel, text: "", model: "", effort: "" });
    announce?.();
  });

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };

  const body = (req: IncomingMessage) =>
    new Promise<string>((done) => {
      let text = "";
      req.on("data", (chunk) => (text += chunk));
      req.on("end", () => done(text));
    });

  const routes = (server: Server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://local");
      if (!url.pathname.startsWith("/api/")) return next();
      try {
        if (url.pathname === "/api/tree" && req.method === "GET") {
          // O dono de cada departamento, do time desenhado: o mapa mostra quem cuida de cada área.
          const owners: Record<string, string> = {};
          for (const agent of plans.state().plan?.agents ?? []) for (const dept of agent.owns ?? []) owners[dept] = agent.name;
          return send(res, 200, { ...scan(brain), apps: apps.current(), owners });
        }
        // Criar o segundo cérebro, para quem ainda não tem: entrevista → proposta → criação.
        if (url.pathname === "/api/brain/status" && req.method === "GET") return send(res, 200, { brain, empty: brainIsEmpty(brain), builder: builder.state() });
        if (url.pathname === "/api/brain/answers" && req.method === "POST") {
          const { answers } = JSON.parse((await body(req)) || "{}");
          return send(res, 200, builder.saveAnswers(answers && typeof answers === "object" ? answers : {}));
        }
        if (url.pathname === "/api/brain/propose" && req.method === "POST") {
          const { adjust } = JSON.parse((await body(req)) || "{}");
          return send(res, 200, await builder.propose(typeof adjust === "string" && adjust.trim() ? adjust.trim().slice(0, 4000) : undefined));
        }
        if (url.pathname === "/api/brain/build" && req.method === "POST") return send(res, 200, await builder.build());
        if (url.pathname === "/api/agents" && req.method === "GET") {
          await followTeam();
          const bot = await openbotState();
          const plan = plans.state();
          const avatars = bot.connected ? readAvatars() : {};
          const agents = designed().map((one) => {
            const found = agentForArea(bot.agents, { path: one.owns?.[0] ?? one.name, label: one.name });
            return { ...one, openbot: found ? { ...found, avatar: avatars[found.id] ?? { seed: found.id, hue: null } } : null };
          });
          return send(res, 200, {
            brain,
            openbot: { connected: bot.connected, reason: bot.connected ? null : bot.reason },
            plan: { status: plan.status, step: plan.step, createdAt: plan.plan?.createdAt ?? null, summary: plan.plan?.summary ?? "", gaps: plan.plan?.gaps ?? [] },
            exported: lastExport(),
            agents,
          });
        }
        // O quadro de tarefas (memory/to-dos.md). Ao ler, acompanha as tarefas que estão
        // com algum agente: quando a entrega termina, a resposta vai para a revisão.
        if (url.pathname === "/api/tasks" && req.method === "GET") {
          for (const [id, run] of Object.entries(tasks.runs())) {
            if (!run.deliveryId || CHAT_DONE.includes(run.status)) continue;
            const out = await deliveryOf(run.agentId, run.deliveryId).catch(() => null);
            if (out?.status === 200 && out.body?.status && out.body.status !== run.status)
              tasks.finished(id, { status: out.body.status, answer: out.body.answer ?? "", error: out.body.error ?? null });
          }
          return send(res, 200, { tasks: tasks.list() });
        }
        if (url.pathname === "/api/tasks" && req.method === "POST") {
          const { title, area, due } = JSON.parse((await body(req)) || "{}");
          if (typeof title !== "string" || !title.trim()) return send(res, 400, { error: "Escreva a tarefa" });
          const id = tasks.create(title.trim().slice(0, 300), typeof area === "string" ? area.trim() : "", typeof due === "string" ? due.trim() : "");
          return send(res, 200, { id, tasks: tasks.list() });
        }
        if (url.pathname === "/api/tasks/move" && req.method === "POST") {
          const { id, status } = JSON.parse((await body(req)) || "{}");
          if (!["a-fazer", "com-agente", "revisao", "feito"].includes(status) || !tasks.move(String(id), status as Status)) return send(res, 400, { error: "Não deu para mover" });
          return send(res, 200, { tasks: tasks.list() });
        }
        // O Espaço: os mini apps que a pessoa pede na barra e arruma em cartões flutuantes.
        if (url.pathname === "/api/space" && req.method === "GET") return send(res, 200, { widgets: space.list() });
        if (url.pathname === "/api/space" && req.method === "POST") {
          const { prompt, x, y } = JSON.parse((await body(req)) || "{}");
          if (typeof prompt !== "string" || !prompt.trim()) return send(res, 400, { error: "Diga o que você quer criar" });
          const id = space.create(prompt.trim().slice(0, 2000), { x: Number(x) || 40, y: Number(y) || 40 });
          return send(res, 200, { id, widgets: space.list() });
        }
        {
          const match = url.pathname.match(/^\/api\/space\/([\w-]+)(?:\/(html|data|edit|layout|rename|delete))?$/);
          if (match) {
            const [, id, action] = match;
            if (action === "html" && req.method === "GET") {
              const html = space.html(id);
              return html === null ? send(res, 404, { error: "Ainda sem HTML" }) : send(res, 200, { html });
            }
            if (action === "data" && req.method === "GET") return send(res, 200, { data: space.data(id) });
            if (action === "data" && req.method === "POST") {
              const raw = (await body(req)) || "null";
              if (raw.length > 2_000_000) return send(res, 413, { error: "Dados grandes demais" });
              return space.saveData(id, JSON.parse(raw).data) ? send(res, 200, { ok: true }) : send(res, 404, { error: "Cartão não encontrado" });
            }
            if (action === "edit" && req.method === "POST") {
              const { request } = JSON.parse((await body(req)) || "{}");
              if (typeof request !== "string" || !request.trim()) return send(res, 400, { error: "Diga o que mudar" });
              return space.edit(id, request.trim().slice(0, 6000)) ? send(res, 200, { widgets: space.list() }) : send(res, 404, { error: "Cartão não encontrado" });
            }
            if (action === "layout" && req.method === "POST") {
              space.layout(id, JSON.parse((await body(req)) || "{}"));
              return send(res, 200, { ok: true });
            }
            if (action === "rename" && req.method === "POST") {
              const { title } = JSON.parse((await body(req)) || "{}");
              if (typeof title === "string" && title.trim()) space.rename(id, title.trim());
              return send(res, 200, { widgets: space.list() });
            }
            if (action === "delete" && req.method === "POST") {
              space.remove(id);
              return send(res, 200, { widgets: space.list() });
            }
          }
        }
        // O "Meu dia": o diário de hoje e os aprendizados recentes do cérebro.
        if (url.pathname === "/api/journal" && req.method === "GET") {
          return send(res, 200, { ...readJournal(brain), learnings: readLearnings(brain), priorities: readPriorities(brain) });
        }
        if (url.pathname === "/api/journal" && req.method === "POST") {
          const { notes } = JSON.parse((await body(req)) || "{}");
          if (typeof notes !== "string") return send(res, 400, { error: "Nada para salvar" });
          return send(res, 200, writeJournal(brain, notes.slice(0, 20000)));
        }
        if (url.pathname === "/api/tasks/edit" && req.method === "POST") {
          const { id, ...patch } = JSON.parse((await body(req)) || "{}");
          if (!tasks.edit(String(id), patch)) return send(res, 404, { error: "Tarefa não encontrada" });
          return send(res, 200, { tasks: tasks.list() });
        }
        if (url.pathname === "/api/tasks/delete" && req.method === "POST") {
          const { id } = JSON.parse((await body(req)) || "{}");
          tasks.remove(String(id));
          return send(res, 200, { tasks: tasks.list() });
        }
        if (url.pathname === "/api/tasks/assign" && req.method === "POST") {
          const { id, agent } = JSON.parse((await body(req)) || "{}");
          const out = await sendTask(String(id), typeof agent === "string" ? agent : "auto");
          return send(res, out.status, { ...out.body, tasks: tasks.list() });
        }
        // Revisão: aprovar fecha a tarefa; devolver manda o comentário ao mesmo agente.
        if (url.pathname === "/api/tasks/review" && req.method === "POST") {
          const { id, decision, comment } = JSON.parse((await body(req)) || "{}");
          if (decision === "approve") {
            tasks.move(String(id), "feito");
            return send(res, 200, { tasks: tasks.list() });
          }
          const run = tasks.runs()[String(id)];
          const note = typeof comment === "string" && comment.trim() ? comment.trim() : "Revise a entrega.";
          const out = await sendTask(String(id), run?.agentKey ?? "auto", `Você já entregou esta tarefa. A revisão pediu ajustes: ${note}`);
          return send(res, out.status, { ...out.body, tasks: tasks.list() });
        }
        // O Mission Control: o time inteiro numa tela. Cada agente com o estado, o que está
        // fazendo, a última entrega e as rotinas; o que espera a pessoa; a atividade recente;
        // e a saúde da ligação (OpenBot, Local scripts, conector).
        if (url.pathname === "/api/mission" && req.method === "GET") {
          await followTeam();
          const bot = await openbotState();
          const avatars = bot.connected ? readAvatars() : {};
          const agents = designed().map((one) => {
            const found = agentForArea(bot.agents, { path: one.owns?.[0] ?? one.name, label: one.name });
            return { key: one.key, name: one.name, owns: one.owns, mission: one.mission, openbot: found ? { ...found, avatar: avatars[found.id] ?? { seed: found.id, hue: null } } : null };
          });
          const ids = agents.flatMap((one) => (one.openbot ? [one.openbot.id] : []));
          const mission = ids.length ? readMission(ids) : null;
          const pending: Record<string, unknown> = {};
          for (const id of ids) if (mission?.agents[id]?.working) pending[id] = await pendingOf(id).catch(() => null);
          return send(res, 200, {
            openbot: { connected: bot.connected, reason: bot.connected ? null : bot.reason },
            history: Boolean(mission),
            agents,
            mission,
            pending,
            setup: await setupState(appRoot, brain).catch(() => null),
            team: team.state().status,
            plan: { createdAt: plans.state().plan?.createdAt ?? null, gaps: plans.state().plan?.gaps ?? [] },
            priorities: readPriorities(brain),
            brainPending: readPending(brain),
            org: orgView(bot.agents, avatars),
          });
        }
        // O organograma: mudar o chefe de um agente, criar e tirar chefes, avisar os chefes.
        if (url.pathname.startsWith("/api/org/") && req.method === "POST") {
          const input = JSON.parse((await body(req)) || "{}");
          const nodes = () => orgNodes(org.read(), teamNodes());
          let out: { error?: string } = {};
          if (url.pathname === "/api/org/move") out = org.move(nodes(), String(input.key ?? ""), input.to ? String(input.to) : null);
          else if (url.pathname === "/api/org/head") out = org.addHead(String(input.name ?? ""), String(input.title ?? ""), String(input.mission ?? ""));
          else if (url.pathname === "/api/org/head/delete") out = org.removeHead(nodes(), String(input.key ?? ""));
          else if (url.pathname === "/api/org/apply") {
            const state = await openbotState();
            if (!state.connected) return send(res, 409, { error: "Abra o OpenBot para avisar os chefes." });
            return send(res, 200, { applied: org.saveResult(await applyOrg(org.read(), nodes(), botOf(state.agents))).applied });
          } else return send(res, 404, { error: "Rota não encontrada" });
          return out.error ? send(res, 400, { error: out.error }) : send(res, 200, { ok: true });
        }
        // Configurar tudo: um agente que já existe no OpenBot monta o time desenhado
        // (agentes, skills, rotinas e o conector). O front acompanha e responde aprovações.
        if (url.pathname === "/api/openbot/team" && req.method === "POST") {
          const plan = fichaPlan() as any;
          if (!plan) return send(res, 409, { error: "Desenhe o time antes (Agentes › Desenhar)." });
          if (!localScriptsByDefault()) return send(res, 409, { error: "Ligue o Local scripts em todos os agentes primeiro.", needsScripts: true });
          const bot = await openbotState();
          const builder = bot.connected ? pickBuilder(bot.agents, plan) : null;
          if (!builder) {
            // Nenhum agente ainda: o importador oficial cria o time; o app termina depois.
            const info = exportPlan(brain, plan);
            return send(res, 200, team.waitImport(info.file));
          }
          const connector = connectorInfo(appRoot, brain);
          const order = writeTeamOrder(brain, plan, { command: connector.command, args: connector.args });
          const out = await sendToAgent(builder.id, order.message, "fos-time-" + Date.now());
          if (out.status !== 202) return send(res, out.status || 502, out.body ?? { error: "O OpenBot recusou o pedido" });
          return send(res, 200, team.start(builder, out.body?.deliveries?.[0]?.id ?? null, false, "time"));
        }
        // Como está a montagem: a entrega do agente e o que espera uma pessoa (aprovações e perguntas).
        if (url.pathname === "/api/openbot/team" && req.method === "GET") {
          let state = team.state();
          let pending: any = { prompts: [], approvals: [], browserTakeovers: [] };
          if (state.status === "importar") {
            // Os agentes importados apareceram: um deles liga o conector, e a montagem termina.
            const bot = await openbotState();
            const plan = fichaPlan() as any;
            const builder = bot.connected && plan ? pickBuilder(bot.agents, plan) : null;
            if (builder) {
              const out = await sendToAgent(builder.id, connectorOrder(connectorInfo(appRoot, brain)), "fos-conector-" + Date.now());
              state = team.start(builder, out.status === 202 ? (out.body?.deliveries?.[0]?.id ?? null) : null, false, "conector");
            }
          }
          if (state.status === "rodando" && state.builder && state.deliveryId) {
            const out = await deliveryOf(state.builder.id, state.deliveryId).catch(() => null);
            const status = out?.body?.status;
            const plan = fichaPlan() as any;
            if (out?.status === 200 && status === "interrupted" && state.attempts < MAX_ATTEMPTS && plan) {
              // O OpenBot cortou o turno no meio: manda de novo; o pedido reaproveita o que já existe.
              const connector = connectorInfo(appRoot, brain);
              const message = state.mode === "conector" ? connectorOrder(connector) : writeTeamOrder(brain, plan, { command: connector.command, args: connector.args }).message;
              const again = await sendToAgent(state.builder.id, message, "fos-time-" + Date.now());
              state = team.start({ id: state.builder.id, name: state.builder.name }, again.status === 202 ? (again.body?.deliveries?.[0]?.id ?? null) : null, true);
            } else if (out?.status === 200 && ["completed", "failed", "interrupted", "cancelled"].includes(status)) state = team.finish(status, out.body.answer ?? "", out.body.error ?? null);
            else pending = await pendingOf(state.builder.id).catch(() => pending);
          }
          return send(res, 200, { ...state, pending });
        }
        // A pessoa aprovou ou recusou no front o que o OpenBot pediu.
        if (url.pathname === "/api/openbot/team/approve" && req.method === "POST") {
          const { requestId, decision } = JSON.parse((await body(req)) || "{}");
          const builder = team.state().builder;
          if (!builder || typeof requestId !== "string") return send(res, 400, { error: "Nada para aprovar" });
          const out = await respondApproval(builder.id, requestId, decision === "decline" ? "decline" : "accept");
          return send(res, out.status, out.body ?? {});
        }
        if (url.pathname === "/api/openbot/team/answer" && req.method === "POST") {
          const { requestId, answers } = JSON.parse((await body(req)) || "{}");
          const builder = team.state().builder;
          if (!builder || typeof requestId !== "string" || !answers || typeof answers !== "object") return send(res, 400, { error: "Resposta inválida" });
          const out = await answerPrompt(builder.id, requestId, answers);
          return send(res, out.status, out.body ?? {});
        }
        // A configuração do OpenBot: instalado, aberto, Local scripts por padrão, o conector.
        if (url.pathname === "/api/openbot/logo" && req.method === "GET") {
          const file = openbotLogo(url.searchParams.get("cor") ?? "gold");
          if (!file) return send(res, 404, { error: "OpenBot não instalado" });
          res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=86400" });
          return res.end(readFileSync(file));
        }
        if (url.pathname === "/api/openbot/setup" && req.method === "GET" && (await followTeam(), true))
          return send(res, 200, { ...(await setupState(appRoot, brain)), servers: listServers(), server: selectedServer(), auto: !serverChosen(), eggbot: await eggbotNow() });
        // A ficha de um agente: skills, conectores e regras próprias.
        if (url.pathname === "/api/agents/ficha" && req.method === "GET") {
          const key = url.searchParams.get("key") ?? "";
          const base = (plans.state().plan?.agents ?? []).find((one) => "plano:" + one.name === key);
          if (!base) return send(res, 404, { error: "Desenhe o time antes (Agentes › Configurar › Desenhar)." });
          return send(res, 200, {
            ficha: fichas.read()[key] ?? { skillsAdd: [], skillsRemove: [], connectors: [], rules: [], appliedAt: null },
            base: { skills: base.skills, limits: base.limits, tools: base.tools },
            skills: readSkills(brain).map(({ slug, label, area, schedule }: any) => ({ slug, label, area, routine: Boolean(schedule) })),
            apps: apps.current().map((one) => one.label),
          });
        }
        if (url.pathname === "/api/agents/ficha" && req.method === "POST") {
          const input = JSON.parse((await body(req)) || "{}");
          const key = String(input.key ?? "");
          if (!(plans.state().plan?.agents ?? []).some((one) => "plano:" + one.name === key)) return send(res, 404, { error: "Agente não encontrado no plano" });
          return send(res, 200, { ficha: fichas.save(key, input, readSkills(brain).map((one: any) => one.slug)) });
        }
        if (url.pathname === "/api/agents/ficha/apply" && req.method === "POST") {
          const key = String(JSON.parse((await body(req)) || "{}").key ?? "");
          const agent = (fichaPlan()?.agents ?? []).find((one) => "plano:" + one.name === key);
          const base = (plans.state().plan?.agents ?? []).find((one) => "plano:" + one.name === key);
          if (!agent || !base) return send(res, 404, { error: "Agente não encontrado no plano" });
          const state = await openbotState();
          const bot = state.connected ? agentForArea(state.agents, { path: agent.owns?.[0] ?? agent.name, label: agent.name }) : null;
          if (!bot) return send(res, 409, { error: `${agent.name} não está no OpenBot aberto. Use Configurar tudo para criar o time.` });
          const out = await applyFicha(brain, agent, bot.id, base.skills.filter((one) => !agent.skills.includes(one)));
          if (out.status < 200 || out.status >= 300) return send(res, out.status || 502, { error: out.body?.error || "O OpenBot não aceitou o pedido" });
          fichas.applied(key);
          return send(res, 200, { ok: true });
        }
        // Um agente novo: os modelos e o pedido ao Dr. Eggbot.
        if (url.pathname === "/api/agents/templates" && req.method === "GET") return send(res, 200, { templates: listTemplates(appRoot) });
        if (url.pathname === "/api/agents/new" && req.method === "POST") {
          const { template, description } = JSON.parse((await body(req)) || "{}");
          const out = await askEggbot(appRoot, brain, typeof template === "string" ? template : "", String(description ?? ""));
          return send(res, out.status, out.body);
        }
        // Instala o Dr. Eggbot: o servidor abre o link do marketplace no OpenBot.
        if (url.pathname === "/api/openbot/eggbot" && req.method === "POST") {
          if (!(await isRunning())) return send(res, 409, { error: "Abra o OpenBot primeiro." });
          return openOpenBotLink(EGGBOT_INSTALL) ? send(res, 200, { ok: true }) : send(res, 500, { error: "Não consegui abrir o OpenBot" });
        }
        // Escolhe o servidor do OpenBot (o principal ou um servidor local) e guarda a escolha.
        if (url.pathname === "/api/openbot/server" && req.method === "POST") {
          const { id } = JSON.parse((await body(req)) || "{}");
          if (id === "auto") {
            // Automático: esquece a escolha e segue o servidor aberto no OpenBot.
            selectServer(null, false);
            rmSync(serverFile, { force: true });
          } else {
            if (!selectServer(typeof id === "string" ? id : null)) return send(res, 404, { error: "Servidor não encontrado no OpenBot" });
            mkdirSync(join(results, "agentes"), { recursive: true });
            writeFileSync(serverFile, JSON.stringify({ id: selectedServer() }));
          }
          return send(res, 200, { ...(await setupState(appRoot, brain)), servers: listServers(), server: selectedServer(), auto: !serverChosen(), eggbot: await eggbotNow() });
        }
        // Liga Local scripts para todos os agentes. Com o OpenBot aberto, só fecha se a pessoa pediu.
        if (url.pathname === "/api/openbot/local-scripts" && req.method === "POST") {
          const { close } = JSON.parse((await body(req)) || "{}");
          if (localScriptsByDefault()) return send(res, 200, await setupState(appRoot, brain));
          if (await isRunning()) {
            if (close !== true) return send(res, 409, { needsClose: true, error: "O OpenBot precisa fechar para a mudança valer" });
            if (!(await closeOpenBot()))
              return send(res, 409, { error: "O OpenBot não fechou. Feche pelo ícone dele perto do relógio (Sair) e tente de novo." });
          }
          const out = writeLocalScriptsDefault();
          launchOpenBot();
          return send(res, 200, { ...(await setupState(appRoot, brain)), backup: out.backup });
        }
        // Leva o time para o OpenBot: gera o zip do importador oficial, mostra o arquivo e abre o app.
        if (url.pathname === "/api/agents/export" && req.method === "POST") {
          const plan = fichaPlan();
          if (!plan) return send(res, 409, { error: "Desenhe o time antes de levar para o OpenBot" });
          // O mesmo núcleo da skill /levar-para-openbot: as duas portas geram o mesmo zip.
          const info = exportPlan(brain, plan);
          mkdirSync(join(results, "agentes"), { recursive: true });
          writeFileSync(join(results, "agentes", "exportacao.json"), JSON.stringify({ ...info, brain }, null, 2));
          return send(res, 200, info);
        }
        // O cérebro desenha o time de agentes: uma sessão do Claude que só lê.
        if (url.pathname === "/api/agents/plan" && req.method === "POST") {
          const state = plans.start();
          return send(res, 200, { status: state.status, step: state.step });
        }
        // Manda uma tarefa para o agente do OpenBot. Ele é achado pelo NOME, na lista
        // do próprio OpenBot, nunca por um id vindo do navegador.
        if (url.pathname === "/api/agents/send" && req.method === "POST") {
          const { agent: wanted, text, key } = JSON.parse((await body(req)) || "{}");
          const one = designed().find((item) => item.key === wanted);
          if (!one || typeof text !== "string") return send(res, 400, { error: "Agente ou texto inválido" });
          const bot = await openbotState();
          const agent = bot.connected ? agentForArea(bot.agents, { path: one.owns?.[0] ?? one.name, label: one.name }) : null;
          if (!agent) return send(res, 404, { error: "O agente “" + one.name + "” não está com “Local scripts” ligado no OpenBot" });
          const out = await sendToAgent(agent.id, text, typeof key === "string" && key ? key : "fos-" + Date.now());
          return send(res, out.status === 202 ? 200 : out.status, { ...(out.body ?? {}), agentId: agent.id });
        }
        // A conversa com um agente: o histórico guardado pelo app, a resposta em andamento
        // e o que o agente espera da pessoa (aprovações e perguntas).
        // A conversa com um agente. Com o banco do OpenBot à mão, é a conversa de verdade
        // (inclusive o que foi escrito lá, os passos e os eventos); sem ele, o histórico
        // guardado pelo app. Vem junto o que o agente espera da pessoa.
        if (url.pathname === "/api/chat" && req.method === "GET") {
          const key = url.searchParams.get("agent") ?? "";
          const one = designed().find((item) => item.key === key);
          if (!one) return send(res, 404, { error: "Agente não encontrado" });
          const agent = await agentOf(one);
          const real = agent ? readHistory(agent.id) : null;
          if (real) {
            const pending = real.working ? await pendingOf(agent!.id).catch(() => null) : null;
            return send(res, 200, { agent: { id: agent!.id, name: agent!.name }, source: "openbot", ...real, pending });
          }
          for (const open of chats.open(key)) {
            const out = await deliveryOf(open.agentId!, open.deliveryId!).catch(() => null);
            if (out?.status !== 200 || !out.body) continue;
            chats.update(key, open.id, { status: out.body.status ?? open.status, text: out.body.answer ?? open.text, error: out.body.error ?? null });
          }
          const messages = chats.list(key);
          const running = messages.find((m) => m.role === "agente" && m.deliveryId && !CHAT_DONE.includes(m.status ?? ""));
          const items = messages
            .filter((m) => m.role === "voce" || m.text || (m.status && !CHAT_DONE.includes(m.status)) || m.error)
            .filter((m) => m !== running)
            .map((m) => ({ id: m.id, kind: m.role, text: m.text || (m.error ? "Falhou: " + m.error : m.status && m.status !== "completed" ? "Não terminou (" + m.status + ")" : ""), at: m.at, turn: null }));
          const pending = agent && running ? await pendingOf(agent.id).catch(() => null) : null;
          return send(res, 200, { agent: agent ? { id: agent.id, name: agent.name } : null, source: "app", items, working: Boolean(running), turnStarted: running?.at ?? null, pending });
        }
        if (url.pathname === "/api/chat" && req.method === "POST") {
          const { agent: key, text } = JSON.parse((await body(req)) || "{}");
          const one = designed().find((item) => item.key === key);
          if (!one || typeof text !== "string" || !text.trim()) return send(res, 400, { error: "Agente ou mensagem inválida" });
          const agent = await agentOf(one);
          if (!agent) return send(res, 404, { error: "O agente “" + one.name + "” ainda não existe neste servidor do OpenBot" });
          const out = await sendToAgent(agent.id, text, "fos-chat-" + Date.now());
          if (out.status !== 202) return send(res, out.status || 502, out.body ?? { error: "O OpenBot recusou a mensagem" });
          // Sem o banco do OpenBot, o app guarda a conversa ele mesmo.
          if (!historyAvailable()) chats.ask(key, text.trim(), agent.id, out.body?.deliveries?.[0]?.id ?? null);
          return send(res, 200, { ok: true });
        }
        // A lista da esquerda: a última mensagem de cada conversa e se o agente trabalha.
        if (url.pathname === "/api/chat/summary" && req.method === "GET") {
          const out: Record<string, { text: string; role: string; at: string; working: boolean } | null> = {};
          const bot = await openbotState();
          for (const one of designed()) {
            const agent = bot.connected ? agentForArea(bot.agents, { path: one.owns?.[0] ?? one.name, label: one.name }) : null;
            const real = agent ? readHistory(agent.id, 30) : null;
            if (real) {
              const last = [...real.items].reverse().find((m) => m.kind === "voce" || m.kind === "agente") ?? null;
              out[one.key] = last ? { text: last.text, role: last.kind, at: last.at, working: real.working } : real.working ? { text: "", role: "agente", at: new Date().toISOString(), working: true } : null;
              continue;
            }
            const messages = chats.list(one.key);
            const last = [...messages].reverse().find((m) => m.text || m.role === "agente") ?? null;
            out[one.key] = last
              ? { text: last.text, role: last.role, at: last.at, working: messages.some((m) => m.role === "agente" && m.deliveryId && !CHAT_DONE.includes(m.status ?? "")) }
              : null;
          }
          return send(res, 200, out);
        }
        if (url.pathname === "/api/chat/clear" && req.method === "POST") {
          const { agent: key } = JSON.parse((await body(req)) || "{}");
          if (typeof key === "string") chats.clear(key);
          return send(res, 200, { messages: [] });
        }
        // Aprovar, recusar ou responder o que o agente pediu no meio da conversa.
        if (url.pathname === "/api/chat/approve" && req.method === "POST") {
          const { agent: key, requestId, decision } = JSON.parse((await body(req)) || "{}");
          const one = designed().find((item) => item.key === key);
          const agent = one ? await agentOf(one) : null;
          if (!agent || typeof requestId !== "string") return send(res, 400, { error: "Nada para aprovar" });
          const out = await respondApproval(agent.id, requestId, decision === "decline" ? "decline" : "accept");
          return send(res, out.status, out.body ?? {});
        }
        if (url.pathname === "/api/chat/answer" && req.method === "POST") {
          const { agent: key, requestId, answers } = JSON.parse((await body(req)) || "{}");
          const one = designed().find((item) => item.key === key);
          const agent = one ? await agentOf(one) : null;
          if (!agent || typeof requestId !== "string" || !answers || typeof answers !== "object") return send(res, 400, { error: "Resposta inválida" });
          const out = await answerPrompt(agent.id, requestId, answers);
          return send(res, out.status, out.body ?? {});
        }
        if (url.pathname === "/api/agents/delivery" && req.method === "GET") {
          const out = await deliveryOf(url.searchParams.get("agent") ?? "", url.searchParams.get("id") ?? "");
          return send(res, out.status, out.body ?? {});
        }
        if (url.pathname === "/api/page" && req.method === "GET") {
          const file = locate(url.searchParams.get("path") ?? "");
          if (!file || !file.endsWith(".md") || !existsSync(file)) return send(res, 404, { error: "Página não encontrada" });
          return send(res, 200, { markdown: readFileSync(file, "utf8") });
        }
        if (url.pathname === "/api/open" && req.method === "POST") {
          const { path } = JSON.parse((await body(req)) || "{}");
          const file = typeof path === "string" ? locate(path) : null;
          if (!file || !existsSync(file)) return send(res, 404, { error: "Arquivo não encontrado" });
          const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
          spawn(opener, [file], { detached: true, stdio: "ignore" }).unref();
          return send(res, 200, { ok: true });
        }
        if (url.pathname === "/api/notes" && req.method === "GET") return send(res, 200, notes.list());
        if (url.pathname === "/api/notes" && req.method === "POST") {
          const { id, title, body: text } = JSON.parse((await body(req)) || "{}");
          if (busy(String(id ?? ""))) return send(res, 409, { error: "A nota está com o Claude" });
          const out = notes.save(String(id ?? ""), String(title ?? ""), String(text ?? ""));
          return send(res, out.error ? 409 : 200, out);
        }
        if (url.pathname === "/api/notes/delete" && req.method === "POST") {
          const { id } = JSON.parse((await body(req)) || "{}");
          if (busy(String(id ?? ""))) return send(res, 409, { error: "A nota está com o Claude" });
          return notes.remove(String(id ?? "")) ? send(res, 200, { ok: true }) : send(res, 409, { error: "Só um rascunho pode ser apagado" });
        }
        if (url.pathname === "/api/notes/process" && req.method === "POST") {
          const input = JSON.parse((await body(req)) || "{}");
          const text = (key: string) => String(input[key] ?? "");
          const out = processNote(text("id"), text("step"), { label: text("label"), text: text("text"), model: text("model"), effort: text("effort") });
          return send(res, "run" in out ? 200 : 409, out);
        }
        if (url.pathname === "/api/notes/discard" && req.method === "POST") {
          const { id } = JSON.parse((await body(req)) || "{}");
          runs.discard(String(id ?? ""));
          return send(res, 200, { ok: true });
        }
        if (url.pathname === "/api/runs" && req.method === "GET") return send(res, 200, runs.list());
        if (url.pathname === "/api/runs" && req.method === "POST") {
          const input = JSON.parse((await body(req)) || "{}");
          const text = (key: string) => String(input[key] ?? "");
          const slug = text("path").match(/^\.\.\/\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
          const file = slug ? join(brain, ".claude", "skills", slug, "SKILL.md") : "";
          if (!slug || !existsSync(file)) return send(res, 404, { error: "Skill não encontrada" });
          const run = startSkill(slug, {
            path: text("path"),
            label: text("label") || slug,
            kind: text("kind") === "routine" ? "routine" : "skill",
            area: text("area"),
            areaLabel: text("areaLabel"),
            text: text("text").trim(),
            model: text("model"),
            effort: text("effort"),
          });
          return send(res, 200, { run });
        }
        if (url.pathname === "/api/runs/dismiss" && req.method === "POST") {
          const { id } = JSON.parse((await body(req)) || "{}");
          return runs.dismiss(String(id ?? "")) ? send(res, 200, { ok: true }) : send(res, 404, { error: "Sessão não encontrada" });
        }
        return send(res, 404, { error: "Rota desconhecida" });
      } catch (error) {
        return send(res, 500, { error: String(error) });
      }
    });
  };

  return {
    name: "founders-os-brain",
    configureServer(server) {
      routes(server);
      const stopClock = clock.start();
      server.httpServer?.once("close", () => {
        stopClock();
        runs.stopAll();
        plans.stop();
      });
      pushed = () => server.ws.send({ type: "custom", event: "brain:changed" });
      announce = () => server.ws.send({ type: "custom", event: "runs:changed" });
      // Mudou algo no wiki ou nas skills: o mapa busca a árvore de novo.
      server.watcher.add([wiki, join(brain, ".claude", "skills")]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = (file: string) => {
        if (!file.startsWith(brain + sep)) return;
        clearTimeout(timer);
        timer = setTimeout(() => server.ws.send({ type: "custom", event: "brain:changed" }), 150);
      };
      for (const event of ["add", "unlink", "change", "addDir", "unlinkDir"] as const) server.watcher.on(event, changed);
    },
    configurePreviewServer(server) {
      routes(server);
      const stopClock = clock.start();
      server.httpServer?.once("close", () => {
        stopClock();
        runs.stopAll();
        plans.stop();
      });
    },
  };
}
