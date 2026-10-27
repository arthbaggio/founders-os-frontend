// As molas do arrasto nas vistas soltas (Anéis e Força).
//
// O layout do design continua sendo o repouso: cada nó é puxado para a casa
// dele (o alvo do layout) e as ligações viram molas do comprimento que já têm.
// Quando se arrasta um nó, quem está ligado a ele vai junto, com atraso e
// balanço; ao soltar, tudo volta para a casa e as molas do design assumem de novo.
//
// Os parâmetros vêm do "playbook-lab-os-second-brain" (Jay E / RoboNuggets,
// CC BY 4.0): força das ligações por tipo, colisão, amortecimento, decaimento
// e o reaquecimento no arrasto. A implementação é nova, sobre d3-force.
import { forceSimulation, forceLink, forceCollide } from "d3-force";

// A força de cada ligação no valor padrão do controle "Molas das ligações".
const KIND = { route: 0.55, spoke: 0.42, wire: 0.25 };
const DEFAULT_SPRINGS = 0.35;
// O quanto cada nó é puxado de volta para a casa.
const HOME = 0.1;
// Abaixo disso, a simulação esfria e devolve os nós às molas do design.
const COOL = 0.012;

// points: [{ node, x, y, vx, vy, r, home(): [x, y], fixed }]
// links: [{ source, target, kind }] com source/target sendo os próprios points
export function startSprings({ points, links, springs, rings }) {
  const scale = Math.max(0, springs) / DEFAULT_SPRINGS;
  for (const p of points) {
    if (p.fixed) {
      p.fx = p.x;
      p.fy = p.y;
    }
  }
  const span = (l) => {
    const [ax, ay] = l.source.home();
    const [bx, by] = l.target.home();
    return Math.max(1, Math.hypot(bx - ax, by - ay));
  };
  for (const l of links) l.len = span(l);

  const link = forceLink(links)
    .distance((l) => l.len)
    .strength((l) => Math.min(1, (KIND[l.kind] ?? 0.03) * scale));

  // Cada nó volta para a casa (que pode andar: os anéis giram, e quem vai
  // junto com o arrastado tem a casa deslocada com ele).
  const home = (alpha) => {
    for (const p of points) {
      if (p.fx != null) continue;
      const [hx, hy] = p.home();
      p.vx += (hx - p.x) * HOME * alpha;
      p.vy += (hy - p.y) * HOME * alpha;
    }
  };

  const sim = forceSimulation(points)
    .stop()
    .alpha(0.3)
    .alphaDecay(0.022)
    .velocityDecay(0.46)
    .force("home", home)
    .force("link", link)
    .force("collide", forceCollide((p) => p.r + 2.4).strength(0.6));

  let held = null;
  return {
    points,
    // Segura um nó no ponto (x, y) do mundo.
    hold(point, x, y) {
      if (held !== point) {
        held = point;
        sim.alphaTarget(0.28);
        sim.alpha(Math.max(sim.alpha(), 0.28));
      }
      point.fx = x;
      point.fy = y;
    },
    // Solta: a simulação se reaquece e vai esfriando até o repouso.
    release() {
      if (held && !held.fixed) held.fx = held.fy = null;
      held = null;
      // As molas voltam ao comprimento das casas (já devolvidas ao layout).
      for (const l of links) l.len = span(l);
      link.distance((l) => l.len);
      sim.alphaTarget(0);
      sim.alpha(Math.max(sim.alpha(), 0.5));
    },
    // Um passo (ou dois, se o quadro demorou). Devolve false quando esfriou.
    step(dt) {
      if (rings) {
        // Os anéis giram em ritmos diferentes: as molas acompanham.
        for (const l of links) l.len = span(l);
        link.distance((l) => l.len);
      }
      const n = Math.max(1, Math.min(2, Math.round(dt * 60)));
      sim.tick(n);
      return held !== null || sim.alpha() > COOL;
    },
    stop() {
      sim.stop();
    },
  };
}
