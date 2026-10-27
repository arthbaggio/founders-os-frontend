// As rotas locais do Founders OS: a árvore do cérebro, o texto de uma página,
// "abrir no dispositivo", as notas e as sessões do Claude. Rodam dentro do
// servidor do Vite (dev e preview). O app só escreve no cérebro as notas, em
// fontes/notas/. O resultado das sessões fica fora dele, em sessoes/ do app.
// As sessões em si escrevem conforme o ACCESS de runs.ts.
import type { Plugin, ViteDevServer, PreviewServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { spawn } from "node:child_process";
import { scan } from "./scan";
import { NOTES_DIR, noteStore } from "./notes";
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

export function brainApi(brainDir: string, resultsDir: string): Plugin {
  const brain = resolve(brainDir);
  const results = resolve(resultsDir);
  const wiki = join(brain, "wiki");
  const notes = noteStore(brain);
  const runs = runStore(brain, results);
  // Quando a lista de conectores muda, o mapa busca a árvore de novo (só no dev, que tem ws).
  let pushed: (() => void) | null = null;
  const apps = appStore(() => pushed?.());

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
        if (url.pathname === "/api/tree" && req.method === "GET") return send(res, 200, { ...scan(brain), apps: apps.current() });
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
      });
    },
  };
}
