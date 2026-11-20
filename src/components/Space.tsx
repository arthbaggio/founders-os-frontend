// O Espaço: a página do Mission Control onde a pessoa pede um mini app numa barra e
// arruma os cartões como quiser. Cada cartão é um iframe isolado com o HTML que o
// Claude escreveu (server/widgets.ts); ele conversa com o painel pela ponte window.fos
// (dados salvos, tarefas e prioridades do cérebro). Arrastar pela barra do cartão move,
// o canto de baixo redimensiona, o lápis pede um ajuste.
import { useCallback, useEffect, useRef, useState } from "react";
import { css } from "../css";
import { Svg } from "./Icons";

type Widget = {
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
  updatedAt: string;
  edits: string[];
  color?: string;
};

const PANEL = "border-radius: 14px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(0.185 0.008 268 / 92%); backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 1px 0 oklch(1 0 0 / 5%) inset, 0 16px 40px oklch(0 0 0 / 40%)";
const SOFT = "oklch(0.74 0.012 268)";
const FAINT = "oklch(0.5 0.012 268)";
const GOLD = "oklch(0.86 0.12 85)";
const RED = "oklch(0.76 0.13 25)";
const GRID = 10;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.5;
const snap = (n: number) => Math.round(n / GRID) * GRID;
const IDEAS = ["Um to-do de conteúdo da semana, por canal", "Um calendário das lives e dos posts da turma 2", "Um painel com as metas da turma 2 e quanto falta", "Um quadro de ideias de vídeo com votação"];

// A ponte que vai dentro de cada mini app: chamadas viram mensagens para o painel.
const BRIDGE = `<script>(function(){var n=0,wait={};addEventListener("message",function(e){var m=e.data;if(!m||m.fosReply==null||!wait[m.fosReply])return;var w=wait[m.fosReply];delete wait[m.fosReply];m.error?w[1](new Error(m.error)):w[0](m.value);});function call(type){var args=[].slice.call(arguments,1);return new Promise(function(ok,no){var id=++n;wait[id]=[ok,no];parent.postMessage({fos:type,id:id,args:args},"*");});}window.fos={load:function(){return call("load")},save:function(v){return call("save",v)},tasks:function(){return call("tasks")},addTask:function(t){return call("addTask",t)},setDone:function(id,d){return call("setDone",id,d)},priorities:function(){return call("priorities")},openTask:function(id){return call("openTask",id)}};addEventListener("wheel",function(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();parent.postMessage({fosZoom:e.deltaY,x:e.clientX,y:e.clientY},"*")},{passive:false});})();</script>`;
// O modo de marcar: o painel pede, a pessoa clica numa parte do app, e o app devolve
// onde ela está (seletor), o HTML e o texto daquela parte. A parte fica contornada.
const PICKER = `<script>(function(){var on=false,last=null,st=document.createElement("style");st.textContent="[data-fos-hover]{outline:2px solid oklch(0.86 0.12 85)!important;outline-offset:2px!important;cursor:crosshair!important}[data-fos-marked]{outline:2px dashed oklch(0.86 0.12 85)!important;outline-offset:2px!important}";function clear(a){document.querySelectorAll("["+a+"]").forEach(function(x){x.removeAttribute(a)})}function path(el){var out=[];while(el&&el.nodeType===1&&el!==document.body&&out.length<8){var s=el.tagName.toLowerCase();if(el.id){out.unshift(s+"#"+el.id);break}var c=[].slice.call(el.classList).filter(function(k){return k.indexOf("fos")<0}).slice(0,2);if(c.length)s+="."+c.join(".");var p=el.parentElement;if(p){var same=[].filter.call(p.children,function(k){return k.tagName===el.tagName});if(same.length>1)s+=":nth-of-type("+(same.indexOf(el)+1)+")"}out.unshift(s);el=p}return out.join(" > ")}function over(e){if(last)last.removeAttribute("data-fos-hover");last=e.target;last.setAttribute("data-fos-hover","")}function click(e){e.preventDefault();e.stopPropagation();var el=e.target;stop();clear("data-fos-marked");el.setAttribute("data-fos-marked","");var h=el.outerHTML.replace(/ data-fos-(marked|hover)=""/g,"");parent.postMessage({fosPicked:{selector:path(el),html:h.slice(0,2500),text:(el.innerText||"").trim().slice(0,160)}},"*")}function key(e){if(e.key==="Escape"){stop();parent.postMessage({fosPicked:null},"*")}}function start(){if(on)return;on=true;(document.head||document.documentElement).appendChild(st);addEventListener("mouseover",over,true);addEventListener("click",click,true);addEventListener("keydown",key,true)}function stop(){on=false;if(last)last.removeAttribute("data-fos-hover");last=null;removeEventListener("mouseover",over,true);removeEventListener("click",click,true);removeEventListener("keydown",key,true)}addEventListener("message",function(e){var m=e.data;if(!m||m.fosPick==null)return;if(m.fosPick){(document.head||document.documentElement).appendChild(st);clear("data-fos-marked");start()}else{stop();clear("data-fos-marked")}})})();</script>`;
const withBridge = (html: string, accent: string) => {
  const vars = `<style>:root{--fos-accent:${accent}}</style>`;
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + vars + BRIDGE + PICKER);
  return vars + BRIDGE + PICKER + html;
};

async function json(url: string, body?: unknown) {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não deu certo");
  return data;
}

type Props = { openTask: (id: string) => void; changed: () => void };

export function Space({ openTask, changed }: Props) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [moving, setMoving] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  // A câmera do canvas infinito: deslocamento (x, y, em pixels da tela) e zoom.
  // Arrastar o fundo ou rolar move a câmera; Ctrl + roda (ou pinça) dá zoom no cursor.
  const [view, setViewState] = useState<{ x: number; y: number; zoom: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fos-space-view") || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && saved.zoom >= MIN_ZOOM && saved.zoom <= MAX_ZOOM) return saved;
    } catch {}
    return { x: 40, y: 100, zoom: 1 };
  });
  const viewRef = useRef(view);
  const setView = useCallback((next: { x: number; y: number; zoom: number }) => {
    viewRef.current = next;
    setViewState(next);
  }, []);
  // Guarda a câmera um pouco depois de ela parar.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("fos-space-view", JSON.stringify(view));
      } catch {}
    }, 300);
    return () => window.clearTimeout(timer);
  }, [view]);
  const zoom = view.zoom;
  // Zoom mantendo parado o ponto da tela sob o cursor (ou o meio).
  const zoomTo = useCallback(
    (wanted: number, at?: { x: number; y: number }) => {
      const box = area.current;
      const now = viewRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(wanted * 100) / 100));
      if (!box || next === now.zoom) return;
      const rect = box.getBoundingClientRect();
      const px = at ? at.x - rect.left : rect.width / 2;
      const py = at ? at.y - rect.top : rect.height / 2;
      setView({ zoom: next, x: px - ((px - now.x) * next) / now.zoom, y: py - ((py - now.y) * next) / now.zoom });
    },
    [setView],
  );
  const panBy = useCallback((dx: number, dy: number) => {
    const now = viewRef.current;
    setView({ ...now, x: now.x + dx, y: now.y + dy });
  }, [setView]);
  useEffect(() => {
    const box = area.current;
    if (!box) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) zoomTo(viewRef.current.zoom * Math.exp(-event.deltaY * 0.0025), { x: event.clientX, y: event.clientY });
      else panBy(-event.deltaX, -event.deltaY);
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => box.removeEventListener("wheel", wheel);
  }, [zoomTo, panBy]);
  // Arrastar o fundo (não um cartão) move a câmera.
  const [panning, setPanning] = useState(false);
  const pointer = useRef({ x: -999, y: -999, in: false });
  const pan = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest("section, form, button, [data-no-pan]")) return;
    event.preventDefault();
    const start = { px: event.clientX, py: event.clientY, x: viewRef.current.x, y: viewRef.current.y };
    setPanning(true);
    const move = (next: PointerEvent) => setView({ ...viewRef.current, x: start.x + next.clientX - start.px, y: start.y + next.clientY - start.py });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPanning(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // Ajustar: zoom e posição para todos os cartões caberem na tela.
  const fit = () => {
    const box = area.current;
    if (!box) return;
    if (!widgets.length) return setView({ x: 40, y: 100, zoom: 1 });
    const left = Math.min(...widgets.map((one) => one.x));
    const top = Math.min(...widgets.map((one) => one.y));
    const right = Math.max(...widgets.map((one) => one.x + one.w));
    const bottom = Math.max(...widgets.map((one) => one.y + one.h));
    const next = Math.floor(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((box.clientWidth - 80) / (right - left), (box.clientHeight - 190) / (bottom - top), 1))) * 100) / 100;
    // O topo (título e chaves) ocupa ~90px e a barra de pedido ~90px embaixo.
    setView({ zoom: next, x: (box.clientWidth - (right - left) * next) / 2 - left * next, y: 95 + Math.max(0, (box.clientHeight - 190 - (bottom - top) * next) / 2) - top * next });
  };

  const load = useCallback(() => {
    json("/api/space")
      .then((data) => {
        setWidgets(data.widgets);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);
  const busy = widgets.some((one) => one.status === "gerando");
  useEffect(() => {
    load();
    const timer = window.setInterval(load, busy ? 2000 : 10000);
    return () => window.clearInterval(timer);
  }, [load, busy]);

  const create = async (text: string) => {
    if (!text.trim()) return;
    setError("");
    const box = area.current;
    // O cartão novo nasce no meio do que está à vista, um pouco deslocado dos outros.
    const x = snap(((box?.clientWidth ?? 900) / 2 - view.x) / zoom - 210 + (widgets.length % 5) * 30);
    const y = snap(((box?.clientHeight ?? 600) / 2 - 40 - view.y) / zoom - 180 + (widgets.length % 5) * 30);
    try {
      const data = await json("/api/space", { prompt: text.trim(), x, y });
      setWidgets(data.widgets);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu certo");
    }
  };
  const patch = (id: string, box: Partial<Widget>) => setWidgets((list) => list.map((one) => (one.id === id ? { ...one, ...box } : one)));
  const saveLayout = (id: string, box: Partial<Widget>) => json(`/api/space/${id}/layout`, box).catch(() => null);
  const front = (id: string) => {
    const top = Math.max(0, ...widgets.map((one) => one.z));
    const one = widgets.find((item) => item.id === id);
    if (!one || one.z === top) return;
    patch(id, { z: top + 1 });
    saveLayout(id, { z: top + 1 });
  };


  return (
    <div style={css("position: relative; flex: 1; min-height: 0; margin: -80px -20px -18px")}>
      <div
        ref={area}
        onPointerDown={pan}
        className={moving || panning ? "m-moving" : undefined}
        style={css(
          `position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: ${panning ? "grabbing" : "grab"}; background: radial-gradient(ellipse at 50% 38%, oklch(1 0 0 / 4.5%), transparent 70%), var(--background, oklch(0.135 0.008 268))`,
        )}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, in: true };
        }}
        onPointerLeave={() => (pointer.current = { ...pointer.current, in: false })}
      >
        <Honeycomb view={view} pointer={pointer} />
        <div style={css("position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 45%, oklch(0.1 0.008 268 / 70%) 100%)")}></div>
        <div style={css(`position: absolute; left: 0; top: 0; width: 0; height: 0; transform: translate(${view.x}px, ${view.y}px) scale(${zoom}); transform-origin: 0 0`)}>
          {widgets.map((one) => (
            <Card
              key={one.id}
              widget={one}
              onFront={() => front(one.id)}
              onMove={(box) => patch(one.id, box)}
              onMoved={(box) => saveLayout(one.id, box)}
              onMoving={setMoving}
              onEdit={(request) => json(`/api/space/${one.id}/edit`, { request }).then((data) => setWidgets(data.widgets))}
              onRename={(title) => json(`/api/space/${one.id}/rename`, { title }).then((data) => setWidgets(data.widgets))}
              onDelete={() => json(`/api/space/${one.id}/delete`, {}).then((data) => setWidgets(data.widgets))}
              openTask={openTask}
              changed={changed}
              zoom={zoom}
              onZoomWheel={(delta, x, y) => zoomTo(viewRef.current.zoom * Math.exp(-delta * 0.0025), { x, y })}
            />
          ))}
        </div>

        {loaded && !widgets.length && (
          <div style={css("position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); width: min(520px, 90%); text-align: center")}>
            <div style={css("font-size: 15px; font-weight: 600")}>Seu espaço está vazio</div>
            <div style={css(`margin-top: 6px; font-size: 12.5px; line-height: 1.5; color: ${SOFT}`)}>Peça na barra abaixo o que você precisa. O Claude monta um mini app, ele fica salvo aqui e você arruma os cartões como quiser.</div>
            <div style={css("display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 16px")}>
              {IDEAS.map((idea) => (
                <button key={idea} className="b-btn c-act" onClick={() => setPrompt(idea)} style={css(PANEL + `; height: 30px; padding: 0 12px; border-radius: 99px; font: inherit; font-size: 12px; color: ${SOFT}; cursor: pointer`)}>
                  {idea}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* O zoom */}
      {widgets.length > 0 && (
        <div style={css(PANEL + "; position: absolute; right: 18px; bottom: 18px; z-index: 2000; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px")}>
          <ZoomButton label="Diminuir o zoom (Ctrl + roda)" onClick={() => zoomTo(zoom / 1.2)}>
            <path d="M5 12h14"></path>
          </ZoomButton>
          <button className="b-btn c-act" title="Voltar para 100%" onClick={() => zoomTo(1)} style={css(`min-width: 46px; height: 28px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; color: ${SOFT}; cursor: pointer`)}>
            {Math.round(zoom * 100)}%
          </button>
          <ZoomButton label="Aumentar o zoom (Ctrl + roda)" onClick={() => zoomTo(zoom * 1.2)}>
            <path d="M12 5v14M5 12h14"></path>
          </ZoomButton>
          <span style={css("width: 1px; height: 18px; margin: 0 3px; background: oklch(1 0 0 / 10%)")}></span>
          <button className="b-btn c-act" title="Mostrar todos os cartões" onClick={fit} style={css(`display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 12px; color: ${SOFT}; cursor: pointer`)}>
            <Svg size={13}>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>
            </Svg>
            Ajustar
          </button>
        </div>
      )}

      {/* A barra de pedido */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create(prompt);
        }}
        style={css("position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); width: min(640px, max(300px, calc(100% - 540px))); z-index: 2000")}
      >
        {error && <div style={css(`margin-bottom: 6px; text-align: center; font-size: 12px; color: ${RED}`)}>{error}</div>}
        <div style={css(PANEL + "; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 16px; border-radius: 16px")}>
          <span style={css(`display: grid; color: ${GOLD}`)}>
            <Svg size={16}>
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7L19 21l-.7-2-2-.7 2-.7z"></path>
            </Svg>
          </span>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Peça um app: um to-do de conteúdo, um calendário das lives, um painel de metas…"
            className="m-plain"
            style={css("flex: 1; min-width: 0; height: 36px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: oklch(0.95 0.006 85); outline: none")}
          />
          <button type="submit" className="b-btn" disabled={!prompt.trim()} style={css(`height: 34px; padding: 0 16px; border: 0; border-radius: 11px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; background: ${prompt.trim() ? GOLD : "oklch(1 0 0 / 7%)"}; color: ${prompt.trim() ? "oklch(0.2 0.02 85)" : FAINT}`)}>
            Criar
          </button>
        </div>
      </form>
    </div>
  );
}

type CardProps = {
  widget: Widget;
  onFront: () => void;
  onMove: (box: Partial<Widget>) => void;
  onMoved: (box: Partial<Widget>) => void;
  onMoving: (moving: boolean) => void;
  onEdit: (request: string) => Promise<unknown>;
  onRename: (title: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  openTask: (id: string) => void;
  changed: () => void;
  zoom: number;
  onZoomWheel: (delta: number, x: number, y: number) => void;
};

function Card({ widget, onFront, onMove, onMoved, onMoving, onEdit, onRename, onDelete, openTask, changed, zoom, onZoomWheel }: CardProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  // A parte do app que a pessoa marcou para mudar (e se está escolhendo agora).
  const [mark, setMark] = useState<{ selector: string; html: string; text: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const toFrame = (message: unknown) => frame.current?.contentWindow?.postMessage(message, "*");
  const stopEditing = () => {
    toFrame({ fosPick: 0 });
    setPicking(false);
    setMark(null);
    setEditing(null);
  };
  const [naming, setNaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // O HTML é buscado de novo quando o cartão termina de ser gerado ou ajustado.
  useEffect(() => {
    if (widget.status === "gerando") return;
    if (version === widget.updatedAt) return;
    fetch(`/api/space/${widget.id}/html`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setHtml(data?.html ?? null);
        setVersion(widget.updatedAt);
      })
      .catch(() => null);
  }, [widget.id, widget.status, widget.updatedAt, version, html]);

  // A ponte: o mini app pede, o painel responde.
  useEffect(() => {
    const listen = async (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = event.data;
      if (message && typeof message.fosZoom === "number") {
        const rect = frame.current.getBoundingClientRect();
        onZoomWheel(message.fosZoom, rect.left + message.x * (rect.width / frame.current.clientWidth), rect.top + message.y * (rect.height / frame.current.clientHeight));
        return;
      }
      if (message && "fosPicked" in message) {
        setPicking(false);
        if (message.fosPicked) setMark(message.fosPicked);
        return;
      }
      if (!message || typeof message.fos !== "string") return;
      const reply = (value: unknown, error?: string) => frame.current?.contentWindow?.postMessage({ fosReply: message.id, value, error }, "*");
      const [a, b] = Array.isArray(message.args) ? message.args : [];
      try {
        if (message.fos === "load") return reply((await json(`/api/space/${widget.id}/data`)).data);
        if (message.fos === "save") return reply((await json(`/api/space/${widget.id}/data`, { data: a })).ok);
        if (message.fos === "tasks") return reply((await json("/api/tasks")).tasks);
        if (message.fos === "priorities") return reply((await json("/api/journal")).priorities?.items ?? []);
        if (message.fos === "addTask") {
          const data = await json("/api/tasks", { title: String(a?.title ?? ""), area: String(a?.area ?? ""), due: String(a?.due ?? "") });
          changed();
          return reply(data.tasks.find((one: { id: string }) => one.id === data.id) ?? null);
        }
        if (message.fos === "setDone") {
          await json("/api/tasks/move", { id: String(a), status: b ? "feito" : "a-fazer" });
          changed();
          return reply(true);
        }
        if (message.fos === "openTask") {
          openTask(String(a));
          return reply(true);
        }
        reply(null, "Função desconhecida: " + message.fos);
      } catch (err) {
        reply(null, err instanceof Error ? err.message : "Não deu certo");
      }
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [widget.id, openTask, changed, onZoomWheel]);

  // Arrastar (pela barra) e redimensionar (pelo canto), com a grade de 10px.
  const drag = (event: React.PointerEvent, mode: "move" | "size") => {
    if ((event.target as HTMLElement).closest("button, input") && mode === "move") return;
    event.preventDefault();
    onFront();
    const start = { px: event.clientX, py: event.clientY, x: widget.x, y: widget.y, w: widget.w, h: widget.h };
    let last: Partial<Widget> = {};
    onMoving(true);
    const move = (next: PointerEvent) => {
      const dx = (next.clientX - start.px) / zoom;
      const dy = (next.clientY - start.py) / zoom;
      last = mode === "move" ? { x: snap(start.x + dx), y: snap(start.y + dy) } : { w: Math.max(240, snap(start.w + dx)), h: Math.max(160, snap(start.h + dy)) };
      onMove(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onMoving(false);
      if (Object.keys(last).length) onMoved(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const generating = widget.status === "gerando";
  return (
    <section
      onPointerDown={onFront}
      style={css(
        PANEL +
          `; position: absolute; left: ${widget.x}px; top: ${widget.y}px; width: ${widget.w}px; height: ${widget.h}px; z-index: ${widget.z}; display: flex; flex-direction: column; overflow: hidden; ${generating ? `border-color: color-mix(in oklch, ${GOLD} 35%, transparent)` : ""}`,
      )}
    >
      <header onPointerDown={(event) => drag(event, "move")} onDoubleClick={() => setNaming(widget.title)} style={css("flex: none; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 6px 0 12px; cursor: grab; user-select: none; border-bottom: 1px solid oklch(1 0 0 / 6%)")}>
        {naming !== null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRename(naming);
              setNaming(null);
            }}
            style={css("flex: 1; min-width: 0")}
          >
            <input autoFocus value={naming} onChange={(event) => setNaming(event.target.value)} onBlur={() => setNaming(null)} className="m-plain" style={css("width: 100%; height: 26px; border: 0; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: inherit; outline: none")} />
          </form>
        ) : (
          <h3 title={widget.prompt} style={css("flex: 1; min-width: 0; margin: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>
            {widget.title}
          </h3>
        )}
        {generating && (
          <span style={css(`display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: ${GOLD}; white-space: nowrap`)}>
            <span className="c-spin"></span>
            {widget.step || "Criando"}
          </span>
        )}
        {!generating && (
          <>
            <Tool label="Pedir um ajuste" onClick={() => (editing === null ? setEditing("") : stopEditing())}>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>
            </Tool>
            <Tool label="Recarregar" onClick={() => setReload((n) => n + 1)}>
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path>
            </Tool>
          </>
        )}
        <Tool label={confirm ? "Clique de novo para apagar" : "Apagar"} danger={confirm} onClick={() => (confirm ? onDelete() : setConfirm(true))} onBlur={() => setConfirm(false)}>
          <path d={confirm ? "M5 12l5 5 9-10" : "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"}></path>
        </Tool>
      </header>

      {editing !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!editing.trim()) return;
            const where = mark
              ? `

A mudança vale para esta parte do app, que a pessoa marcou (mexa só nela, a não ser que o pedido diga outra coisa):
Seletor: ${mark.selector}
Texto: ${mark.text || "(sem texto)"}
HTML da parte:
${mark.html}`
              : "";
            onEdit(editing.trim() + where);
            stopEditing();
          }}
          style={css("flex: none; display: flex; flex-direction: column; gap: 6px; padding: 8px 8px 8px 12px; border-bottom: 1px solid oklch(1 0 0 / 6%)")}
        >
          <div style={css("display: flex; gap: 6px")}>
            <button
              type="button"
              className="b-btn c-act"
              title="Clique e depois clique na parte do app que quer mudar"
              onClick={() => {
                if (picking) {
                  toFrame({ fosPick: 0 });
                  setPicking(false);
                  return;
                }
                setMark(null);
                setPicking(true);
                toFrame({ fosPick: 1 });
              }}
              style={css(`flex: none; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; border: 1px solid ${picking || mark ? `color-mix(in oklch, ${GOLD} 50%, transparent)` : "oklch(1 0 0 / 10%)"}; background: ${picking ? `color-mix(in oklch, ${GOLD} 14%, transparent)` : "transparent"}; color: ${picking || mark ? GOLD : SOFT}`)}
            >
              <Svg size={13}>
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path>
              </Svg>
              {picking ? "Cancelar" : "Marcar"}
            </button>
            <input
              autoFocus
              value={editing}
              onChange={(event) => setEditing(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), stopEditing())}
              placeholder={mark ? "O que mudar nesta parte?" : "O que mudar? Ex.: adicione uma coluna de prazo"}
              className="m-plain"
              style={css("flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid oklch(1 0 0 / 10%); background: oklch(1 0 0 / 4%); font: inherit; font-size: 12.5px; color: inherit; outline: none")}
            />
            <button type="submit" className="b-btn" style={css(`height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: ${GOLD}; font: inherit; font-size: 12px; font-weight: 600; color: oklch(0.2 0.02 85); cursor: pointer`)}>
              Ajustar
            </button>
          </div>
          {(picking || mark) && (
            <div style={css(`display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: ${picking ? GOLD : SOFT}`)}>
              {picking ? (
                "Clique na parte do app que você quer mudar (Esc cancela)"
              ) : (
                <>
                  <span style={css("flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>
                    Parte marcada: {mark!.text ? `“${mark!.text}”` : mark!.selector}
                  </span>
                  <button type="button" className="b-btn" onClick={() => (toFrame({ fosPick: 0 }), setMark(null))} style={css(`flex: none; border: 0; padding: 0; background: none; font: inherit; font-size: 11.5px; color: ${FAINT}; cursor: pointer`)}>
                    Tirar
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      )}

      <div style={css("position: relative; flex: 1; min-height: 0")}>
        {html !== null && (
          <iframe
            key={reload + version}
            ref={frame}
            title={widget.title}
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={withBridge(html, GOLD)}
            style={css(`position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: dark; opacity: ${generating ? 0.35 : 1}`)}
          />
        )}
        {html === null && (
          <div style={css("position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; text-align: center")}>
            {widget.status === "falhou" ? (
              <div style={css(`font-size: 12.5px; line-height: 1.5; color: ${RED}`)}>
                {widget.error || "Não deu para criar."}
                <div style={css(`margin-top: 6px; color: ${FAINT}`)}>Apague e peça de novo, de outro jeito.</div>
              </div>
            ) : (
              <div style={css(`font-size: 12.5px; line-height: 1.5; color: ${SOFT}`)}>
                <span className="c-spin" style={css("width: 16px; height: 16px; margin-bottom: 10px")}></span>
                <div>O Claude está montando o app.</div>
                <div style={css(`margin-top: 4px; color: ${FAINT}`)}>“{widget.prompt}”</div>
              </div>
            )}
          </div>
        )}
        {widget.error && widget.status === "pronto" && <div style={css(`position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 6px 10px; border-radius: 8px; background: oklch(0.2 0.03 25 / 92%); font-size: 11.5px; color: ${RED}`)}>Ajuste não aplicado: {widget.error}</div>}
      </div>

      <span
        aria-label="Redimensionar"
        onPointerDown={(event) => drag(event, "size")}
        style={css(`position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, oklch(1 0 0 / 18%) 50%, oklch(1 0 0 / 18%) 60%, transparent 60%, transparent 72%, oklch(1 0 0 / 18%) 72%, oklch(1 0 0 / 18%) 82%, transparent 82%)`)}
      ></span>
    </section>
  );
}

function Tool({ label, onClick, onBlur, danger, children }: { label: string; onClick: () => void; onBlur?: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="b-btn c-act"
      aria-label={label}
      title={label}
      onClick={onClick}
      onBlur={onBlur}
      style={css(`flex: none; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: ${danger ? "oklch(0.76 0.13 25 / 16%)" : "transparent"}; color: ${danger ? RED : SOFT}; cursor: pointer`)}
    >
      <Svg size={13}>{children}</Svg>
    </button>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="b-btn c-act" aria-label={label} title={label} onClick={onClick} style={css(`display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: ${SOFT}; cursor: pointer`)}>
      <Svg size={14}>{children}</Svg>
    </button>
  );
}

// O fundo do Espaço: a mesma colmeia do mapa (src/brain/engine.js), mais clara no meio
// da tela e perto do cursor, andando um pouco menos que os cartões.
function Honeycomb({ view, pointer }: { view: { x: number; y: number; zoom: number }; pointer: React.MutableRefObject<{ x: number; y: number; in: boolean }> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    let frame = 0;
    let glow = 0;
    let last = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext("2d");
      if (!g) return;
      const dt = Math.min(100, now - last);
      last = now;
      const p = pointer.current;
      glow += ((p.in ? 1 : 0) - glow) * Math.min(1, dt / 300);
      const v = viewRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cell = Math.max(10, 24 * Math.pow(v.zoom, 0.7));
      const ox = v.x * 0.6;
      const oy = v.y * 0.6;
      const hs = cell * Math.sqrt(3);
      const vs = cell * 1.5;
      const half = hs / 2;
      const rise = cell / 2;
      const far = Math.hypot(w, h) / 2;
      const near = 200;
      const TIERS = 8;
      const tiers = Array.from({ length: TIERS }, () => new Path2D());
      for (let row = Math.floor(-oy / vs) - 1; row * vs + oy < h + cell; row++) {
        const cy = row * vs + oy;
        const shift = row & 1 ? half : 0;
        for (let col = Math.floor((-ox - shift) / hs) - 1; col * hs + ox + shift < w + hs; col++) {
          const cx = col * hs + ox + shift;
          let light = Math.max(0, 1 - (Math.hypot(cx - w / 2, cy - h / 2) / far) * 0.82);
          light *= light;
          const reach = Math.hypot(cx - p.x, cy - p.y);
          if (reach < near) light += (1 - reach / near) ** 2 * 0.75 * glow;
          if (light < 0.03) continue;
          const trace = tiers[Math.min(TIERS - 1, Math.floor(light * TIERS))];
          trace.moveTo(cx, cy - cell);
          trace.lineTo(cx + half, cy - rise);
          trace.lineTo(cx + half, cy + rise);
          trace.lineTo(cx, cy + cell);
        }
      }
      g.lineWidth = 1;
      g.lineJoin = "round";
      g.strokeStyle = "rgb(240, 238, 232)";
      tiers.forEach((trace, tier) => {
        g.globalAlpha = 0.016 + 0.12 * ((tier + 0.5) / TIERS);
        g.stroke(trace);
      });
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [pointer]);
  return <canvas ref={canvas} aria-hidden="true" style={css("position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none")} />;
}
