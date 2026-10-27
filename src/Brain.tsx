// A tela do cérebro: o mapa em canvas e tudo o que fica por cima dele.
// Port do componente do design "Cérebro v3": mesmo estado, mesmos textos e
// os mesmos estilos inline. O que no design era só um aviso ("No app, …")
// aqui faz de verdade: lê a página, abre o arquivo, guarda os ajustes e as notas.
// Rodar uma skill e processar uma nota abrem sessões de verdade do Claude
// (server/runs.ts), com o modelo e o esforço escolhidos no Personalizar.
import { Component, type KeyboardEvent } from "react";
import startBrain, { type Brief, type Engine, type Info, type Kind, type View } from "./brain/engine";
import type { BrainApp, BrainNode } from "../server/scan";
import type { Run } from "../server/runs";
import { css } from "./css";
import { Svg, KindIcon, Check, Close, External, Copy } from "./components/Icons";
import { Reader, type Page } from "./components/Reader";
import { Clock } from "./components/Clock";
import { Dock } from "./components/Dock";
import { Manager, SkillsWidget } from "./components/Skills";
import { NoteDialog, NotesWidget, blank, busy, titled, type Note } from "./components/Notes";
import { Settings, type Home, type MapOpts, type Tab } from "./components/Settings";
import { CLOCK, EFFORTS, MAX_FAVS, MAX_TOOLS, MIN_TOOLS, MODELS, NEXT, SHOW, TOOLS, catalog, pad, when, type Runnable } from "./home";
import { load, save } from "./storage";

const CENTER = "empresa";

type Props = { tree: BrainNode[]; apps: BrainApp[] };

type State = MapOpts & {
  focus: string | null;
  page: Page | null;
  sel: Info | null;
  tip: Info | null;
  legend: boolean;
  q: string;
  hits: Brief[];
  layersOff: Record<string, boolean>;
  areasOff: Record<string, boolean>;
  removed: number;
  // O item que espera a confirmação para sair do mapa.
  asking: Info | null;
  // A nota aberta que espera a confirmação para ser apagada.
  askingNote: boolean;
  // A última nota apagada, enquanto ainda dá para desfazer.
  undo: Note | null;
  toast: string;
  // A tela inicial: o que aparece em volta do mapa, e como.
  home: Home;
  now: number;
  expanded: boolean;
  // O que está aberto por cima do mapa.
  settings: Tab | null;
  lastTab: Tab;
  manager: "skills" | "routines" | null;
  // As sessões do Claude abertas daqui, as que rodam e as que terminaram.
  runs: Run[];
  notes: Note[];
  note: string | null;
  noteMode: "write" | "read";
  noteFocus: "title" | "body" | null;
};

// Os ajustes do Personalizar: mudam na hora e ficam guardados neste navegador.
type Saved = MapOpts & Home;
const MAP: MapOpts = { view: "depts", names: true, spin: 17, springs: 35, group: "dept" };
const HOME: Home = { show: SHOW, clock: CLOCK, tools: TOOLS, toolNames: false, favs: [], nextCount: NEXT, archive: false, model: "", effort: "" };

const kinds: Record<Kind, string> = { page: "Página", folder: "Pasta", skill: "Skill", routine: "Rotina", app: "Aplicação", dept: "Departamento", core: "Empresa" };
const tint = (item: { kind: Kind; area: string | null }) =>
  item.kind === "skill" ? "var(--foreground)" : item.kind === "routine" ? "var(--brain-routine)" : item.kind === "app" ? "var(--brain-app)" : item.area ? "var(--area-" + item.area + ")" : "var(--foreground)";
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
// O caminho a partir da pasta do cérebro: o mapa conta a partir do wiki. Um
// resultado de sessão, fora do cérebro, já vem com o caminho completo.
const short = (path: string) => (path.startsWith("/") ? path : path.startsWith("../") ? path.slice(3) : "wiki/" + path);

// Quanto há de cada camada e em cada departamento, para a legenda.
const counted = new WeakMap<BrainNode[], { layers: Record<string, number>; areas: Record<string, number> }>();
function tally(tree: BrainNode[], apps: BrainApp[]) {
  const known = counted.get(tree);
  if (known) return known;
  const layers: Record<string, number> = { A: apps.length, S: 0, M: 0 };
  const areas: Record<string, number> = {};
  for (const area of tree) {
    let inside = 0;
    const walk = (node: BrainNode) => {
      layers.S += (node.skills || []).length + (node.routines || []).length;
      for (const child of node.children || []) {
        inside++;
        if (child.children) walk(child);
        else layers.M++;
      }
    };
    walk(area);
    areas[area.path] = inside;
  }
  const out = { layers, areas };
  counted.set(tree, out);
  return out;
}

function header(tree: BrainNode[], focus: string | null, apps: number) {
  const here = tree.find((node) => node.path === focus);
  const depts = tree.filter((node) => node.children && node.path !== CENTER);
  const total = { pastas: 0, paginas: 0, skills: 0, rotinas: 0 };
  const walk = (node: BrainNode, depth: number) => {
    total.skills += (node.skills || []).length;
    total.rotinas += (node.routines || []).length;
    if (!node.children) total.paginas++;
    else {
      if (depth) total.pastas++;
      node.children.forEach((child) => walk(child, depth + 1));
    }
  };
  (here ? [here] : tree.filter((node) => node.children)).forEach((node) => walk(node, 0));
  const some = (n: number, one: string, many: string) => (n ? n + " " + (n === 1 ? one : many) : "");
  const list = (parts: string[]) => {
    const kept = parts.filter(Boolean);
    return kept.length > 1 ? kept.slice(0, -1).join(", ") + " e " + kept[kept.length - 1] : kept[0] || "";
  };
  const memory = list([some(total.pastas, "pasta", "pastas"), some(total.paginas, "página", "páginas")]);
  const legend = here
    ? [
        { text: memory, color: "var(--area-" + here.path + ")" },
        { text: some(total.skills, "skill", "skills"), color: "var(--foreground)" },
        { text: some(total.rotinas, "rotina", "rotinas"), color: "var(--brain-routine)" },
      ].filter((part) => part.text)
    : [];
  return {
    title: here ? here.label : "Visão geral",
    legend,
    summary: here
      ? legend.length
        ? ""
        : "Ainda vazio"
      : list([some(depts.length, "área", "áreas"), memory, some(total.skills, "skill", "skills"), some(total.rotinas, "rotina", "rotinas"), some(apps, "aplicação", "aplicações")]),
  };
}

// O nome de uma nota nova: a hora em que ela nasceu, AAAA-MM-DD-hhmmss.
function noteId(t: number) {
  const d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

const post = (url: string, data: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

// Os estilos que se repetem, como no design.
const GLASS = "border: 1px solid oklch(1 0 0 / 9%); backdrop-filter: blur(18px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 10px 30px oklch(0 0 0 / 30%)";
const MAIN = "height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer";
const SOLID =
  "display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 9px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer";
const SQUARE = "display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 9%); background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); cursor: pointer";
const MONO = "font-family: 'Geist Mono', ui-monospace, monospace";

export class Brain extends Component<Props, State> {
  saved: Saved = Brain.restore();

  // Os ajustes salvos, conferidos: uma vista que não existe mais (Círculo,
  // Hexágono) volta a Departamentos, e o que vier quebrado volta ao padrão.
  static restore(): Saved {
    const raw = load<Partial<Saved>>("ajustes", {});
    const saved: Saved = { ...MAP, ...HOME, ...raw, show: { ...SHOW, ...raw.show }, clock: { ...CLOCK, ...raw.clock } };
    if (!["depts", "rings", "force"].includes(saved.view)) saved.view = "depts";
    const tool = (item: unknown) => !!item && typeof (item as { name: unknown }).name === "string" && typeof (item as { url: unknown }).url === "string";
    if (!Array.isArray(saved.tools) || !saved.tools.every(tool) || saved.tools.length < MIN_TOOLS || saved.tools.length > MAX_TOOLS) saved.tools = TOOLS;
    saved.tools = saved.tools.map((item, i) => ({ id: item.id || "t" + i, name: item.name, url: item.url }));
    if (!Array.isArray(saved.favs)) saved.favs = [];
    saved.favs = saved.favs.filter((path) => typeof path === "string").slice(0, MAX_FAVS);
    if (![0, 1, 2, 3, 4].includes(saved.nextCount)) saved.nextCount = NEXT;
    if (!MODELS.some(([value]) => value === saved.model)) saved.model = HOME.model;
    if (!EFFORTS.some(([value]) => value === saved.effort)) saved.effort = HOME.effort;
    return saved;
  }

  state: State = {
    focus: null,
    page: null,
    view: "depts",
    sel: null,
    tip: null,
    legend: false,
    q: "",
    hits: [],
    names: this.saved.names,
    spin: this.saved.spin,
    springs: this.saved.springs,
    group: this.saved.group,
    layersOff: {},
    areasOff: {},
    removed: 0,
    asking: null,
    askingNote: false,
    undo: null,
    toast: "",
    home: {
      show: this.saved.show,
      clock: this.saved.clock,
      tools: this.saved.tools,
      toolNames: this.saved.toolNames,
      favs: this.saved.favs,
      nextCount: this.saved.nextCount,
      archive: this.saved.archive,
      model: this.saved.model,
      effort: this.saved.effort,
    },
    now: Date.now(),
    expanded: false,
    settings: null,
    lastTab: "home",
    manager: null,
    runs: [],
    notes: [],
    note: null,
    noteMode: "write",
    noteFocus: null,
  };

  brain: Engine | null = null;
  root: HTMLDivElement | null = null;
  canvas: HTMLCanvasElement | null = null;
  searchBox: HTMLInputElement | null = null;
  tipBox: HTMLDivElement | null = null;
  tipAt = "";
  ready = false;
  gone = false;
  toastTimer: ReturnType<typeof setTimeout> | undefined;
  undoTimer: ReturnType<typeof setTimeout> | undefined;
  // O pedido de apagar em andamento: desfazer espera por ele para não chegar antes.
  erasing: Promise<unknown> = Promise.resolve();
  ticker: ReturnType<typeof setInterval> | undefined;
  // Enquanto uma sessão roda, a lista é buscada de segundo em segundo.
  runTicker: ReturnType<typeof setInterval> | undefined;
  inset = "";
  // As notas com uma gravação marcada: o texto vai para o arquivo logo depois de parar de digitar.
  pending = new Map<string, ReturnType<typeof setTimeout>>();
  // E as que estão indo para o arquivo agora.
  saving = new Map<string, Promise<void>>();

  // O canvas pode chegar antes ou depois das fontes: o mapa começa quando os dois estão prontos.
  bindCanvas = (canvas: HTMLCanvasElement | null) => {
    if (canvas === this.canvas) return;
    if (this.brain) this.brain.stop();
    this.brain = null;
    this.canvas = canvas;
    this.start();
  };
  bindRoot = (root: HTMLDivElement | null) => {
    this.root = root;
  };
  bindSearch = (input: HTMLInputElement | null) => {
    this.searchBox = input;
  };
  bindTip = (tip: HTMLDivElement | null) => {
    this.tipBox = tip;
    this.placeTip();
  };

  componentDidMount() {
    this.gone = false;
    const fonts = ["500 11.5px Geist", "400 10.5px Geist", "600 11px Geist", '400 10px "Geist Mono"'];
    Promise.all(fonts.map((font) => document.fonts.load(font).catch(() => null))).then(() => {
      this.ready = true;
      this.start();
    });
    // Os atalhos (N, vírgula, /) valem desde que a tela abre.
    this.root?.focus({ preventScroll: true });
    // As horas relativas ("há 3 min", "em 2 h") andam de meio em meio minuto; o relógio anda sozinho.
    this.ticker = setInterval(() => this.setState({ now: Date.now() }), 30000);
    this.fetchNotes();
    this.fetchRuns();
    window.addEventListener("focus", this.fetchNotes);
    window.addEventListener("focus", this.fetchRuns);
    // Uma rotina que o servidor abriu sozinho aparece na lista na hora.
    import.meta.hot?.on("runs:changed", this.fetchRuns);
  }

  componentDidUpdate(previous: Props, before: State) {
    this.placeTip(); // a tela redesenhada esquece onde a etiqueta estava
    // O wiki mudou: a cena se refaz, e continua de onde estava.
    if (previous.tree !== this.props.tree || previous.apps !== this.props.apps) this.restart();
    this.frame();
    const s = this.state;
    if (s.view !== before.view || s.names !== before.names || s.spin !== before.spin || s.springs !== before.springs || s.group !== before.group || s.home !== before.home)
      save("ajustes", { view: s.view, names: s.names, spin: s.spin, springs: s.springs, group: s.group, ...s.home } satisfies Saved);
  }

  componentWillUnmount() {
    this.gone = true;
    clearTimeout(this.toastTimer);
    clearTimeout(this.undoTimer);
    clearInterval(this.ticker);
    clearInterval(this.runTicker);
    window.removeEventListener("focus", this.fetchNotes);
    window.removeEventListener("focus", this.fetchRuns);
    import.meta.hot?.off?.("runs:changed", this.fetchRuns);
    for (const id of [...this.pending.keys()]) this.flush(id);
    if (this.brain) this.brain.stop();
    this.brain = null;
  }

  hooks() {
    return {
      change: (focus: string | null) => this.setState({ focus }),
      open: (page: Info) => this.read(page),
      select: (sel: Info | null) => this.setState({ sel }),
      mode: (view: View) => this.setState({ view }),
      hover: (tip: Info | null) => this.setState({ tip }),
      point: (x: number, y: number) => this.moveTip(x, y),
      // Um toque no mapa fecha a busca aberta por cima dele.
      touch: () => {
        if (this.state.q) this.setState({ q: "", hits: [] });
      },
    };
  }

  start() {
    if (this.gone || !this.ready || !this.canvas || this.brain) return;
    this.brain = startBrain(this.canvas, this.props.tree, this.hooks(), this.props.apps);
    this.settle(this.brain);
    if (this.saved.view !== "depts") this.brain.mode(this.saved.view);
    else this.brain.focus(null);
  }

  // Os ajustes, os filtros e o que foi tirado do mapa valem para a cena nova.
  settle(brain: Engine) {
    const s = this.state;
    brain.set({ names: s.names, spin: s.spin / 100, springs: s.springs / 100, group: s.group });
    this.inset = "";
    this.frame();
    const on = (off: Record<string, boolean>) => Object.fromEntries(Object.entries(off).map(([key, value]) => [key, !value]));
    if (Object.keys(s.layersOff).length || Object.keys(s.areasOff).length) brain.filter({ layers: on(s.layersOff), areas: on(s.areasOff) });
    let removed = 0;
    for (const path of load<string[]>("tirados", [])) removed = brain.remove(path);
    if (removed !== this.state.removed) this.setState({ removed });
  }

  restart() {
    if (!this.brain || !this.canvas) return;
    const camera = this.brain.camera();
    const { view, focus, sel } = this.state;
    this.brain.stop();
    this.brain = startBrain(this.canvas, this.props.tree, this.hooks(), this.props.apps, camera);
    this.settle(this.brain);
    if (view !== "depts") {
      this.brain.mode(view);
      if (sel) this.brain.go(sel.path);
    } else this.brain.focus(focus);
  }

  // O mapa abre espaço para o que fica por cima dele: a barra de baixo, o painel
  // da direita e, com ele aberto, a coluna da esquerda.
  frame() {
    if (!this.brain) return;
    const s = this.state;
    const width = this.canvas ? this.canvas.clientWidth : 0;
    const foot = s.home.show.tools ? (s.home.toolNames ? 98 : 88) : 32;
    const panel = s.page ? 480 : s.manager ? 440 : 0;
    const wide = panel > 0 && width > 900;
    const left = wide && s.home.show.skills ? (width <= 1180 ? 264 : 308) + 32 : 0;
    const right = wide ? panel : 0;
    const key = foot + "," + left + "," + right;
    if (key === this.inset) return;
    this.inset = key;
    this.brain.set({ foot, left, right });
  }

  // A etiqueta acompanha o mouse sem redesenhar a tela: só muda de lugar.
  moveTip(x: number, y: number) {
    if (!this.canvas) return;
    const left = Math.max(8, Math.min(x + 14, this.canvas.clientWidth - 276));
    const top = Math.max(8, Math.min(y + 18, this.canvas.clientHeight - 96));
    this.tipAt = "translate(" + left + "px, " + top + "px)";
    this.placeTip();
  }

  placeTip() {
    if (this.tipBox && this.tipAt) this.tipBox.style.transform = this.tipAt;
  }

  say(text: string) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: text });
    this.toastTimer = setTimeout(() => {
      if (!this.gone) this.setState({ toast: "" });
    }, 2600);
  }

  // A leitura e o painel Gerenciar dividem a gaveta da direita: um fecha o outro.
  read(info: Info | Page) {
    this.setState({ page: { ...info }, manager: null, settings: null });
  }

  // Abre o arquivo (ou a pasta) no computador, com o programa padrão.
  device(path: string, done = "Abrindo no seu computador") {
    fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) })
      .then((res) => this.say(res.ok ? done : "Não deu para abrir esse arquivo"))
      .catch(() => this.say("Não deu para abrir esse arquivo"));
  }

  // Copia para a área de transferência. Sem a API (ou com a janela sem foco), tenta o jeito antigo.
  clip(text: string, done: string): Promise<boolean> {
    const old = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position: fixed; opacity: 0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
      this.root?.focus({ preventScroll: true });
      this.say(ok ? done : "Não deu para copiar por aqui");
      return ok;
    };
    try {
      return navigator.clipboard.writeText(text).then(() => {
        this.say(done);
        return true;
      }, old);
    } catch {
      return Promise.resolve(old());
    }
  }

  copy(path: string) {
    this.clip(short(path), "Caminho copiado");
  }

  // --- Sessões do Claude ---
  // Rodar uma skill ou rotina: uma sessão do Claude abre na pasta do cérebro.
  run = (item: { path: string; label: string; kind: string; area: string | null; areaLabel: string }, text = "") => {
    const { model, effort } = this.state.home;
    post("/api/runs", { path: item.path, label: item.label, kind: item.kind, area: item.area ?? "", areaLabel: item.areaLabel, text, model, effort })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ run }: { run: Run }) => {
        if (this.gone) return;
        const runs = [run, ...this.state.runs.filter((one) => one.id !== run.id)];
        this.setState({ runs, now: Date.now() });
        this.pace(runs);
        this.say(item.label + " rodando no Claude");
      })
      .catch(() => this.say("Não deu para rodar " + item.label));
  };

  // A lista do servidor. Uma sessão que acabou de terminar ganha um aviso.
  fetchRuns = () => {
    fetch("/api/runs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((runs: Run[]) => {
        if (this.gone) return;
        const was = new Map(this.state.runs.map((run) => [run.id, run.status]));
        const ended = runs.find((run) => was.get(run.id) === "rodando" && (run.status === "pronta" || run.status === "falhou"));
        this.setState({ runs, now: Date.now() });
        this.pace(runs);
        // Gravada no wiki, a nota virou fonte no arquivo: a cópia daqui vem de novo.
        if (ended?.note && ended.phase === "gravacao" && ended.status === "pronta") this.refreshNote(ended.note);
        if (!ended || (ended.note && ended.note === this.state.note)) return;
        if (ended.status === "falhou") this.say(ended.label + " falhou");
        else if (ended.note) this.say("“" + ended.label + "” " + (ended.phase === "gravacao" ? "foi para a wiki" : "está pronta para revisar"));
        else this.say(ended.label + " terminou");
      })
      .catch(() => null);
  };

  // Com alguma sessão rodando, a etapa e o tempo andam de segundo em segundo; sem nenhuma, param.
  pace(runs: Run[]) {
    const live = runs.some((run) => run.status === "rodando");
    if (live && !this.runTicker) this.runTicker = setInterval(this.fetchRuns, 1000);
    if (!live && this.runTicker) {
      clearInterval(this.runTicker);
      this.runTicker = undefined;
    }
  }

  // O resultado abre no leitor, como uma página.
  openRun = (run: Run) => {
    if (!run.file || run.kind === "nota") return;
    this.read({ path: run.file, label: run.label, kind: run.kind, note: "resultado de " + when(run.endedAt ?? run.startedAt, Date.now()), area: run.area || null, areaLabel: run.areaLabel });
  };

  // Rodando, a sessão para; terminada, sai da lista (o resultado fica em sessoes/).
  dismissRun = (run: Run) => {
    const live = run.status === "rodando";
    if (!live) this.setState({ runs: this.state.runs.filter((one) => one.id !== run.id) });
    post("/api/runs/dismiss", { id: run.id })
      .then(() => this.fetchRuns())
      .catch(() => null);
    if (live) this.say("Sessão de " + run.label + " parada");
  };

  // Um link no texto de uma página: outra página do mapa abre no leitor e o
  // mapa vai até ela; o resto abre fora.
  follow = (target: string) => {
    const brain = this.brain;
    const info = brain?.info(target);
    if (brain && info) {
      brain.go(target);
      if (info.kind === "page" || info.kind === "skill" || info.kind === "routine") this.read(info);
      return;
    }
    if (target.endsWith(".md")) {
      const name = target.split("/").pop() ?? target;
      this.read({ path: target, label: name.replace(/\.md$/, ""), kind: "page", note: "", area: null, areaLabel: "" });
      return;
    }
    this.device(target);
  };

  // --- Personalizar ---
  openSettings(tab: Tab) {
    this.setState({ settings: tab, lastTab: tab, q: "", hits: [] });
  }

  toggleSettings() {
    if (this.state.settings) this.setState({ settings: null });
    else this.openSettings(this.state.lastTab);
  }

  patch = (next: Partial<Home>) => this.setState({ home: { ...this.state.home, ...next } });

  setMap = (next: Partial<MapOpts>) => {
    const brain = this.brain;
    if (next.view) brain?.mode(next.view);
    const { view: _, ...rest } = next;
    if (!Object.keys(rest).length) return;
    this.setState(rest as Pick<State, keyof MapOpts>);
    brain?.set({
      ...("names" in rest ? { names: rest.names } : {}),
      ...("group" in rest ? { group: rest.group } : {}),
      ...("spin" in rest ? { spin: rest.spin! / 100 } : {}),
      ...("springs" in rest ? { springs: rest.springs! / 100 } : {}),
    });
  };

  reset = (tab: Tab) => {
    const home = this.state.home;
    if (tab === "home") this.patch({ show: SHOW });
    if (tab === "map") this.setMap({ group: MAP.group, names: MAP.names, spin: MAP.spin, springs: MAP.springs });
    if (tab === "skills") this.patch({ favs: HOME.favs, nextCount: HOME.nextCount, model: HOME.model, effort: HOME.effort });
    if (tab === "tools") this.patch({ tools: TOOLS, toolNames: HOME.toolNames });
    if (tab === "clock") this.patch({ clock: CLOCK, show: { ...home.show, clock: true } });
    if (tab === "notes") this.patch({ archive: HOME.archive });
    this.say("Padrão restaurado");
  };

  toggleFav = (path: string) => {
    const favs = this.state.home.favs;
    if (favs.includes(path)) this.patch({ favs: favs.filter((item) => item !== path) });
    else if (favs.length < MAX_FAVS) this.patch({ favs: [...favs, path] });
    else this.say("Até 6 favoritas");
  };

  restoreRemoved = () => {
    if (!this.brain) return;
    this.brain.restore();
    save("tirados", []);
    this.setState({ removed: 0 });
    this.say("Itens de volta ao mapa");
  };

  // --- Notas ---
  // As notas do arquivo; a que está aberta (e o que ainda não foi gravado) fica como está aqui.
  fetchNotes = () => {
    fetch("/api/notes", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((list: Note[]) => {
        if (this.gone) return;
        const keep = new Map(this.state.notes.filter((note) => note.id === this.state.note || this.pending.has(note.id)).map((note) => [note.id, note]));
        const notes = list.map((note) => keep.get(note.id) ?? note);
        for (const note of keep.values()) if (!list.some((one) => one.id === note.id)) notes.unshift(note);
        this.setState({ notes });
      })
      .catch(() => null);
  };

  current() {
    return this.state.notes.find((note) => note.id === this.state.note) ?? null;
  }

  newNote = () => {
    const now = Date.now();
    let at = now;
    while (this.state.notes.some((note) => note.id === noteId(at))) at += 1000;
    const note: Note = { id: noteId(at), title: "", body: "", status: "caixa", createdAt: now, updatedAt: now, sentAt: null };
    this.setState({ notes: [note, ...this.state.notes], note: note.id, noteMode: "write", noteFocus: "title", settings: null, q: "", hits: [] });
  };

  openNote = (id: string) => {
    const note = this.state.notes.find((item) => item.id === id);
    if (!note) return;
    const write = note.status === "caixa" && !busy(this.noteRun(id));
    this.setState({ note: id, noteMode: write ? "write" : "read", noteFocus: write ? "body" : null, settings: null, q: "", hits: [] });
  };

  editNote = (patch: { title?: string; body?: string }) => {
    const id = this.state.note;
    if (!id) return;
    this.setState({ notes: this.state.notes.map((note) => (note.id === id && note.status === "caixa" ? { ...note, ...patch, updatedAt: Date.now() } : note)) });
    clearTimeout(this.pending.get(id));
    this.pending.set(id, setTimeout(() => this.flush(id), 400));
  };

  // Grava o rascunho agora. Vazio, o arquivo some (ou nem nasce). Devolve
  // quando o arquivo está em dia, mesmo que a gravação já estivesse a caminho.
  flush(id: string): Promise<void> {
    if (!this.pending.has(id)) return this.saving.get(id) ?? Promise.resolve();
    clearTimeout(this.pending.get(id));
    this.pending.delete(id);
    const note = this.state.notes.find((item) => item.id === id);
    if (!note || note.status !== "caixa") return Promise.resolve();
    const done: Promise<void> = (this.saving.get(id) ?? Promise.resolve())
      .then(() => post("/api/notes", { id, title: note.title, body: note.body }))
      .then((res) => {
        if (res.status === 409) {
          res.json().then((out: { error?: string }) => this.say(out.error ?? "A nota não muda mais"), () => null);
          this.fetchNotes();
        } else if (!res.ok) this.say("Não deu para salvar a nota");
      })
      .catch(() => this.say("Não deu para salvar a nota"))
      .finally(() => {
        if (this.saving.get(id) === done) this.saving.delete(id);
      });
    this.saving.set(id, done);
    return done;
  }

  // Fechar não perde nada: a nota já está salva. Só some se ficou vazia.
  closeNote = () => {
    const note = this.current();
    if (!note) return this.setState({ note: null });
    this.flush(note.id);
    this.setState({ note: null, notes: blank(note) ? this.state.notes.filter((item) => item.id !== note.id) : this.state.notes });
  };

  // Apagar pede confirmação. Uma nota vazia não tem o que perder: vai direto.
  deleteNote = () => {
    const note = this.current();
    if (!note || note.status !== "caixa") return;
    if (blank(note)) return this.eraseNote();
    this.setState({ askingNote: true });
  };

  eraseNote = () => {
    const note = this.current();
    this.setState({ askingNote: false });
    if (!note || note.status !== "caixa") return;
    clearTimeout(this.pending.get(note.id));
    this.pending.delete(note.id);
    this.setState({ notes: this.state.notes.filter((item) => item.id !== note.id), note: null });
    this.erasing = post("/api/notes/delete", { id: note.id }).catch(() => null);
    if (blank(note)) return this.say("Nota apagada");
    clearTimeout(this.undoTimer);
    this.setState({ undo: note });
    this.undoTimer = setTimeout(() => {
      if (!this.gone) this.setState({ undo: null });
    }, 8000);
  };

  // Desfazer: a nota volta ao arquivo como estava (a data de criação passa a ser a de agora).
  undoErase = () => {
    const note = this.state.undo;
    if (!note) return;
    clearTimeout(this.undoTimer);
    this.setState({ undo: null });
    this.erasing
      .then(() => post("/api/notes", { id: note.id, title: note.title, body: note.body }))
      .then((res) => (res.ok ? Promise.resolve() : Promise.reject()))
      .then(() => {
        if (this.gone) return;
        this.setState({ notes: [{ ...note, updatedAt: Date.now() }, ...this.state.notes.filter((item) => item.id !== note.id)] });
        this.say("Nota de volta");
      })
      .catch(() => this.say("Não deu para desfazer"));
  };

  // A última sessão de uma nota, se houver: diz em que pé a revisão está.
  noteRun(id: string) {
    return this.state.runs.find((run) => run.note === id) ?? null;
  }

  // Uma nota do arquivo, de novo, mesmo aberta (a sessão a gravou como fonte).
  refreshNote(id: string) {
    fetch("/api/notes", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((list: Note[]) => {
        const fresh = list.find((note) => note.id === id);
        if (fresh && !this.gone) this.setState({ notes: this.state.notes.map((note) => (note.id === id ? fresh : note)) });
      })
      .catch(() => null);
  }

  // Processar, como pede o CLAUDE.md: a sessão do Claude lê a nota e propõe as
  // mudanças no wiki. Nada é gravado antes de Aprovar e gravar.
  processNote = (id: string) => {
    const note = this.state.notes.find((item) => item.id === id);
    if (!note || blank(note) || note.status !== "caixa" || busy(this.noteRun(id))) return;
    this.flush(id).then(() => this.noteStep(id, "propor"));
  };

  // Uma etapa do Processar: propor, ajustar a proposta ou gravar a aprovada.
  noteStep(id: string, step: "propor" | "ajustar" | "gravar", text = "") {
    const note = this.state.notes.find((item) => item.id === id);
    if (!note) return;
    const { model, effort } = this.state.home;
    post("/api/notes/process", { id, step, text, label: titled(note), model, effort })
      .then((res) => res.json().then((out) => (res.ok ? out : Promise.reject(out.error))))
      .then(({ run }: { run: Run }) => {
        if (this.gone) return;
        const runs = [run, ...this.state.runs];
        this.setState({ runs, now: Date.now(), noteMode: this.state.note === id ? "read" : this.state.noteMode });
        this.pace(runs);
        if (this.state.note !== id) this.say("Processando “" + titled(note) + "” no Claude");
      })
      .catch((error) => this.say(typeof error === "string" ? error : "Não deu para falar com o Claude"));
  }

  // Descartar a proposta: nada foi gravado, e a nota volta para a caixa.
  discardNote = (id: string) => {
    this.setState({ runs: this.state.runs.filter((run) => run.note !== id) });
    post("/api/notes/discard", { id }).catch(() => null);
  };

  render() {
    const s = this.state;
    const brain = this.brain;
    const { tree, apps } = this.props;
    const show = s.home.show;
    const graph = s.view !== "depts";
    const counts = tally(tree, apps);
    const cat = catalog(tree);
    const head = header(tree, graph ? null : s.focus, graph ? counts.layers.A : 0);
    const jump = (path: string) => () => {
      if (!brain) return;
      brain.go(path);
      this.setState({ q: "", hits: [] });
    };
    const go = (path: string) => brain && brain.go(path);
    const manage = (tab: "skills" | "routines") => this.setState({ manager: tab, page: null, settings: null });

    // --- A barra: as vistas ---
    const tab = (key: View) => {
      const on = s.view === key;
      return {
        on,
        style: css(
          `display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 11px 0 9px; border: 0; border-radius: 8px; font: inherit; font-weight: 500; white-space: nowrap; cursor: pointer; background: ${
            on ? "oklch(1 0 0 / 11%)" : "transparent"
          }; color: ${on ? "oklch(0.96 0.006 85)" : "oklch(0.74 0.012 268)"}; box-shadow: ${on ? "inset 0 0 0 1px oklch(1 0 0 / 10%), 0 1px 2px oklch(0 0 0 / 35%)" : "none"}`,
        ),
        go: () => brain && brain.mode(key),
      };
    };

    // --- O cartão do item escolhido ---
    const info = s.sel;
    let card = null;
    if (info) {
      const root = info.kind === "dept" || info.kind === "core";
      const color = tint(info);
      const rows: { key: string; value: string; face: string; size: string }[] = [];
      const row = (key: string, value: string, face = "inherit", size = "inherit") => rows.push({ key, value, face, size });
      if (!root && info.kind !== "app") row("Departamento", info.areaLabel);
      if (info.note) row("Agenda", info.note);
      if (info.tag) row("Conexão", info.tag);
      if (info.folder) row("Conteúdo", plural(info.pages, "página", "páginas"));
      if (info.kind !== "app") row("Caminho", short(info.path), "var(--font-mono)", "11.5px");
      const icon = info.kind === "core" ? "company" : info.kind === "dept" ? info.path : info.kind;
      card = (
        <aside
          aria-label="Detalhes"
          className="b-card b-scroll"
          style={css(
            "flex: 0 1 auto; min-height: 0; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 88%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 24px 60px oklch(0 0 0 / 50%); pointer-events: auto; animation: b-rise 0.22s ease-out",
          )}
        >
          <div style={css("display: flex; align-items: flex-start; gap: 11px; padding: 14px 10px 12px 14px")}>
            <span
              style={css(
                `flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: ${color}; background: color-mix(in oklch, ${color} 14%, transparent); border: 1px solid color-mix(in oklch, ${color} 34%, transparent)`,
              )}
            >
              <KindIcon name={icon} />
            </span>
            <div style={css("flex: 1; min-width: 0; padding-top: 1px")}>
              <h2 style={css("margin: 0; font-size: 14px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere")}>{info.label}</h2>
              <div style={css("margin-top: 2px; font-size: 12px; color: oklch(0.74 0.012 268)")}>{info.kind === "app" ? info.desc : info.kind === "core" ? "O centro do cérebro" : kinds[info.kind]}</div>
            </div>
            <button
              className="b-btn b-ghost"
              aria-label="Fechar detalhes"
              onClick={() => brain && brain.escape()}
              style={css("flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
            >
              <Close />
            </button>
          </div>
          <div style={css("display: flex; flex-direction: column; gap: 9px; padding: 0 14px 14px; font-size: 12.5px")}>
            {rows.map((r) => (
              <div key={r.key} style={css("display: flex; align-items: baseline; gap: 10px")}>
                <span style={css("flex: none; width: 92px; color: oklch(0.74 0.012 268)")}>{r.key}</span>
                <span style={css(`flex: 1; min-width: 0; overflow-wrap: anywhere; font-family: ${r.face}; font-size: ${r.size}`)}>{r.value}</span>
              </div>
            ))}
          </div>
          <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 14px 14px")}>
            {(info.kind === "page" || info.kind === "skill" || info.kind === "routine") && (
              <button className="b-btn b-main" onClick={() => this.read(info)} style={css(MAIN)}>
                Ver aqui
              </button>
            )}
            {info.folder && !root && info.inside > 0 && (
              <button className="b-btn b-main" onClick={() => brain && brain.toggle(info.path)} style={css(MAIN)}>
                {info.open ? "Recolher" : "Expandir"}
              </button>
            )}
            {root && graph && (
              <button className="b-btn b-main" onClick={() => brain && brain.focus(info.path)} style={css(MAIN)}>
                Abrir
              </button>
            )}
            {(info.kind === "skill" || info.kind === "routine") && (
              <button className="b-btn b-solid" title="Rodar no Claude" onClick={() => this.run(info)} style={css(SOLID)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l12.5-7.5z"></path>
                </svg>
                Rodar
              </button>
            )}
            <button className="b-btn b-solid" onClick={() => brain && brain.fly(info.path)} style={css(SOLID)}>
              <Svg size={14}>
                <path d="M3 11 21 3l-8 18-2-8z"></path>
              </Svg>
              Ir até
            </button>
            {info.kind !== "app" && (
              <>
                <button className="b-btn b-solid" aria-label="Abrir no dispositivo" title="Abrir no dispositivo" onClick={() => this.device(info.path)} style={css(SQUARE)}>
                  <External />
                </button>
                <button className="b-btn b-solid" aria-label="Copiar caminho" title="Copiar caminho" onClick={() => this.copy(info.path)} style={css(SQUARE)}>
                  <Copy />
                </button>
              </>
            )}
            {info.kind === "routine" && (
              <button className="b-btn b-solid" aria-label="Editar" title="Editar" onClick={() => this.device(info.path, "Abrindo para editar")} style={css(SQUARE)}>
                <Svg size={14}>
                  <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"></path>
                </Svg>
              </button>
            )}
            {!root && (
              <button
                className="b-btn b-risk"
                aria-label="Tirar do mapa"
                title="Tirar do mapa"
                onClick={() => this.setState({ asking: info })}
                style={css("display: grid; place-items: center; width: 30px; height: 30px; margin-left: auto; border: 0; border-radius: 8px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer")}
              >
                <Svg size={14}>
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path>
                </Svg>
              </button>
            )}
          </div>
          {info.total > 0 && (
            <div style={css("padding: 10px 6px 6px; border-top: 1px solid oklch(1 0 0 / 8%)")}>
              <div style={css("display: flex; align-items: center; gap: 6px; padding: 0 8px 6px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>
                Conexões<span style={css(`${MONO}; font-size: 11px`)}>{info.total}</span>
              </div>
              {info.conns.map((item) => (
                <button
                  key={item.path}
                  className="b-btn b-row"
                  onClick={jump(item.path)}
                  style={css(
                    "display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer",
                  )}
                >
                  <span style={css(`flex: none; width: 7px; height: 7px; border-radius: 99px; background: ${tint(item)}`)}></span>
                  <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{item.label}</span>
                  <span style={css("flex: none; font-size: 11.5px; color: oklch(0.7 0.012 268)")}>{kinds[item.kind]}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      );
    }

    // --- A etiqueta ---
    const over = s.tip;
    const tip = over
      ? {
          label: over.label,
          color: tint(over),
          sub: over.kind === "app" ? over.desc : [kinds[over.kind], over.kind === "dept" || over.kind === "core" ? "" : over.areaLabel, over.note].filter(Boolean).join(" · "),
          hint: over.folder && over.kind === "folder" ? plural(over.pages, "página", "páginas") + " · clique para " + (over.open ? "recolher" : "expandir") : "Clique para ver os detalhes",
        }
      : { label: "", color: "transparent", sub: "", hint: "" };

    // --- A legenda: o que cada sinal é, e o que fica à mostra ---
    const filter = (layersOff: Record<string, boolean>, areasOff: Record<string, boolean>) => {
      this.setState({ layersOff, areasOff });
      if (!brain) return;
      const on = (off: Record<string, boolean>) => Object.fromEntries(Object.entries(off).map(([key, value]) => [key, !value]));
      brain.filter({ layers: on(layersOff), areas: on(areasOff) });
    };
    const layer = (key: string, label: string, shape: { size?: string; round?: string; clip?: string; turn?: string; edge?: string; fill: string }) => {
      const off = !!s.layersOff[key];
      const look = { size: "9px", round: "99px", clip: "none", turn: "none", edge: "0 solid transparent", ...shape };
      return (
        <button
          key={key}
          className="b-btn b-row"
          aria-pressed={!off}
          onClick={() => filter({ ...s.layersOff, [key]: !off }, s.areasOff)}
          style={css(
            `display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer; opacity: ${off ? 0.42 : 1}`,
          )}
        >
          <span aria-hidden="true" style={css("flex: none; display: grid; place-items: center; width: 13px; height: 13px")}>
            <span
              style={css(
                `display: block; box-sizing: border-box; width: ${look.size}; height: ${look.size}; border-radius: ${look.round}; clip-path: ${look.clip}; transform: ${look.turn}; background: ${look.fill}; border: ${look.edge}`,
              )}
            ></span>
          </span>
          <span style={css("flex: 1")}>{label}</span>
          <span style={css(`${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{counts.layers[key]}</span>
          <Check hidden={off} />
        </button>
      );
    };

    const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
      // Esc fecha o que estiver por cima, do mais recente para o mais antigo.
      if (event.key === "Escape") {
        if (s.askingNote) this.setState({ askingNote: false });
        else if (s.asking) this.setState({ asking: null });
        else if (s.note) this.closeNote();
        else if (s.settings) this.setState({ settings: null });
        else if (s.q) this.setState({ q: "", hits: [] });
        else if (s.manager) this.setState({ manager: null });
        else if (s.page) this.setState({ page: null });
        else if (brain) brain.escape();
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (s.note || s.asking || event.metaKey || event.ctrlKey || event.altKey) return;
      // A vírgula abre e fecha o Personalizar; com ele aberto, os outros atalhos esperam.
      if (event.key === ",") {
        event.preventDefault();
        this.toggleSettings();
        return;
      }
      if (s.settings) return;
      // N abre uma nota nova de qualquer lugar.
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        this.newNote();
        return;
      }
      if (!brain) return;
      if (event.key === "/") {
        event.preventDefault();
        if (this.searchBox) this.searchBox.focus();
      }
      if (event.key === "ArrowLeft") brain.step(-1);
      if (event.key === "ArrowRight") brain.step(1);
    };

    const views: [View, string, JSX.Element][] = [
      [
        "depts",
        "Departamentos",
        <>
          <circle cx="12" cy="12" r="3"></circle>
          <circle cx="5" cy="6" r="2"></circle>
          <circle cx="19" cy="6" r="2"></circle>
          <circle cx="12" cy="20" r="2"></circle>
          <path d="M6.6 7.4 9.6 10M17.4 7.4 14.4 10M12 15v3"></path>
        </>,
      ],
      [
        "rings",
        "Anéis",
        <>
          <circle cx="12" cy="12" r="9"></circle>
          <circle cx="12" cy="12" r="5"></circle>
          <circle cx="12" cy="12" r="1"></circle>
        </>,
      ],
      [
        "force",
        "Força",
        <>
          <circle cx="6" cy="7" r="2"></circle>
          <circle cx="17" cy="5" r="2"></circle>
          <circle cx="13" cy="13" r="2"></circle>
          <circle cx="6" cy="18" r="2"></circle>
          <circle cx="19" cy="18" r="2"></circle>
          <path d="M7.5 8.4 11.5 11.7M16.2 6.8 13.9 11.2M11.3 14.1 7.7 16.9M14.6 14.2 17.5 16.7"></path>
        </>,
      ],
    ];

    const finding = !!s.q.trim();
    const clock = <Clock opts={s.home.clock} onClick={() => this.openSettings("clock")} edge={s.home.clock.side === "right"} />;
    const shelf = s.notes.filter((note) => !(s.home.archive && note.status === "enviada")).sort((a, b) => b.updatedAt - a.updatedAt);
    const open = this.current();
    const toolsHigh = s.home.toolNames ? 96 : 86;

    return (
      <div
        ref={this.bindRoot}
        tabIndex={0}
        onKeyDown={onKey}
        style={css(
          "position: relative; width: 100%; height: 100vh; overflow: hidden; outline: none; background: oklch(0.135 0.008 268); color: oklch(0.94 0.006 85); font-family: Geist, system-ui, sans-serif; font-size: 13px; line-height: 1.35",
        )}
      >
        <canvas ref={this.bindCanvas} aria-label="Mapa do cérebro" style={css("position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; touch-action: none")}></canvas>

        <header
          style={css(
            "position: absolute; left: 0; right: 0; top: 0; display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px 12px; padding: 14px 16px 0; pointer-events: none",
          )}
        >
          <div style={css("display: flex; align-items: center; gap: 10px; min-width: 0; max-width: 100%")}>
            {show.clock && s.home.clock.side === "left" && clock}
            {show.views && (
              <nav
                aria-label="Visualização"
                className="b-scroll"
                style={css(
                  `display: flex; min-width: 0; gap: 2px; max-width: 100%; box-sizing: border-box; padding: 3px; overflow-x: auto; border-radius: 11px; background: oklch(0.19 0.008 268 / 80%); ${GLASS}; pointer-events: auto`,
                )}
              >
                {views.map(([key, label, glyph]) => {
                  const t = tab(key);
                  return (
                    <button key={key} className="b-btn b-seg" aria-pressed={t.on} title={label} onClick={t.go} style={t.style}>
                      <Svg>{glyph}</Svg>
                      <span className="b-word">{label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          <div style={css("position: relative; display: flex; align-items: flex-start; gap: 8px; max-width: 100%; pointer-events: auto")}>
            {show.search && (
              <div style={css("position: relative; min-width: 0")}>
                <label
                  className="b-field"
                  style={css(
                    `display: flex; align-items: center; gap: 8px; width: 248px; max-width: 100%; height: 38px; box-sizing: border-box; padding: 0 8px 0 11px; border-radius: 11px; background: oklch(0.19 0.008 268 / 80%); ${GLASS}; color: oklch(0.74 0.012 268); cursor: text; transition: border-color 0.15s ease`,
                  )}
                >
                  <Svg style={{ flex: "none" }}>
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="m20 20-3.5-3.5"></path>
                  </Svg>
                  <input
                    ref={this.bindSearch}
                    type="text"
                    value={s.q}
                    onChange={(event) => {
                      const q = event.target.value;
                      this.setState({ q, hits: brain ? brain.search(q) : [] });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && s.hits[0]) jump(s.hits[0].path)();
                    }}
                    placeholder="Buscar no cérebro"
                    aria-label="Buscar no cérebro"
                    style={css("flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: none; background: transparent; color: oklch(0.94 0.006 85); font: inherit")}
                  />
                  <kbd
                    className="b-kbd"
                    style={css(
                      `flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; border: 1px solid oklch(1 0 0 / 11%); background: oklch(1 0 0 / 5%); ${MONO}; font-size: 11px; color: oklch(0.74 0.012 268)`,
                    )}
                  >
                    /
                  </kbd>
                </label>
                {finding && (
                  <div
                    role="listbox"
                    aria-label="Resultados"
                    className="b-scroll"
                    style={css(
                      "position: absolute; top: 44px; right: 0; width: 340px; max-width: calc(100vw - 32px); max-height: 360px; overflow-y: auto; box-sizing: border-box; padding: 5px; border-radius: 12px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 96%); backdrop-filter: blur(20px); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 20px 50px oklch(0 0 0 / 50%); animation: b-pop 0.16s ease-out",
                    )}
                  >
                    {s.hits.map((hit) => (
                      <button
                        key={hit.path}
                        className="b-btn b-row"
                        role="option"
                        onClick={jump(hit.path)}
                        style={css(
                          "display: flex; align-items: center; gap: 9px; width: 100%; height: 34px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer",
                        )}
                      >
                        <span style={css(`flex: none; width: 7px; height: 7px; border-radius: 99px; background: ${tint(hit)}`)}></span>
                        <span style={css("flex: none; max-width: 58%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>{hit.label}</span>
                        <span style={css("flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: right; font-size: 12px; color: oklch(0.7 0.012 268)")}>
                          {hit.kind === "app" ? "Aplicação" : hit.areaLabel + " · " + kinds[hit.kind]}
                        </span>
                      </button>
                    ))}
                    {!s.hits.length && <div style={css("padding: 10px 9px; font-size: 12.5px; color: oklch(0.74 0.012 268)")}>Nada com esse nome no cérebro.</div>}
                  </div>
                )}
              </div>
            )}

            <button
              className="b-btn b-solid"
              aria-haspopup="dialog"
              title="Personalizar (,)"
              onClick={() => this.toggleSettings()}
              style={css(
                `flex: none; display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 13px 0 11px; border-radius: 11px; background: ${
                  s.settings ? "oklch(0.25 0.008 268 / 90%)" : "oklch(0.19 0.008 268 / 80%)"
                }; ${GLASS}; color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer`,
              )}
            >
              <Svg>
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path>
                <circle cx="16" cy="7" r="2"></circle>
                <circle cx="10" cy="17" r="2"></circle>
              </Svg>
              <span className="b-word">Personalizar</span>
            </button>
            {show.clock && s.home.clock.side === "right" && clock}
          </div>

          {show.title && (
            <div
              className="b-title"
              style={css("position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; text-align: center; pointer-events: none")}
            >
              <div style={css("display: flex; align-items: center; height: 22px")}>
                {!graph && !!s.focus && (
                  <button
                    className="b-btn b-ghost"
                    onClick={() => brain && brain.focus(null)}
                    style={css(
                      "display: flex; align-items: center; gap: 3px; height: 22px; padding: 0 9px 0 5px; border: 0; border-radius: 99px; background: transparent; color: oklch(0.74 0.012 268); font: inherit; font-size: 12px; cursor: pointer; pointer-events: auto",
                    )}
                  >
                    <Svg size={13} weight={2}>
                      <path d="m15 18-6-6 6-6"></path>
                    </Svg>
                    Visão geral
                  </button>
                )}
              </div>
              <div style={css("display: flex; align-items: center; gap: 2px; margin-top: 2px")}>
                <button
                  className="b-btn b-ghost"
                  aria-label="Departamento anterior"
                  onClick={() => brain && brain.step(-1)}
                  style={css(
                    `display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 99px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer; pointer-events: auto; visibility: ${
                      graph ? "hidden" : "visible"
                    }`,
                  )}
                >
                  <Svg size={16} weight={2}>
                    <path d="m15 18-6-6 6-6"></path>
                  </Svg>
                </button>
                <h1 style={css("margin: 0; min-width: 160px; font-size: 15px; font-weight: 600; letter-spacing: 0.34em; text-indent: 0.34em; text-transform: uppercase")}>{head.title}</h1>
                <button
                  className="b-btn b-ghost"
                  aria-label="Próximo departamento"
                  onClick={() => brain && brain.step(1)}
                  style={css(
                    `display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 99px; background: transparent; color: oklch(0.74 0.012 268); cursor: pointer; pointer-events: auto; visibility: ${
                      graph ? "hidden" : "visible"
                    }`,
                  )}
                >
                  <Svg size={16} weight={2}>
                    <path d="m9 18 6-6-6-6"></path>
                  </Svg>
                </button>
              </div>
              <div style={css("display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; margin-top: 2px; font-size: 12px; color: oklch(0.74 0.012 268)")}>
                {head.legend.map((part) => (
                  <span key={part.text} style={css("display: flex; align-items: center; gap: 6px")}>
                    <span style={css(`width: 6px; height: 6px; border-radius: 99px; background: ${part.color}`)}></span>
                    {part.text}
                  </span>
                ))}
                <span>{head.summary}</span>
              </div>
            </div>
          )}
        </header>

        <div
          className="b-left"
          style={css("position: absolute; left: 16px; top: 112px; bottom: 16px; width: 308px; max-width: calc(100% - 32px); display: flex; flex-direction: column; gap: 12px; pointer-events: none")}
        >
          {card}
          {show.skills && (
            <SkillsWidget
              cat={cat}
              favs={s.home.favs}
              nextCount={s.home.nextCount}
              now={s.now}
              runs={s.runs.filter((run) => run.kind !== "nota")}
              run={this.run}
              openRun={this.openRun}
              dismissRun={this.dismissRun}
              go={go}
              manage={manage}
              customize={() => this.openSettings("skills")}
            />
          )}
        </div>

        {show.notes && (
          <div
            className="b-right"
            style={css(
              `position: absolute; right: 16px; bottom: ${show.legendBar ? "66px" : "16px"}; width: 300px; max-width: calc(100% - 32px); max-height: calc(100% - 200px); display: flex; flex-direction: column; justify-content: flex-end; pointer-events: none; opacity: ${
                s.legend ? 0 : 1
              }; visibility: ${s.legend ? "hidden" : "visible"}; transition: opacity 0.15s ease, visibility 0.15s`,
            )}
          >
            <NotesWidget notes={shelf} runs={s.runs} now={s.now} open={this.openNote} process={this.processNote} add={this.newNote} />
          </div>
        )}

        {show.legendBar && (
          <div style={css("position: absolute; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; max-width: calc(100% - 32px); pointer-events: none")}>
            {s.legend && (
              <section
                aria-label="Legenda"
                className="b-scroll"
                style={css(
                  "width: 236px; max-width: 100%; max-height: min(64vh, 540px); overflow-y: auto; box-sizing: border-box; padding: 6px; border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 88%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 24px 60px oklch(0 0 0 / 50%); pointer-events: auto; animation: b-rise 0.2s ease-out",
                )}
              >
                <div style={css("display: flex; align-items: baseline; justify-content: space-between; padding: 6px 8px 5px; font-size: 12px; color: oklch(0.74 0.012 268)")}>
                  <span style={css("font-weight: 500")}>Camadas</span>
                  <span style={css("font-size: 11.5px")}>clique para filtrar</span>
                </div>
                {layer("A", "Aplicações", { size: "12px", round: "0", clip: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)", fill: "var(--brain-app)" })}
                {layer("S", "Skills", { size: "8px", round: "1px", turn: "rotate(45deg)", fill: "var(--foreground)" })}
                {layer("M", "Memória", { fill: "var(--area-empresa)" })}
                <div style={css("height: 1px; margin: 6px 2px; background: oklch(1 0 0 / 8%)")}></div>
                <div style={css("padding: 4px 8px 5px; font-size: 12px; font-weight: 500; color: oklch(0.74 0.012 268)")}>Departamentos</div>
                {tree.map((area) => {
                  const off = !!s.areasOff[area.path];
                  return (
                    <button
                      key={area.path}
                      className="b-btn b-row"
                      aria-pressed={!off}
                      onClick={() => filter(s.layersOff, { ...s.areasOff, [area.path]: !off })}
                      style={css(
                        `display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: oklch(0.94 0.006 85); font: inherit; text-align: left; cursor: pointer; opacity: ${
                          off ? 0.42 : 1
                        }`,
                      )}
                    >
                      <span style={css(`flex: none; width: 8px; height: 8px; margin: 0 2.5px; border-radius: 99px; background: var(--area-${area.path})`)}></span>
                      <span style={css("flex: 1")}>{area.label}</span>
                      <span style={css(`${MONO}; font-size: 11.5px; color: oklch(0.74 0.012 268)`)}>{counts.areas[area.path]}</span>
                      <Check hidden={off} />
                    </button>
                  );
                })}
              </section>
            )}
            <div style={css("display: flex; gap: 8px; pointer-events: auto")}>
              <button
                className="b-btn b-solid"
                aria-expanded={s.legend}
                onClick={() => this.setState({ legend: !s.legend })}
                style={css(
                  `display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 13px 0 11px; border-radius: 11px; background: ${
                    s.legend ? "oklch(0.25 0.008 268 / 90%)" : "oklch(0.19 0.008 268 / 80%)"
                  }; ${GLASS}; color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer`,
                )}
              >
                <Svg>
                  <path d="m12 3 9 5-9 5-9-5z"></path>
                  <path d="m3 13 9 5 9-5"></path>
                </Svg>
                Legenda
              </button>
              {/* Expandir e recolher são ações no mapa: ficam junto do Recentrar, num botão só. */}
              <button
                className="b-btn b-solid"
                aria-label="Expandir todas as pastas"
                aria-pressed={s.expanded}
                title={s.expanded ? "Recolher todas as pastas" : "Expandir todas as pastas"}
                onClick={() => {
                  this.setState({ expanded: !s.expanded });
                  if (brain) brain.expand(!s.expanded);
                }}
                style={css(
                  `display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: ${
                    s.expanded ? "oklch(0.25 0.008 268 / 90%)" : "oklch(0.19 0.008 268 / 80%)"
                  }; ${GLASS}; color: oklch(0.94 0.006 85); cursor: pointer`,
                )}
              >
                <Svg>
                  <path d={s.expanded ? "M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" : "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"}></path>
                </Svg>
              </button>
              <button
                className="b-btn b-solid"
                aria-label="Recentrar o mapa"
                title="Recentrar o mapa"
                onClick={() => brain && brain.recenter()}
                style={css(`display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: oklch(0.19 0.008 268 / 80%); ${GLASS}; color: oklch(0.94 0.006 85); cursor: pointer`)}
              >
                <Svg>
                  <circle cx="12" cy="12" r="7"></circle>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 12h.01"></path>
                </Svg>
              </button>
            </div>
          </div>
        )}

        {show.tools && <Dock tools={s.home.tools} names={s.home.toolNames} edit={() => this.openSettings("tools")} manager={() => manage("skills")} note={this.newNote} />}

        <div
          ref={this.bindTip}
          role="tooltip"
          style={css(
            `position: absolute; left: 0; top: 0; max-width: 264px; box-sizing: border-box; padding: 8px 10px 9px; border-radius: 10px; border: 1px solid oklch(1 0 0 / 11%); background: oklch(0.2 0.008 268 / 96%); box-shadow: 0 12px 32px oklch(0 0 0 / 50%); pointer-events: none; font-size: 12px; opacity: ${
              over && graph ? 1 : 0
            }; transition: opacity 0.12s ease`,
          )}
        >
          <div style={css(`font-size: 12.5px; font-weight: 600; color: ${tip.color}`)}>{tip.label}</div>
          <div style={css("margin-top: 1px; color: oklch(0.82 0.01 268)")}>{tip.sub}</div>
          <div style={css("margin-top: 3px; font-size: 11.5px; color: oklch(0.7 0.012 268)")}>{tip.hint}</div>
        </div>

        {s.page && (
          <Reader
            key={s.page.path}
            page={s.page}
            crumb={(s.page.areaLabel ? s.page.areaLabel + " / " : "") + kinds[s.page.kind]}
            kind={kinds[s.page.kind] + (s.page.note ? " · " + s.page.note : "")}
            color={tint(s.page)}
            path={short(s.page.path)}
            device={() => this.device(s.page!.path)}
            copy={() => this.copy(s.page!.path)}
            close={() => this.setState({ page: null })}
            follow={this.follow}
          />
        )}

        {s.manager && (
          <Manager
            cat={cat}
            tab={s.manager}
            favs={s.home.favs}
            now={s.now}
            setTab={(manager) => this.setState({ manager })}
            toggleFav={this.toggleFav}
            run={(item: Runnable) => this.run(item)}
            go={go}
            close={() => this.setState({ manager: null })}
            customize={() => this.openSettings("skills")}
          />
        )}

        {s.settings && (
          <Settings
            tab={s.settings}
            setTab={(settings) => this.setState({ settings, lastTab: settings })}
            close={() => this.setState({ settings: null })}
            reset={this.reset}
            home={s.home}
            patch={this.patch}
            map={{ view: s.view, group: s.group, names: s.names, spin: s.spin, springs: s.springs }}
            setMap={this.setMap}
            removed={s.removed}
            restore={this.restoreRemoved}
            cat={cat}
            manage={() => manage("skills")}
          />
        )}

        {open && (
          <NoteDialog
            key={open.id}
            note={open}
            now={s.now}
            mode={s.noteMode}
            focus={s.noteFocus}
            setMode={(noteMode) => this.setState({ noteMode })}
            edit={this.editNote}
            close={this.closeNote}
            remove={this.deleteNote}
            process={() => this.processNote(open.id)}
            run={this.noteRun(open.id)}
            adjust={(text) => this.noteStep(open.id, "ajustar", text)}
            approve={() => this.noteStep(open.id, "gravar")}
            discard={() => this.discardNote(open.id)}
            dismiss={this.dismissRun}
          />
        )}

        {s.asking && (
          <div
            onClick={() => this.setState({ asking: null })}
            style={css("position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: oklch(0 0 0 / 45%); animation: b-rise 0.16s ease-out")}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="b-ask-title"
              aria-describedby="b-ask-text"
              onClick={(event) => event.stopPropagation()}
              style={css(
                "width: 340px; max-width: 100%; box-sizing: border-box; padding: 18px; border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 98%); box-shadow: 0 24px 60px oklch(0 0 0 / 55%); animation: b-pop 0.16s ease-out",
              )}
            >
              <h2 id="b-ask-title" style={css("margin: 0; font-size: 14px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere")}>
                Tirar “{s.asking.label}” do mapa?
              </h2>
              <p id="b-ask-text" style={css("margin: 8px 0 0; font-size: 12.5px; line-height: 1.45; color: oklch(0.8 0.012 268)")}>
                {s.asking.total > 0 && s.asking.kind === "folder" ? "O que está dentro dela também some do mapa. " : ""}O arquivo continua no computador. Para trazer de volta, use Personalizar › Mapa › Restaurar.
              </p>
              <div style={css("display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px")}>
                <button
                  className="b-btn b-solid"
                  autoFocus
                  onClick={() => this.setState({ asking: null })}
                  style={css("height: 32px; padding: 0 12px; border: 1px solid oklch(1 0 0 / 9%); border-radius: 8px; background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer")}
                >
                  Cancelar
                </button>
                <button
                  className="b-btn b-danger"
                  onClick={() => {
                    const path = s.asking!.path;
                    this.setState({ asking: null });
                    if (!brain) return;
                    save("tirados", [...new Set([...load<string[]>("tirados", []), path])]);
                    this.setState({ removed: brain.remove(path) });
                    this.say("Tirado do mapa. Nada foi apagado.");
                  }}
                  style={css("height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: oklch(0.62 0.19 22); color: oklch(0.99 0.006 85); font: inherit; font-weight: 600; cursor: pointer")}
                >
                  Tirar do mapa
                </button>
              </div>
            </div>
          </div>
        )}

        {s.askingNote && open && (
          <div
            onClick={() => this.setState({ askingNote: false })}
            style={css("position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: oklch(0 0 0 / 45%); animation: b-rise 0.16s ease-out")}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="b-ask-note-title"
              aria-describedby="b-ask-note-text"
              onClick={(event) => event.stopPropagation()}
              style={css(
                "width: 340px; max-width: 100%; box-sizing: border-box; padding: 18px; border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 98%); box-shadow: 0 24px 60px oklch(0 0 0 / 55%); animation: b-pop 0.16s ease-out",
              )}
            >
              <h2 id="b-ask-note-title" style={css("margin: 0; font-size: 14px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere")}>
                Apagar “{titled(open)}”?
              </h2>
              <p id="b-ask-note-text" style={css("margin: 8px 0 0; font-size: 12.5px; line-height: 1.45; color: oklch(0.8 0.012 268)")}>
                O rascunho sai da caixa e o arquivo é apagado. Logo depois, dá para desfazer.
              </p>
              <div style={css("display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px")}>
                <button
                  className="b-btn b-solid"
                  autoFocus
                  onClick={() => this.setState({ askingNote: false })}
                  style={css("height: 32px; padding: 0 12px; border: 1px solid oklch(1 0 0 / 9%); border-radius: 8px; background: oklch(1 0 0 / 6%); color: oklch(0.94 0.006 85); font: inherit; font-weight: 500; cursor: pointer")}
                >
                  Cancelar
                </button>
                <button
                  className="b-btn b-danger"
                  onClick={this.eraseNote}
                  style={css("height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: oklch(0.62 0.19 22); color: oklch(0.99 0.006 85); font: inherit; font-weight: 600; cursor: pointer")}
                >
                  Apagar
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={css(`position: absolute; left: 0; right: 0; bottom: ${show.tools ? toolsHigh : 20}px; z-index: 30; display: flex; justify-content: center; pointer-events: none`)}>
          {!!s.undo && (
            <div
              role="status"
              style={css(
                "display: flex; align-items: center; gap: 12px; max-width: calc(100% - 32px); padding: 6px 6px 6px 14px; border-radius: 99px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(0.22 0.008 268 / 96%); box-shadow: 0 14px 36px oklch(0 0 0 / 50%); font-weight: 500; pointer-events: auto; animation: b-rise 0.2s ease-out",
              )}
            >
              <span style={css("min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis")}>Nota apagada</span>
              <button
                className="b-btn b-solid"
                onClick={this.undoErase}
                style={css("flex: none; height: 26px; padding: 0 12px; border: 0; border-radius: 99px; background: oklch(0.94 0.006 85); color: oklch(0.18 0.008 268); font: inherit; font-weight: 600; cursor: pointer")}
              >
                Desfazer
              </button>
            </div>
          )}
          {!!s.toast && !s.undo && (
            <div
              role="status"
              style={css(
                "max-width: calc(100% - 32px); padding: 9px 14px; border-radius: 99px; border: 1px solid oklch(1 0 0 / 12%); background: oklch(0.22 0.008 268 / 96%); box-shadow: 0 14px 36px oklch(0 0 0 / 50%); font-weight: 500; animation: b-rise 0.2s ease-out",
              )}
            >
              {s.toast}
            </div>
          )}
        </div>
      </div>
    );
  }
}
