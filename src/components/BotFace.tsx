// O mascote do agente, o mesmo que ele tem no OpenBot.
//
// O OpenBot desenha os mascotes com o Bloub (@norbert_bodziony/bloub, licença MIT) e
// guarda em cada agente só um "seed". Do seed saem o corpo, a expressão e a cor: um
// hash FNV-1a de "<seed>:shape", "<seed>:expression" e "<seed>:color" escolhe nas
// listas do próprio Bloub. O corpo "goutte" não é usado; quem cair nele ganha outro.
// Um seed que termina em ":flat:<n>" é o estilo liso; os outros, a pelúcia.
//
// O Bloub é feito em SolidJS: aqui ele é montado num <span> e recebe as mudanças por
// sinais. Ele é carregado só quando o primeiro mascote aparece.
import { useEffect, useRef } from "react";

type Mood = "calmo" | "trabalhando";
type Props = { seed: string; hue: number | null; size: number; mood?: Mood; dim?: boolean };

const AUTOMATIC_COLORS = ["rouge", "orange", "ambre", "vert", "turquoise", "bleu", "violet", "rose"];
// As cores que a pessoa pode escolher no OpenBot (hue → cor).
const HUE_IDS: Record<number, string> = { 0: "rouge", 30: "orange", 55: "ambre", 150: "vert", 185: "turquoise", 215: "bleu", 280: "violet", 320: "rose" };
const HUE_HEX: Record<number, string> = { 100: "#8ece34", 245: "#5d67ee" };

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

type Bloub = {
  SHAPES: { id: string }[];
  EXPRESSIONS: { id: string }[];
  COLOR_BY_ID: Map<string, { hex: string }>;
  BloubBot: any;
  PlushBot: any;
  render: (code: () => any, el: Element) => () => void;
  createComponent: (component: any, props: any) => any;
  createSignal: <T>(value: T) => [() => T, (value: T) => void];
};
let loading: Promise<Bloub> | null = null;
function loadBloub(): Promise<Bloub> {
  loading ??= Promise.all([import("@norbert_bodziony/bloub"), import("@norbert_bodziony/bloub/plush"), import("@solidjs/web"), import("solid-js")]).then(([core, plush, web, solid]: any[]) => ({
    SHAPES: core.SHAPES,
    EXPRESSIONS: core.EXPRESSIONS,
    COLOR_BY_ID: core.COLOR_BY_ID,
    BloubBot: core.BloubBot,
    PlushBot: plush.PlushBot,
    render: web.render,
    createComponent: solid.createComponent ?? web.createComponent,
    createSignal: solid.createSignal,
  }));
  return loading;
}

function profile(lib: Bloub, seed: string, hue: number | null) {
  const shapes = lib.SHAPES.map((one) => one.id);
  let shape = shapes[stableIndex(`${seed}:shape`, shapes.length)];
  if (shape === "goutte") {
    const supported = shapes.filter((one) => one !== "goutte");
    shape = supported[stableIndex(`${seed}:shape:replacement`, supported.length)];
  }
  const expression = lib.EXPRESSIONS[stableIndex(`${seed}:expression`, lib.EXPRESSIONS.length)].id;
  const auto = lib.COLOR_BY_ID.get(AUTOMATIC_COLORS[stableIndex(`${seed}:color`, AUTOMATIC_COLORS.length)])?.hex ?? "#3b93f0";
  const color = hue === null ? auto : (HUE_HEX[hue] ?? lib.COLOR_BY_ID.get(HUE_IDS[hue] ?? "")?.hex ?? auto);
  return { shape, expression, color, flat: /:flat:\d+$/.test(seed) };
}

export function BotFace({ seed, hue, size, mood = "calmo", dim = false }: Props) {
  const big = Math.round(size * 1.5);
  const host = useRef<HTMLSpanElement>(null);
  const setters = useRef<{ setExpression: (value: string) => void; base: string } | null>(null);

  // Monta o mascote uma vez por seed; o humor só troca a expressão.
  useEffect(() => {
    let dispose: (() => void) | null = null;
    let alive = true;
    loadBloub()
      .then((lib) => {
        if (!alive || !host.current) return;
        const face = profile(lib, seed, hue);
        const [expression, setExpression] = lib.createSignal(mood === "trabalhando" ? "attentif" : face.expression);
        setters.current = { setExpression, base: face.expression };
        const Bot = face.flat ? lib.BloubBot : lib.PlushBot;
        host.current.textContent = "";
        dispose = lib.render(
          () =>
            lib.createComponent(Bot, {
              size: big,
              shape: face.shape,
              color: face.color,
              get expression() {
                return expression();
              },
              ariaLabel: "",
              fps: 30,
            }),
          host.current,
        );
      })
      .catch((error) => console.warn("Mascote do OpenBot não carregou:", error));
    return () => {
      alive = false;
      dispose?.();
      setters.current = null;
    };
  }, [seed, hue, size]);

  useEffect(() => {
    const now = setters.current;
    if (now) now.setExpression(mood === "trabalhando" ? "attentif" : now.base);
  }, [mood]);

  // O desenho do Bloub deixa margem em volta do corpo: ele é desenhado maior e centrado,
  // para o corpo ocupar o espaço do avatar.
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "block", width: size, height: size, opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(0.6)" : "none" }}>
      <span ref={host} style={{ position: "absolute", left: (size - big) / 2, top: (size - big) / 2, width: big, height: big, pointerEvents: "none" }} />
    </span>
  );
}
