import type { BrainApp, BrainNode } from "../../server/scan";

export type Kind = "core" | "dept" | "folder" | "page" | "skill" | "routine" | "app";
export type View = "depts" | "rings" | "force";

// Um item, do jeito que o mapa conta para a tela.
export type Brief = {
  path: string;
  label: string;
  kind: Kind;
  note: string;
  area: string | null;
  areaLabel: string;
};

// O que o cartão mostra: o item e a quem ele se liga.
export type Info = Brief & {
  desc: string;
  tag: string;
  folder: boolean;
  open: boolean;
  inside: number;
  pages: number;
  total: number;
  conns: Brief[];
};

export type Hooks = {
  change?: (focus: string | null) => void;
  open?: (page: Info) => void;
  select?: (sel: Info | null) => void;
  mode?: (view: View) => void;
  hover?: (tip: Info | null) => void;
  point?: (x: number, y: number) => void;
  touch?: () => void;
};

export type Options = { names: boolean; spin: number; springs: number; group: "dept" | "folder" };
// O que fica por cima do mapa: a barra de baixo (foot) e os painéis dos lados, em px.
export type Insets = { foot: number; left: number; right: number };
export type Camera = { k: number; x: number; y: number };

export type Engine = {
  focus(path: string | null): void;
  look(path: string | null): void;
  step(by: number): void;
  escape(): void;
  mode(view: View): void;
  set(opts: Partial<Options & Insets>): void;
  filter(next: { layers: Record<string, boolean>; areas: Record<string, boolean> }): void;
  expand(flag: boolean): void;
  remove(path: string): number;
  restore(): void;
  go(path: string): void;
  fly(path: string): void;
  toggle(path: string): void;
  search(query: string): Brief[];
  recenter(): void;
  info(path: string): Info | null;
  camera(): Camera;
  stop(): void;
};

declare function startBrain(canvas: HTMLCanvasElement, tree: BrainNode[], hooks: Hooks, extras: BrainApp[], resume?: Camera | null): Engine;
export default startBrain;
