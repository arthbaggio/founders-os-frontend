// O Espaço do Mission Control: mini apps que a pessoa pede numa barra ("um to-do de
// conteúdo", "um painel das metas da turma 2") e o Claude escreve. Cada um vira um
// arquivo HTML guardado, aberto num cartão flutuante que a pessoa arrasta, redimensiona
// e pede para ajustar.
//
// Tudo fica em sessoes/espaco/ (fora do git, por pessoa):
//   espaco.json          a lista: título, pedido, posição e tamanho de cada cartão
//   <id>.html            o mini app
//   <id>.dados.json      o que o mini app salvou (via window.fos.save)
//
// O Claude roda como `claude -p` na pasta do cérebro, só com leitura (ele pode olhar o
// cérebro para entender o pedido), e devolve um HTML só. O mini app não acessa a rede
// nem o servidor: roda num iframe isolado e fala com o Mission Control pela ponte
// window.fos (ver WIDGET_BRIDGE no front).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanEnv } from "./runs";

export type Widget = {
  id: string;
  title: string;
  prompt: string;
  status: "gerando" | "pronto" | "falhou";
  step: string;
  error: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  createdAt: string;
  updatedAt: string;
  // Os pedidos de ajuste, do mais antigo ao mais novo.
  edits: string[];
  // A cor do cartão: uma das áreas do mapa (vendas, marketing, financas...).
  color?: string;
};

const LIMIT = 6 * 60 * 1000;

const RULES = `Você escreve mini apps para o "Espaço" do Mission Control, o painel pessoal do segundo cérebro. Cada mini app vive dentro de um cartão flutuante (um iframe isolado) que a pessoa arrasta e redimensiona.

Responda SOMENTE com um documento HTML completo, sem nenhum texto antes ou depois, sem cercas de código. A primeira linha é <!doctype html>.
Na tag <title>, um nome curto em português (2 a 4 palavras) para o cartão.

Regras técnicas:
- Tudo inline: CSS num <style> e JavaScript num <script>. Nada de arquivos, bibliotecas, fontes ou imagens externas. Nada de fetch ou rede.
- Ocupe o cartão inteiro: html, body com height:100%, margin:0, e layout responsivo que funcione de 260px a 1200px de largura. Use rolagem interna quando o conteúdo passar da altura.
- Visual do painel (tema escuro, calmo e limpo): fundo transparente; texto oklch(0.94 0.006 85); texto secundário oklch(0.74 0.012 268); texto apagado oklch(0.5 0.012 268); bordas 1px solid oklch(1 0 0 / 9%); superfícies oklch(1 0 0 / 4%); raio 10px; destaque: var(--fos-accent) (o dourado do painel; use nos títulos, no que está selecionado e nos números importantes, sem exagero); verde oklch(0.78 0.14 155); vermelho oklch(0.76 0.13 25); azul oklch(0.76 0.11 245). Fonte: font-family: system-ui, -apple-system, "Segoe UI", sans-serif; tamanhos de 12 a 14px; títulos em peso 600. Nada de gradientes, sombras fortes ou cores berrantes. Campos e botões discretos, com color-scheme: dark.
- Português do Brasil em toda a interface.

Dados (a ponte window.fos já existe na página, não a declare):
- await fos.load() devolve o objeto que o app salvou da última vez (ou null na primeira vez). Use para começar.
- await fos.save(objeto) guarda o estado. Chame sempre que o usuário mudar algo. Guarde tudo que o usuário digitar.
- await fos.tasks() devolve as tarefas do cérebro: [{ id, title, area, due ("AAAA-MM-DD" ou ""), status ("a-fazer" | "com-agente" | "revisao" | "feito"), notes, project, focus }].
- await fos.addTask({ title, area?, due? }) cria uma tarefa no cérebro.
- await fos.setDone(id, true|false) marca uma tarefa do cérebro como feita ou aberta.
- await fos.priorities() devolve as prioridades da quinzena: [{ title, detail }].
- fos.openTask(id) abre o detalhe de uma tarefa no Mission Control.
Use as tarefas e prioridades do cérebro quando o pedido falar delas (to-do, agenda, prazos, foco). Para coisas novas que só existem no app, use load/save.
Comece o app só depois de await fos.load(). Trate os casos vazios com uma linha curta e útil.

Faça um app que funcione de verdade, bonito e simples de usar, sem enfeite. Pode ler arquivos do cérebro (pasta atual) para entender o contexto do pedido, mas não escreva nada.`;

const pad = (n: number) => String(n).padStart(2, "0");
const newId = () => {
  const d = new Date();
  return `w-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
};
const cut = (text: string, size = 120) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > size ? line.slice(0, size - 1) + "…" : line;
};

// O HTML da resposta: tira cercas e qualquer texto antes do <!doctype>/<html>.
export function extractHtml(text: string) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/<!doctype html|<html/i);
  if (start < 0) return null;
  const end = body.toLowerCase().lastIndexOf("</html>");
  return body.slice(start, end >= 0 ? end + 7 : undefined).trim();
}
const titleOf = (html: string, fallback: string) => cut(html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || fallback, 40);

export function widgetStore(brain: string, results: string) {
  const dir = join(results, "espaco");
  const listFile = join(dir, "espaco.json");
  const procs = new Map<string, ChildProcess>();
  const bin = process.env.CLAUDE_BIN || "claude";

  const read = (): Widget[] => {
    try {
      return JSON.parse(readFileSync(listFile, "utf8")).widgets ?? [];
    } catch {
      return [];
    }
  };
  const write = (widgets: Widget[]) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(listFile, JSON.stringify({ widgets }, null, 2));
  };
  const update = (id: string, change: (one: Widget) => void) => {
    const widgets = read();
    const one = widgets.find((item) => item.id === id);
    if (!one) return null;
    change(one);
    one.updatedAt = new Date().toISOString();
    write(widgets);
    return one;
  };
  const htmlFile = (id: string) => join(dir, id.replace(/[^\w-]/g, "") + ".html");
  const dataFile = (id: string) => join(dir, id.replace(/[^\w-]/g, "") + ".dados.json");

  // Ao reabrir o servidor, um cartão que estava gerando ficou órfão.
  {
    const widgets = read();
    let changed = false;
    for (const one of widgets)
      if (one.status === "gerando") {
        one.status = existsSync(htmlFile(one.id)) ? "pronto" : "falhou";
        one.error = one.status === "falhou" ? "O servidor reiniciou no meio da criação" : null;
        changed = true;
      }
    if (changed) write(widgets);
  }

  // Roda o Claude e grava o HTML que voltar.
  const generate = (id: string, prompt: string) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-prompts",
      "none",
      "--strict-mcp-config",
      "--tools",
      "Read,Glob,Grep",
      "--permission-mode",
      "dontAsk",
      "--append-system-prompt",
      RULES,
      "--name",
      "Founders OS · Espaço",
    ];
    const proc = spawn(bin, args, { cwd: brain, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    procs.set(id, proc);
    let rest = "";
    let errors = "";
    let result = "";
    const fail = (message: string) =>
      update(id, (one) => {
        if (one.status !== "gerando") return;
        one.status = existsSync(htmlFile(id)) ? "pronto" : "falhou";
        one.error = message;
        one.step = "";
      });
    proc.stdout!.setEncoding("utf8");
    proc.stdout!.on("data", (chunk: string) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === "assistant") {
            const tool = (event.message?.content ?? []).find((part: any) => part.type === "tool_use");
            if (tool) update(id, (one) => (one.step = tool.name === "Read" ? "Lendo o cérebro" : "Procurando no cérebro"));
            else update(id, (one) => (one.step = "Escrevendo o app"));
          }
          if (event.type === "result") result = typeof event.result === "string" ? event.result : "";
        } catch {
          /* linha parcial */
        }
      }
    });
    proc.stderr!.setEncoding("utf8");
    proc.stderr!.on("data", (chunk: string) => (errors = (errors + chunk).slice(-1500)));
    proc.on("error", (error: NodeJS.ErrnoException) => fail(error.code === "ENOENT" ? "Não achei o claude no PATH do servidor" : cut(String(error))));
    const timer = setTimeout(() => {
      proc.kill();
      fail("Passou de 6 minutos: parei");
    }, LIMIT);
    proc.on("close", () => {
      clearTimeout(timer);
      procs.delete(id);
      const html = extractHtml(result);
      if (!html) return fail(result ? "O Claude não devolveu um HTML" : cut(errors.trim().split("\n").pop() || "A criação parou sem resposta"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(htmlFile(id), html);
      update(id, (one) => {
        one.status = "pronto";
        one.step = "";
        one.error = null;
        one.title = titleOf(html, one.title);
      });
    });
  };

  return {
    list: read,
    html: (id: string) => (existsSync(htmlFile(id)) ? readFileSync(htmlFile(id), "utf8") : null),
    data: (id: string) => {
      try {
        return JSON.parse(readFileSync(dataFile(id), "utf8"));
      } catch {
        return null;
      }
    },
    saveData(id: string, value: unknown) {
      if (!read().some((one) => one.id === id)) return false;
      mkdirSync(dir, { recursive: true });
      writeFileSync(dataFile(id), JSON.stringify(value ?? null, null, 2));
      return true;
    },
    // Um pedido novo: o cartão aparece na hora, gerando, perto do centro.
    create(prompt: string, place: { x: number; y: number }) {
      const widgets = read();
      const id = newId();
      const now = new Date().toISOString();
      widgets.push({
        id,
        title: cut(prompt, 40),
        prompt,
        status: "gerando",
        step: "Começando",
        error: null,
        x: Math.round(place.x),
        y: Math.round(place.y),
        w: 420,
        h: 360,
        z: Math.max(0, ...widgets.map((one) => one.z)) + 1,
        createdAt: now,
        updatedAt: now,
        edits: [],
      });
      write(widgets);
      generate(id, `Crie este mini app: ${prompt}`);
      return id;
    },
    // Um ajuste: manda o HTML atual e o pedido; o que o app salvou continua.
    edit(id: string, request: string) {
      const current = existsSync(htmlFile(id)) ? readFileSync(htmlFile(id), "utf8") : "";
      const one = update(id, (item) => {
        item.status = "gerando";
        item.step = "Começando";
        item.error = null;
        item.edits.push(request);
      });
      if (!one) return false;
      const saved = existsSync(dataFile(id)) ? readFileSync(dataFile(id), "utf8").slice(0, 3000) : "";
      generate(
        id,
        `Ajuste este mini app. Pedido original: ${one.prompt}\n\nO que mudar agora: ${request}\n\nMantenha o formato dos dados salvos compatível (o app já tem dados salvos)${saved ? `; exemplo do que está salvo:\n${saved}` : ""}.\n\nHTML atual:\n${current}`,
      );
      return true;
    },
    layout(id: string, box: Partial<Pick<Widget, "x" | "y" | "w" | "h" | "z" | "color">>) {
      return update(id, (one) => {
        if (typeof box.color === "string" && /^[a-z]{3,20}$/.test(box.color)) one.color = box.color;
        for (const key of ["x", "y", "w", "h", "z"] as const) if (typeof box[key] === "number" && Number.isFinite(box[key])) one[key] = Math.round(box[key]!);
        one.w = Math.max(240, one.w);
        one.h = Math.max(160, one.h);
      });
    },
    rename: (id: string, title: string) => update(id, (one) => (one.title = cut(title, 40))),
    remove(id: string) {
      procs.get(id)?.kill();
      write(read().filter((one) => one.id !== id));
      rmSync(htmlFile(id), { force: true });
      rmSync(dataFile(id), { force: true });
    },
  };
}
