// O motor do mapa do cérebro, portado do design "Cérebro v2" (Claude Design),
// com o espaço que a v3 reserva para os painéis e a barra de baixo.
// Mudanças em relação ao design: a empresa é a pasta `empresa`, os ícones vêm de
// ./icons, e nas vistas soltas o arrasto usa as molas de ./physics (d3-force).
import { ICONS } from "./icons";
import { startSprings } from "./physics";

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
// A pasta que fica no centro do mapa: a própria empresa.
const CENTER = "empresa";
// Medidas do mundo, em px com zoom 1.
const RING = 250; // do centro a um departamento
const CORE = 44; // raio da esfera do centro
const HUB = 16; // raio de um departamento
const FOCUS = 22; // raio do que está aberto
const ITEM = 12; // raio de um item aberto
const SEED = 3; // raio de um item recolhido
const DROP = 1.4; // o quanto o anel se afasta quando a empresa é o foco
const FAN = 60; // do departamento à fileira recolhida
const SPREAD = 10.5; // entre os itens recolhidos
const BUD = 36; // de uma pasta fechada à coroa dela, no mínimo
const TWIG = 8; // entre os pontos da coroa
const ARC = 1; // até onde a coroa se abre, para cada lado (rad)
const TEXT = 11.5; // o tamanho do nome de um item aberto
const LINE = 14; // entre as linhas desse nome
const WRAP = 96; // a linha mais larga do nome embaixo de um item
const PAD = 12; // a folga de cada lado de uma coluna
const GROUP = 36; // a mais, entre um grupo e o seguinte
const STEM = 150; // da base ao item: a haste
const BASE = 150; // do foco à base, no mínimo
const CONE = 0.5; // a base sobe com a largura: o leque nunca deita
// O leque de uma pasta aberta é o mesmo, mais baixo.
const STEM_IN = 110;
const BASE_IN = 90;
// O que a tela reserva em cima (o título) e embaixo.
let HEAD = 112; // menor ou maior, conforme a largura da tela
let FOOT = 32; // cresce quando a barra de ferramentas aparece embaixo
// O que um painel ao lado cobre: a câmera enquadra o mapa no espaço que sobra.
let LEFT = 0;
let RIGHT = 0;
const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const mod = (x, m) => ((x % m) + m) % m;
// O mesmo ângulo, pelo caminho mais curto.
const wrap = (angle) => angle - TAU * Math.round(angle / TAU);
const spring = (x = 0) => ({ x, v: 0, to: x });
function advance(s, dt) {
    s.v += ((s.to - s.x) * 49 - 14 * s.v) * dt;
    s.x += s.v * dt;
}
// Para o que só acende e apaga.
const ease = (from, to, dt) => from + (to - from) * (1 - Math.exp(-dt / 0.09));
// Quebra um nome em linhas que caibam em `max`. Uma palavra maior que a
// linha fica inteira: nome nenhum é cortado.
function wrapText(text, max, measure) {
    const lines = [];
    for (const word of text.split(" ")) {
        const last = lines.at(-1);
        if (last !== undefined && measure(last + " " + word) <= max)
            lines[lines.length - 1] += " " + word;
        else
            lines.push(word);
    }
    return lines;
}
function build(tree, measure, extras = []) {
    const all = [];
    const add = (source, parent, kind, home) => {
        const label = source.label;
        const note = source.schedule ?? "";
        const item = (text) => measure(text, "item");
        const lines = wrapText(label, WRAP, item);
        const node = {
            path: source.path,
            label,
            lines,
            width: Math.max(...lines.map(item), note ? measure(note, "note") : 0),
            note,
            kind,
            folder: !!source.children,
            dept: kind === "dept",
            home,
            parent,
            kids: [],
            skills: [],
            routines: [],
            items: [],
            from: parent,
            link: "cone",
            base: 0,
            size: ITEM,
            shown: false,
            open: false,
            hub: null,
            off: 0,
            u: 0,
            v: 0,
            half: 0,
            top: 0,
            a: spring(),
            d: spring(),
            o: spring(),
            s: spring(kind === "dept" || kind === "core" ? 2 : 0),
            lit: 1,
            text: 0,
            glow: 0,
            x: 0,
            y: 0,
            dir: UP,
            r: 0,
            // Nas outras vistas: a camada, onde fica, se aparece e de que tamanho.
            layer: kind === "skill" || kind === "routine" ? "S" : kind === "app" ? "A" : kind === "page" || kind === "folder" ? "M" : null,
            gx: spring(),
            gy: spring(),
            go: spring(),
            gr: ITEM,
            gs: ITEM,
            gl: null,
            gtext: 0,
            tx: 0,
            ty: 0,
            ra: 0,
            rd: 0,
            rv: 0,
            anchor: null,
            px: 0,
            py: 0,
            wires: [],
            exp: true,
            removed: false,
            desc: source.desc ?? "",
            tag: source.tag ?? "",
        };
        all.push(node); // o pai sempre antes dos filhos
        const inner = home ?? node;
        node.kids = (source.children ?? []).map((child) => add(child, node, child.children ? "folder" : "page", inner));
        node.skills = (source.skills ?? []).map((item) => add(item, node, "skill", inner));
        node.routines = (source.routines ?? []).map((item) => add(item, node, "routine", inner));
        node.items = [...node.skills, ...node.kids, ...node.routines];
        // Tudo o que tem; `skills`, `kids` e `routines` ficam só com o que está à mostra.
        node.own = { skills: node.skills, kids: node.kids, routines: node.routines };
        return node;
    };
    const center = add(tree.find((node) => node.path === CENTER) ?? { path: CENTER, label: "Empresa", children: [] }, null, "core", null);
    const depts = tree
        .filter((node) => node.children && node.path !== CENTER)
        .map((node) => add(node, center, "dept", null));
    // Cada um é a casa de si mesmo; o que está dentro já herdou a casa.
    for (const node of [center, ...depts])
        node.home = node;
    // As aplicações ligadas: só aparecem nas outras vistas, presas à empresa.
    const apps = extras.map((source) => {
        const node = add(source, center, "app", center);
        node.wires = (source.links ?? [])
            .map((path) => (path === CENTER ? center : depts.find((dept) => dept.path === path)))
            .filter(Boolean);
        return node;
    });
    // O que o foco abriu: a meia largura e a altura, para a câmera.
    return { all, center, depts, apps, half: 0, top: 0, off: new Set(), expand: false, extent: 400, rings: null };
}
// O raio de um nó, dado o porte.
function radius(node, s) {
    if (node.kind === "core")
        return CORE;
    if (s <= 1)
        return SEED + (node.size - SEED) * Math.max(0, s);
    if (s <= 2)
        return node.size + (HUB - node.size) * (s - 1);
    return HUB + (FOCUS - HUB) * Math.min(1, s - 2);
}
// A coroa de uma pasta fechada: o raio e o ângulo entre dois pontos, para que
// caibam todos sem encostar.
function crown(node) {
    const gaps = Math.max(1, node.items.length - 1);
    const step = Math.min(0.5, (2 * ARC) / gaps);
    return { radius: Math.max(BUD, TWIG / step), step };
}
// A meia largura da coroa.
function bud(node) {
    if (!node.items.length)
        return 0;
    const { radius, step } = crown(node);
    return radius * Math.sin(((node.items.length - 1) / 2) * step) + SEED;
}
// Recolhido: os itens numa fileira curta, para fora do anel, cada um ligado
// ao departamento por um fio. É o leque aberto em miniatura.
function fold(node) {
    const n = node.items.length;
    node.items.forEach((item, i) => {
        const x = (i - (n - 1) / 2) * SPREAD;
        item.a.to = Math.atan2(x, FAN);
        item.d.to = Math.hypot(x, FAN);
        item.o.to = 1;
    });
}
// Põe um nó em (u, v): para o lado e para cima do foco. O ângulo guardado é o
// da direção do pai, então se desconta o desvio dele. Aberto, o nó tem o
// tamanho de um item; senão, é um ponto.
function place(node, parent, u, v, open) {
    const angle = Math.atan2(u - parent.u, v - parent.v);
    node.a.to = angle - parent.off;
    node.d.to = Math.hypot(u - parent.u, v - parent.v);
    node.off = angle;
    node.u = u;
    node.v = v;
    node.o.to = 1;
    node.s.to = open ? 1 : 0;
    node.shown = open;
}
// Fechada, uma pasta mostra o que guarda numa coroa logo acima dela, cada
// ponto ligado a ela por um fio: o leque dela em miniatura. Devolve até onde
// sobe.
function close(node, focus) {
    const n = node.items.length;
    const { radius, step } = crown(node);
    node.items.forEach((item, i) => {
        const angle = (i - (n - 1) / 2) * step;
        place(item, node, node.u + radius * Math.sin(angle), node.v + radius * Math.cos(angle), false);
        item.hub = focus;
    });
    return n ? node.v + radius + SEED : node.v + ITEM;
}
// Aberto: os itens numa fileira só, em três grupos (skills, memória, rotinas),
// cada coluna da largura do que leva: o nome embaixo e, numa pasta, o que ela
// guarda em cima. Cada item desce por uma haste até a base e, dela, um fio
// pontilhado vai até quem abriu: o leque. As pastas do caminho até o item em
// vista (`chain`) abrem o leque delas também, mais baixo; as outras ficam
// fechadas. Devolve até onde tudo sobe.
// Com tudo expandido, cada pasta aberta pede a largura do leque dela inteiro:
// a meia largura de que um item precisa na fileira.
function need(node, chain) {
    const own = Math.max(node.width / 2, chain.has(node) ? 0 : bud(node)) + PAD;
    if (!chain.has(node))
        return own;
    let width = 0;
    let any = false;
    [node.skills, node.kids, node.routines]
        .filter((group) => group.length)
        .forEach((group) => {
        group.forEach((item, i) => {
            width += 2 * need(item, chain) + (any && !i ? GROUP : 0);
            any = true;
        });
    });
    return Math.max(own, width / 2);
}
function fan(node, focus, least, stem, chain, wide = false) {
    const slots = [];
    let x = 0;
    let left = 0;
    let right = 0;
    [node.skills, node.kids, node.routines]
        .filter((group) => group.length)
        .forEach((group) => {
        group.forEach((item, i) => {
            const half = wide ? need(item, chain) : Math.max(item.width / 2, bud(item)) + PAD;
            if (slots.length)
                x += right + half + (i ? 0 : GROUP);
            else
                left = half;
            slots.push([item, x]);
            right = half;
        });
    });
    const shift = (x + right - left) / 2; // centra a fileira em quem abriu
    const reach = Math.max(0, ...slots.map(([, at]) => Math.abs(at - shift)));
    const base = Math.max(least, reach * CONE);
    node.open = true;
    node.half = slots.length ? shift + left : 0;
    node.top = node.v + base + stem;
    for (const [item, at] of slots) {
        place(item, node, node.u + at - shift, node.v + base + stem, true);
        item.size = ITEM;
        item.base = base;
        item.hub = focus;
        const top = chain.has(item) ? fan(item, focus, BASE_IN, STEM_IN, chain, wide) : close(item, focus);
        node.top = Math.max(node.top, top);
    }
    return node.top;
}
// Define para onde tudo vai, dado o foco (o centro ou um departamento) e o
// item em vista lá dentro, se houver: as pastas do caminho até ele ficam
// abertas. Não move nada: quem leva são as molas. Devolve o caminho do centro
// até o foco.
function arrange(scene, focus, turn, look = null) {
    const { all, center, depts } = scene;
    // O que vai sumir sai do jeito que estava: só o que fica muda de forma.
    const before = all.map((node) => [node.link, node.from, node.shown, node.hub]);
    for (const node of all) {
        node.a.to = node.d.to = node.o.to = node.s.to = 0; // recolhido no pai
        node.shown = node.open = false;
        node.from = node.parent;
        node.link = "cone";
        node.hub = null;
    }
    const path = [];
    for (let node = focus; node; node = node.parent)
        path.unshift(node);
    const dept = path[1] ?? null;
    center.o.to = 1;
    center.s.to = 2;
    // O anel gira até o departamento em foco ficar em cima.
    if (dept) {
        const top = UP - (depts.indexOf(dept) * TAU) / depts.length;
        turn.to = turn.x + wrap(top - turn.x);
    }
    depts.forEach((node, i) => {
        let a = (i * TAU) / depts.length;
        node.d.to = RING;
        if (focus && !dept) {
            // Empresa em foco: o anel se abre em cima e desce, cada departamento
            // pelo lado em que já está, para um arco embaixo dela.
            const fromTop = mod(turn.to + a - UP, TAU);
            const place = Math.floor((fromTop * depts.length) / TAU) - (depts.length - 1) / 2;
            a = -UP + (place * Math.PI) / depts.length - turn.to;
            node.d.to = RING * DROP;
        }
        // Desligado na legenda: fica apagado e não mostra o que guarda.
        const off = scene.off.has(node) && node !== dept;
        node.a.to = node.a.x + wrap(a - node.a.x);
        node.o.to = off ? 0.3 : 1;
        node.s.to = 2;
        node.link = "spoke";
        if (node !== dept && !off)
            fold(node);
    });
    scene.half = scene.top = 0;
    if (focus) {
        const chain = new Set();
        // "Expandir tudo": todas as pastas do foco abrem o leque.
        if (scene.expand) {
            for (const node of all) {
                if (node.home === focus && node !== focus && node.folder && node.items.length)
                    chain.add(node);
            }
        }
        for (let node = look; node && node !== focus; node = node.parent) {
            if (node.items.length)
                chain.add(node);
        }
        focus.shown = true;
        focus.s.to = 3;
        focus.u = focus.v = focus.off = 0;
        fan(focus, focus, BASE + (focus.kind === "core" ? CORE : 0), STEM, chain, scene.expand);
        scene.half = focus.half;
        scene.top = focus.top;
    }
    all.forEach((node, i) => {
        if (!node.o.to)
            [node.link, node.from, node.shown, node.hub] = before[i];
        // O que está recolhido já nasce apontando para o lugar certo.
        if (node.o.x < 0.02) {
            node.a.x = node.a.to;
            node.a.v = 0;
        }
    });
    return path;
}
// Onde a câmera para. Na visão geral, o anel inteiro. Com foco, ele na base
// da tela e o leque inteiro em cima.
function frame(scene, path, w, h) {
    if (!path.length) {
        const lift = FOOT - 32; // o que a barra de baixo ocupa
        const k = clamp(Math.min(w - 48, h - HEAD - 40 - lift) / (2 * (RING + FAN + 60)), 0.3, 1.3);
        return { k, x: w / 2, y: HEAD / 2 + (h - 40 - lift) / 2 };
    }
    const fy = path.length > 1 ? -RING : 0;
    const reach = Math.max(150, scene.half);
    const top = scene.top + 40;
    // Embaixo do foco: o nome dele e os vizinhos; com a empresa em foco, o anel.
    const bottom = path.length > 1 ? 150 : RING * DROP + HUB + 60;
    const room = h - HEAD - FOOT;
    const k = clamp(Math.min((w - 48) / (2 * reach), room / (top + bottom)), 0.25, 1.25);
    // O que sobra de altura se divide entre cima e baixo; embaixo, até um limite,
    // para o anel não roubar a cena.
    const slack = Math.min(90, Math.max(0, room - k * (top + bottom)) / 2);
    return { k, x: w / 2, y: h - FOOT - slack - k * (fy + bottom) };
}
// A câmera voa até um item do leque, sem mexer no resto: o item, o nome dele
// e, numa pasta aberta, o leque dela inteiro, no meio da tela.
function frameItem(path, node, w, h) {
    const fy = path.length > 1 ? -RING : 0;
    const lines = node.lines.length + (node.note ? 1 : 0);
    const half = Math.max(node.width / 2, node.open ? node.half : bud(node)) + 16;
    const y0 = node.v - ITEM - 12 - lines * LINE - 16;
    const y1 = (node.open ? node.top : node.v + (node.items.length ? crown(node).radius + SEED : ITEM)) + 24;
    const k = clamp(Math.min((w - 160) / (2 * half), (h - HEAD - FOOT - 80) / (y1 - y0)), 0.45, 1.4);
    return {
        k,
        x: w / 2 - k * node.u,
        y: HEAD + (h - HEAD - FOOT) / 2 - k * (fy - (y0 + y1) / 2),
    };
}
// Deixa em cada nó só o que está à mostra: o que a legenda desligou e o que foi
// tirado do mapa saem das listas, e o leque se fecha em volta do que ficou.
function refilter(scene, gone) {
    for (const node of scene.all) {
        node.skills = node.own.skills.filter((item) => !gone(item));
        node.kids = node.own.kids.filter((item) => !gone(item));
        node.routines = node.own.routines.filter((item) => !gone(item));
        node.items = [...node.skills, ...node.kids, ...node.routines];
    }
}
// As outras vistas mostram tudo de uma vez: em anéis (memória, skills com as
// rotinas e aplicações em volta da empresa) ou solto, cada item puxado para o
// seu departamento.
const SIZE = { core: 30, dept: 14, folder: 5, page: 3.4, skill: 4.2, routine: 4.6, app: 9 };
const HUBS = 150; // do centro aos departamentos
const MEMORY = 224; // à primeira fileira da memória
const ROW = 20; // entre as fileiras
const STEP = 16.5; // entre dois itens de uma fileira
const SLICE = 0.07; // entre duas fatias (rad)
const WHEEL = 0.5; // giro da roda de dentro (departamentos e memória), juntos
// Define para onde tudo vai numa dessas vistas. Não move nada: quem leva são
// as molas. Em anéis, cada nó guarda o ângulo e o raio (os anéis giram); nas
// outras, o ponto.
function layout(scene, mode, opts, gone) {
    const { all, center, depts, apps } = scene;
    // Quem aparece: o que não foi tirado, com as pastas do caminho abertas.
    const seen = new Set();
    for (const node of all) {
        const parent = node.parent;
        const hidden = scene.off.has(node.home) && !node.dept && node.kind !== "app";
        const ok = !parent || (seen.has(parent) && !gone(node) && !hidden && (parent.kind !== "folder" || parent.exp));
        if (ok)
            seen.add(node);
        const shut = node.kind === "folder" && !node.exp && node.items.length;
        node.gr = SIZE[node.kind] + (shut ? 2.6 : 0);
        node.go.to = !ok ? 0 : node.dept && scene.off.has(node) ? 0.3 : 1;
        node.gl = null;
        node.rv = 0;
        node.anchor = null;
    }
    // A quem cada item se liga: ao departamento, ou à pasta em que está.
    const link = (node) => {
        if (node.kind === "app")
            return node.wires.find((dept) => seen.has(dept)) ?? center;
        return opts.group === "folder" ? node.parent : node.home;
    };
    for (const node of seen) {
        if (node !== center && !node.dept)
            node.gl = link(node);
    }
    const polar = (node, angle, radius, turn = 0) => {
        node.ra = angle;
        node.rd = radius;
        node.rv = turn;
    };
    polar(center, 0, 0);
    if (mode === "rings") {
        // Uma fatia para a empresa (em cima) e uma por departamento, do tamanho
        // do que cada um guarda.
        const slices = [center, ...depts];
        const of = (home, layer) => all.filter((node) => seen.has(node) && node.layer === layer && node.home === home);
        const memory = slices.map((home) => of(home, "M"));
        const weight = memory.map((list) => Math.max(7, list.length));
        const total = weight.reduce((a, b) => a + b, 0);
        const usable = TAU - SLICE * slices.length;
        let at = UP - ((weight[0] / total) * usable) / 2;
        let rim = MEMORY;
        const spread = (list, mid, span, radius, gap, turn) => {
            const step = Math.min(gap, span / Math.max(1, list.length));
            list.forEach((node, i) => polar(node, mid + (i - (list.length - 1) / 2) * step, radius, turn));
        };
        const later = [];
        slices.forEach((home, i) => {
            const span = (weight[i] / total) * usable;
            const mid = at + span / 2;
            if (home !== center)
                polar(home, mid, HUBS, WHEEL);
            // A memória enche fileiras, de dentro para fora; a pasta vem antes do
            // que ela guarda.
            let done = 0;
            for (let row = 0; done < memory[i].length; row++) {
                const radius = MEMORY + row * ROW;
                const fit = Math.max(1, Math.floor((span * radius) / STEP));
                const n = Math.min(fit, memory[i].length - done);
                for (let j = 0; j < n; j++)
                    polar(memory[i][done + j], mid + ((j - (n - 1) / 2) * STEP) / radius, radius, WHEEL);
                done += n;
                rim = Math.max(rim, radius);
            }
            later.push([of(home, "S"), mid, span]);
            at += span + SLICE;
        });
        const skills = rim + 50;
        const outer = skills + 58;
        for (const [list, mid, span] of later)
            spread(list, mid, span, skills, 0.11, -0.55);
        const live = apps.filter((node) => seen.has(node));
        live.forEach((node, i) => polar(node, UP + ((i + 0.5) * TAU) / live.length, outer, 1));
        scene.rings = { M0: MEMORY - 13, M1: rim + 13, S: skills, A: outer };
        scene.extent = outer + 46;
    }
    else {
        // Solto: os departamentos em roda, presos; o resto se acomoda entre a
        // mola que o liga ao dono e a distância que cada um pede dos outros.
        const ring = 262;
        const points = [];
        const at = new Map();
        const put = (node, x, y, fixed) => {
            const point = { node, x, y, vx: 0, vy: 0, fixed, to: null, len: 0, r: node.gr };
            points.push(point);
            at.set(node, point);
            return point;
        };
        put(center, 0, 0, true);
        depts.forEach((dept, i) => {
            const angle = UP + (i * TAU) / depts.length;
            put(dept, Math.cos(angle) * ring, Math.sin(angle) * ring, true);
        });
        // O nome de cada um fica embaixo dele: nada se acomoda ali.
        for (const hub of [...points]) {
            const drop = hub.node === center ? 52 : 33;
            for (const side of [-30, 0, 30])
                points.push({ node: null, x: hub.x + side, y: hub.y + drop, vx: 0, vy: 0, fixed: true, to: null, len: 0, r: 8 });
        }
        const depth = (node) => {
            let n = 0;
            for (let up = node; up !== node.home; up = up.parent)
                n++;
            return n;
        };
        let n = 0;
        for (const node of all) {
            if (!seen.has(node) || node === center || node.dept)
                continue;
            const to = at.get(node.gl) ?? at.get(center);
            const owner = to.node;
            let len;
            if (node.kind === "app")
                len = owner === center ? 110 : 64;
            else if (opts.group === "folder")
                len = owner === center ? 80 : owner.dept ? (node.folder ? 62 : 42) : node.folder ? 40 : 26;
            else
                len = (owner === center ? 66 : 26) + 15 * depth(node);
            const angle = n++ * 2.39996;
            const point = put(node, to.x + Math.cos(angle) * len, to.y + Math.sin(angle) * len, false);
            point.to = to;
            point.len = len;
        }
        const pull = 0.04 + 0.3 * opts.springs;
        const charge = 300;
        const STEPS = 240;
        for (let step = 0; step < STEPS; step++) {
            const heat = 1 - step / STEPS;
            for (const p of points) {
                if (!p.to)
                    continue;
                const dx = p.to.x - p.x;
                const dy = p.to.y - p.y;
                const d = Math.hypot(dx, dy) || 1e-6;
                const f = ((d - p.len) / d) * pull;
                p.vx += dx * f;
                p.vy += dy * f;
            }
            for (let i = 0; i < points.length; i++) {
                const a = points[i];
                for (let j = i + 1; j < points.length; j++) {
                    const b = points[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let d2 = dx * dx + dy * dy;
                    if (d2 > 22500)
                        continue;
                    if (d2 < 0.01) {
                        dx = 0.1;
                        dy = 0.1 * (j - i);
                        d2 = dx * dx + dy * dy;
                    }
                    const d = Math.sqrt(d2);
                    const room = a.r + b.r + 8;
                    const f = (charge * heat) / (d2 * d) + (d < room ? ((room - d) * 0.5) / d : 0);
                    a.vx -= dx * f;
                    a.vy -= dy * f;
                    b.vx += dx * f;
                    b.vy += dy * f;
                }
            }
            const cap = 1.5 + 14 * heat;
            for (const p of points) {
                if (p.fixed) {
                    p.vx = p.vy = 0;
                    continue;
                }
                p.vx *= 0.55;
                p.vy *= 0.55;
                const v = Math.hypot(p.vx, p.vy);
                if (v > cap) {
                    p.vx *= cap / v;
                    p.vy *= cap / v;
                }
                p.x += p.vx;
                p.y += p.vy;
            }
        }
        let reach = 0;
        for (const p of points) {
            if (!p.node)
                continue;
            p.node.tx = p.x;
            p.node.ty = p.y;
            reach = Math.max(reach, Math.hypot(p.x, p.y));
        }
        scene.extent = reach + 56;
    }
    // O que não aparece fica recolhido no dono mais próximo que aparece.
    for (const node of all) {
        if (seen.has(node))
            continue;
        let up = node.parent;
        while (up && !seen.has(up))
            up = up.parent;
        node.anchor = up ?? center;
    }
}

// O mapa do cérebro: quem desenha e ouve o mouse, sem React. As contas da cena
// (build, arrange, layout, frame, frameItem…) vêm de cima, no mesmo escopo.


const SPHERE = (() => {
  const count = 520;
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    points.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
  }
  return points;
})();

function startBrain(canvas, tree, hooks, extras, resume = null) {
  const ctx = canvas.getContext("2d");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const style = getComputedStyle(canvas);
  const family = style.fontFamily;
  const mono = style.getPropertyValue("--font-mono") || "monospace";
  const font = (weight, size, face = family) => `${weight} ${size}px ${face}`;

  // --- A tinta ---
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const tone = (name) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = style.getPropertyValue(name) || style.getPropertyValue("--muted-foreground");
    probe.fillRect(0, 0, 1, 1);
    const rgb = probe.getImageData(0, 0, 1, 1).data.slice(0, 3).join(", ");
    return (alpha = 1) => `rgba(${rgb}, ${alpha})`;
  };
  const ink = tone("--foreground");
  const routine = tone("--brain-routine");
  const linked = tone("--brain-app");
  const space = tone("--background");
  const hue = { [CENTER]: tone("--area-company") };
  for (const node of tree) if (node.children && node.path !== CENTER) hue[node.path] = tone(`--area-${node.path}`);
  const area = (node) => (node.kind === "core" ? ink : node.kind === "app" ? linked : hue[node.home.path]);
  const kind = (node) => (node.kind === "skill" ? ink : node.kind === "routine" ? routine : area(node));
  const glows = new Map();
  const glow = (color) => {
    let sprite = glows.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 128;
      const g = sprite.getContext("2d");
      const fill = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      [1, 0.42, 0.14, 0.04, 0].forEach((alpha, i) => fill.addColorStop(i / 4, color(alpha)));
      g.fillStyle = fill;
      g.fillRect(0, 0, 128, 128);
      glows.set(color, sprite);
    }
    return sprite;
  };
  const shapes = Object.fromEntries(Object.entries(ICONS).map(([key, d]) => [key, new Path2D(d)]));
  const icon = (key, x, y, size, color) => {
    const shape = shapes[key] ?? shapes.folder;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.lineWidth = 1.75;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.stroke(shape);
    ctx.restore();
  };

  function backdrop(w, h, dpr) {
    const layer = document.createElement("canvas");
    layer.width = w * dpr;
    layer.height = h * dpr;
    const g = layer.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = space();
    g.fillRect(0, 0, w, h);
    const light = g.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.max(w, h) * 0.7);
    light.addColorStop(0, ink(0.045));
    light.addColorStop(1, ink(0));
    g.fillStyle = light;
    g.fillRect(0, 0, w, h);
    const grain = document.createElement("canvas");
    grain.width = grain.height = 96;
    const n = grain.getContext("2d");
    const pixels = n.createImageData(96, 96);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = Math.random() < 0.5 ? 0 : 255;
      pixels.data[i + 3] = Math.random() * 7;
    }
    n.putImageData(pixels, 0, 0);
    g.fillStyle = g.createPattern(grain, "repeat");
    g.fillRect(0, 0, w, h);
    return layer;
  }

  function vignette(w, h, dpr) {
    const layer = document.createElement("canvas");
    layer.width = w * dpr;
    layer.height = h * dpr;
    const g = layer.getContext("2d");
    g.scale(dpr, dpr);
    const veil = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.58);
    veil.addColorStop(0, space(0));
    veil.addColorStop(1, space(0.85));
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h);
    return layer;
  }

  // --- A cena ---
  const scene = build(
    tree,
    (text, kindOf) => {
      ctx.font = kindOf === "item" ? font(500, TEXT) : font(400, 10, mono);
      return ctx.measureText(text).width;
    },
    extras,
  );
  const { all, center, depts } = scene;
  const widths = new Map();
  const measure = (text) => {
    const key = ctx.font + ctx.letterSpacing + text;
    let width = widths.get(key);
    if (width === undefined) widths.set(key, (width = ctx.measureText(text).width));
    return width;
  };

  const cam = { k: spring(1), x: spring(), y: spring() };
  const turn = spring(UP);
  // A vista: os departamentos (0) ou tudo de uma vez (1). A mola leva de uma à outra.
  const mix = spring(0);
  // O que cada vista desenha a mais (as linhas dos anéis, a borda): acende e apaga.
  const deco = { rings: 0, force: 0 };
  const opts = { names: true, spin: 0.17, springs: 0.35, group: "dept" };
  const filters = { layers: {}, areas: {} };
  const pointer = { x: 0, y: 0, on: 0, in: false };
  let mode = "depts";
  let phase = 0; // quanto os anéis já giraram
  let sel = null; // o item escolhido nas outras vistas
  let path = [];
  let looked = null;
  let hover = null;
  let press = null;
  let names = [];
  let back = null;
  let veil = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let spot = 0;
  let orbit = 1;
  let time = 0;
  let last = 0;
  let raf = 0;
  // As molas do arrasto, nas vistas soltas: vivas só enquanto algo se mexe.
  let springs = null;

  // Fora do mapa: tirado à mão, ou de uma camada que a legenda desligou.
  const gone = (node) => node.removed || (node.layer !== null && filters.layers[node.layer] === false);
  const brief = (node) => ({
    path: node.path,
    label: node.label,
    kind: node.kind,
    note: node.note,
    area: node.kind === "app" ? null : node.home.path,
    areaLabel: node.kind === "app" ? "" : node.home.label,
  });
  // O que o cartão mostra de um item: o que ele é e a quem se liga.
  const describe = (node) => {
    if (!node) return null;
    const near = new Set();
    if (node.kind === "app") node.wires.forEach((dept) => near.add(dept));
    else {
      if (node.parent) near.add(node.parent);
      node.items.forEach((item) => near.add(item));
      if (node === center || node.dept) scene.apps.forEach((item) => item.wires.includes(node) && !gone(item) && near.add(item));
    }
    let pages = 0;
    const count = (from) => from.kids.forEach((kid) => (kid.folder ? count(kid) : pages++));
    count(node);
    const list = [...near];
    return {
      ...brief(node),
      desc: node.desc,
      tag: node.tag,
      folder: node.folder,
      open: mode === "depts" ? node.open : node.exp,
      inside: node.items.length,
      pages,
      total: list.length,
      conns: list.slice(0, 12).map(brief),
    };
  };

  const aim = () => {
    if (!width) return;
    // A largura que sobra entre os painéis; o mapa se centra nela.
    const room = Math.max(320, width - LEFT - RIGHT);
    let to;
    if (mode !== "depts") {
      const lift = FOOT - 32;
      const k = clamp(Math.min(room - 48, height - HEAD - 40 - lift) / (2 * scene.extent), 0.2, 1.5);
      to = { k, x: room / 2, y: HEAD / 2 + (height - 24 - lift) / 2 };
    } else to = looked ? frameItem(path, looked, room, height) : frame(scene, path, room, height);
    cam.k.to = to.k;
    cam.x.to = to.x + LEFT;
    cam.y.to = to.y;
  };
  const tell = () => hooks.change?.(path.at(-1)?.path ?? null);
  // Nas outras vistas, aponta cada nó para o lugar dele: o ponto, ou o ângulo
  // no anel, que gira. O que está recolhido segue o dono.
  const seat = () => {
    const rings = mode === "rings";
    for (const node of all) {
      const src = node.anchor ?? node;
      if (rings) {
        const angle = src.ra + phase * src.rv;
        node.gx.to = Math.cos(angle) * src.rd;
        node.gy.to = Math.sin(angle) * src.rd;
      } else {
        node.gx.to = src.tx;
        node.gy.to = src.ty;
      }
    }
  };
  // Acorda as molas: cada nó aparecente sai de onde está desenhado.
  const wake = () => {
    if (springs || calm || mode === "depts") return;
    const points = [];
    const at = new Map();
    for (const node of all) {
      if (node.go.to < 0.5) continue;
      const point = {
        node,
        x: node.gx.x,
        y: node.gy.x,
        vx: node.gx.v / 60,
        vy: node.gy.v / 60,
        r: node.gr,
        fixed: node === center,
        home: () => [node.gx.to, node.gy.to],
      };
      points.push(point);
      at.set(node, point);
      node.phys = point;
    }
    const links = [];
    const tie = (a, b, kind) => {
      const source = at.get(a);
      const target = at.get(b);
      if (source && target && source !== target) links.push({ source, target, kind });
    };
    for (const node of all) {
      if (!at.has(node)) continue;
      if (node.dept) tie(center, node, "route");
      else if (node.gl) tie(node.gl, node, node.kind === "app" ? "wire" : "spoke");
      if (node.kind === "app") node.wires.forEach((dept) => dept !== node.gl && tie(dept, node, "wire"));
    }
    springs = startSprings({ points, links, springs: opts.springs, rings: mode === "rings" });
  };
  // Esfria as molas: cada nó continua de onde está, agora pelas molas do design.
  const settle = () => {
    if (!springs) return;
    for (const point of springs.points) {
      const node = point.node;
      node.gx.x = point.x;
      node.gy.x = point.y;
      node.gx.v = (point.vx || 0) * 60;
      node.gy.v = (point.vy || 0) * 60;
      node.phys = null;
    }
    springs.stop();
    springs = null;
  };
  const relay = () => {
    settle();
    layout(scene, mode, opts, gone);
    seat();
  };
  const find = (target) => all.find((candidate) => candidate.path === target) ?? null;

  function select(node) {
    sel = node;
    hooks.select?.(describe(node));
  }
  // Troca de vista. Dos departamentos para as outras, cada item sai de onde
  // está e voa para o lugar novo; de volta, se recolhe no departamento.
  function setMode(next) {
    if (next === mode) return;
    settle();
    const from = mode;
    mode = next;
    hover = looked = sel = null;
    hooks.select?.(null);
    hooks.hover?.(null);
    path = arrange(scene, null, turn);
    tell();
    if (next === "depts") mix.to = 0;
    else {
      relay();
      if (from === "depts") {
        for (const node of all) {
          node.gx.x = node.gx.to;
          node.gy.x = node.gy.to;
          node.gx.v = node.gy.v = 0;
          node.go.x = node.go.to;
          node.gs = node.gr;
        }
      }
      mix.to = 1;
    }
    hooks.mode?.(mode);
    aim();
  }
  function focus(target) {
    if (mode !== "depts") setMode("depts");
    const node = all.find((candidate) => candidate.path === target && (candidate === center || candidate.dept)) ?? null;
    path = arrange(scene, node, turn);
    hover = looked = null;
    hooks.select?.(null);
    aim();
    tell();
  }
  // A câmera voa até um item e as pastas do caminho até ele abrem o leque;
  // o resto fica onde está. Sem item, tudo volta a fechar.
  function look(node, deep = false) {
    if (node && ((!deep && !node.o.to) || node === path.at(-1))) return;
    looked = node;
    path = arrange(scene, path.at(-1) ?? null, turn, looked);
    hooks.select?.(describe(looked));
    aim();
  }
  function unlook() {
    if (!looked) return false;
    look(null);
    return true;
  }
  // Um nível acima: do item em vista à pasta em que ele está.
  function up() {
    if (!looked) return false;
    look(looked.parent === path.at(-1) ? null : looked.parent);
    return true;
  }
  // O centro e os departamentos abrem (ou fecham). Lá dentro, um clique leva
  // a câmera ao item e, numa pasta, abre o leque dela. De novo numa página,
  // skill ou rotina, abre o texto; numa pasta, fecha o leque. Nas outras
  // vistas, o clique escolhe o item (e abre ou fecha a pasta); de novo, o texto.
  function pick(node) {
    if (mode !== "depts") {
      const text = node.kind === "page" || node.kind === "skill" || node.kind === "routine";
      if (node === sel && text) return void hooks.open?.(describe(node));
      if (node.kind === "folder" && node.items.length) {
        node.exp = !node.exp;
        relay();
      }
      select(node);
      return;
    }
    const focused = path.at(-1) ?? null;
    if (node.kind === "core") focus(focused ? null : CENTER);
    else if (node.dept) focus(node === focused ? null : node.path);
    else if (node.home !== focused) {
      focus(node.home.path);
      look(node);
    } else if (node !== looked) look(node);
    else if (node.folder) up();
    else hooks.open?.(describe(node));
  }
  function step(by) {
    if (mode !== "depts") return;
    const at = depts.indexOf(path.at(-1));
    const next = at < 0 && by < 0 ? -1 : at + by;
    const node = depts.at(next % depts.length);
    if (node) focus(node.path);
  }
  function escape() {
    if (mode !== "depts") {
      if (sel) select(null);
    } else if (!up() && path.length) focus(null);
  }
  // Mudou o que aparece (um filtro, um item tirado, as pastas): refaz a cena.
  function refresh(still = false) {
    refilter(scene, gone);
    scene.off = new Set([center, ...depts].filter((node) => filters.areas[node.path] === false));
    const alive = (node) => {
      for (let at = node; at; at = at.parent) if (gone(at)) return false;
      return true;
    };
    if (looked && !alive(looked)) looked = null;
    if (sel && !alive(sel)) sel = null;
    if (mode === "depts") {
      path = arrange(scene, path.at(-1) ?? null, turn, looked);
      hooks.select?.(describe(looked));
    } else {
      path = arrange(scene, null, turn);
      relay();
      hooks.select?.(describe(sel));
    }
    if (!still) aim();
  }
  // A câmera chega perto de um item, sem mexer no resto.
  function fly(node) {
    if (mode === "depts") return aim();
    const src = node.anchor ?? node;
    const k = Math.max(cam.k.to, 2);
    cam.k.to = k;
    cam.x.to = LEFT + Math.max(320, width - LEFT - RIGHT) / 2 - k * src.gx.to;
    cam.y.to = HEAD + (height - HEAD - FOOT) / 2 - k * src.gy.to;
  }
  // Vai até um item, de onde quer que se esteja: a busca e as conexões.
  function go(target) {
    const node = find(target);
    if (!node) return;
    if (node.kind === "app" && mode === "depts") setMode("rings");
    if (mode === "depts") {
      if (node === center || node.dept) {
        if (path.at(-1) !== node) focus(node.path);
        return;
      }
      if (node.home !== path.at(-1)) focus(node.home.path);
      look(node, true);
      return;
    }
    let shut = false;
    for (let at = node.parent; at; at = at.parent) if (at.kind === "folder" && !at.exp) shut = at.exp = true;
    if (shut) relay();
    select(node);
    fly(node);
  }
  // Abre ou fecha uma pasta, pelo cartão.
  function toggle(target) {
    const node = find(target);
    if (!node || node.kind !== "folder") return;
    if (mode !== "depts") {
      node.exp = !node.exp;
      relay();
      select(node);
    } else if (node.open) look(node.parent === path.at(-1) ? null : node.parent, true);
    else look(node, true);
  }
  function set({ foot, left, right, ...next }) {
    // A tela avisa quanto espaço a barra de baixo e os painéis ocupam: a câmera reenquadra.
    let moved = false;
    if (typeof foot === "number" && foot !== FOOT) {
      FOOT = foot;
      moved = true;
    }
    if (typeof left === "number" && left !== LEFT) {
      LEFT = left;
      moved = true;
    }
    if (typeof right === "number" && right !== RIGHT) {
      RIGHT = right;
      moved = true;
    }
    if (moved) aim();
    const before = { ...opts };
    Object.assign(opts, next);
    if (mode !== "depts" && (opts.springs !== before.springs || opts.group !== before.group)) {
      relay();
      aim();
    }
  }
  function expand(flag) {
    scene.expand = flag;
    for (const node of all) if (node.kind === "folder") node.exp = flag;
    if (!flag) looked = null;
    refresh();
  }
  const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function search(query) {
    const needle = plain(query.trim());
    if (!needle) return [];
    return all
      .filter((node) => !gone(node) && plain(node.label).includes(needle))
      .sort((a, b) => plain(a.label).indexOf(needle) - plain(b.label).indexOf(needle))
      .slice(0, 8)
      .map(brief);
  }

  const inside = (node, top) => {
    for (let at = node; at; at = at.parent) {
      if (at === top) return true;
      if (at.dept && top === center && top === path.at(-1)) return false;
    }
    return false;
  };
  // Nas outras vistas, quem está ligado por um fio também acende junto.
  const tied = (a, b) => a.gl === b || b.gl === a || a.wires.includes(b) || b.wires.includes(a);
  const dotted = (k, flow) => {
    ctx.setLineDash([0, 5 / k]);
    ctx.lineDashOffset = flow;
  };

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = calm ? 1 : Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!calm) time += dt;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height || dpr !== Math.min(2, devicePixelRatio)) {
      const first = !width;
      width = w;
      height = h;
      // Em tela estreita o título desce para baixo da barra: reserva mais.
      HEAD = w >= 1400 ? 112 : w >= 800 ? 152 : 196;
      dpr = Math.min(2, devicePixelRatio);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      back = backdrop(w, h, dpr);
      veil = vignette(w, h, dpr);
      aim();
      if (first && resume) {
        cam.k.x = resume.k;
        cam.x.x = resume.x;
        cam.y.x = resume.y;
      } else if (first) {
        cam.k.x = cam.k.to * 0.7;
        cam.x.x = cam.x.to;
        cam.y.x = cam.y.to;
      }
    }

    // 1. Tudo anda um passo.
    const focused = path.at(-1) ?? null;
    const graph = mode !== "depts";
    const move = (s) => {
      if (calm) s.x = s.to;
      else advance(s, dt);
    };
    // Os departamentos giram devagar; no valor padrão (0,17), cerca de uma volta a cada 9 min.
    if (!focused && !graph && !calm) turn.to += opts.spin * 0.07 * dt;
    if (mode === "rings") {
      // Os anéis giram; com um item escolhido, param para ele não fugir.
      if (!calm && !sel) phase += opts.spin * 0.16 * dt;
      seat();
    }
    [cam.k, cam.x, cam.y, turn, mix].forEach(move);
    // Quanto de cada vista está na tela: G das outras, D dos departamentos.
    const G = clamp(mix.x);
    const D = 1 - G;
    for (const key in deco) deco[key] = ease(deco[key], mode === key ? 1 : 0, dt * 0.45);
    const k = cam.k.x;
    const toWorld = (x, y) => [(x - cam.x.x) / k, (y - cam.y.x) / k];
    const held = (press?.moved && press.node) || null;
    if (springs) {
      if (held?.phys) {
        const [hx, hy] = toWorld(press.x, press.y);
        springs.hold(held.phys, hx, hy);
      }
      const alive = springs.step(calm ? 1 / 60 : dt);
      for (const point of springs.points) {
        // O arrastado anda logo abaixo: dali sai o quanto a casa dos outros se desloca.
        if (point.node === held) continue;
        point.node.gx.x = point.x;
        point.node.gy.x = point.y;
        point.node.gx.v = point.node.gy.v = 0;
      }
      if (!alive) settle();
    }
    const lead = held || hover || (graph ? sel : looked || focused);
    spot = ease(spot, lead ? 1 : 0, dt);
    all.forEach((node, i) => {
      move(node.a);
      move(node.d);
      move(node.o);
      move(node.s);
      if (!node.phys) {
        move(node.gx);
        move(node.gy);
      }
      move(node.go);
      node.gs = ease(node.gs, node.gr, dt);
      const lit = !lead || inside(node, lead) || inside(lead, node) || (graph && tied(node, lead));
      node.lit = ease(node.lit, lit ? 1 : 0, dt);
      const least = node.s.x > 1.5 ? 12 : node.shown ? 7 : 0;
      const folded = Math.max(radius(node, node.s.x), (least * clamp(node.s.x)) / k);
      const loose = Math.max(node.gs, (node.dept || node === center ? 9 : 1.7) / k);
      node.r = folded + (loose - folded) * G;
      const parent = node.parent;
      if (!parent) return;
      if (held === node) {
        [node.x, node.y] = toWorld(press.x, press.y);
        if (graph) {
          // Solto, o que está dentro vai junto com quem é arrastado. Só a casa
          // de agora anda: a do layout (tx/ty) fica, e tudo volta para ela ao soltar.
          const dx = node.x - node.gx.x;
          const dy = node.y - node.gy.x;
          if (mode !== "rings" && (dx || dy)) {
            for (const kin of all) {
              if (kin === node || !inside(kin, node)) continue;
              kin.gx.to += dx;
              kin.gy.to += dy;
              if (!kin.phys) {
                kin.gx.x += dx;
                kin.gy.x += dy;
              }
            }
          }
          node.gx.x = node.gx.to = node.x;
          node.gy.x = node.gy.to = node.y;
          node.gx.v = node.gy.v = 0;
        } else {
          node.px = node.x;
          node.py = node.y;
          node.dir = Math.atan2(node.y - parent.y, node.x - parent.x);
        }
        return;
      }
      node.dir = (node.dept ? turn.x : parent.dir) + node.a.x;
      const breath = node.dept || node.shown ? 0 : Math.sin(time * 0.6 + i) * 1.2;
      node.px = parent.px + Math.cos(node.dir) * (node.d.x + breath);
      node.py = parent.py + Math.sin(node.dir) * (node.d.x + breath);
      node.x = node.px + (node.gx.x - node.px) * G;
      node.y = node.py + (node.gy.x - node.py) * G;
    });

    // 2. O mundo.
    const dim = (node, floor) => 1 - spot * (1 - node.lit) * (1 - floor);
    // O que as duas vistas têm em comum (o centro, os departamentos e as luzes),
    // o que é só dos departamentos e o que é só das outras.
    const fade = (node, floor = node.dept ? 0.32 : 0.1) => (clamp(node.o.x) * D + clamp(node.go.x) * G) * dim(node, floor);
    const fadeD = (node, floor = 0.1) => clamp(node.o.x) * D * dim(node, floor);
    const fadeG = (node, floor = 0.12) => clamp(node.go.x) * G * dim(node, floor);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(back, 0, 0, w, h);
    {
      // O fundo: uma colmeia que anda e cresce menos que o mapa, mais clara no
      // meio da tela e perto do mouse.
      const cell = Math.max(10, 24 * Math.pow(k, 0.7));
      const ox = w / 2 + (cam.x.x - w / 2) * 0.6;
      const oy = h / 2 + (cam.y.x - h / 2) * 0.6;
      const hs = cell * Math.sqrt(3);
      const vs = cell * 1.5;
      const half = hs / 2;
      const rise = cell / 2;
      const far = Math.hypot(w, h) / 2;
      const near = 200;
      pointer.on = ease(pointer.on, pointer.in && !press ? 1 : 0, dt * 0.4);
      const TIERS = 8;
      const tiers = Array.from({ length: TIERS }, () => new Path2D());
      for (let row = Math.floor(-oy / vs) - 1; row * vs + oy < h + cell; row++) {
        const cy = row * vs + oy;
        const shift = row & 1 ? half : 0;
        for (let col = Math.floor((-ox - shift) / hs) - 1; col * hs + ox + shift < w + hs; col++) {
          const cx = col * hs + ox + shift;
          let light = Math.max(0, 1 - (Math.hypot(cx - w / 2, cy - h / 2) / far) * 0.82);
          light *= light;
          const reach = Math.hypot(cx - pointer.x, cy - pointer.y);
          if (reach < near) light += (1 - reach / near) ** 2 * 0.75 * pointer.on;
          if (light < 0.03) continue;
          // Só três lados: os outros três são dos vizinhos.
          const trace = tiers[Math.min(TIERS - 1, Math.floor(light * TIERS))];
          trace.moveTo(cx, cy - cell);
          trace.lineTo(cx + half, cy - rise);
          trace.lineTo(cx + half, cy + rise);
          trace.lineTo(cx, cy + cell);
        }
      }
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink();
      tiers.forEach((trace, tier) => {
        ctx.globalAlpha = 0.016 + 0.12 * ((tier + 0.5) / TIERS);
        ctx.stroke(trace);
      });
    }
    ctx.translate(cam.x.x, cam.y.x);
    ctx.scale(k, k);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    orbit = ease(orbit, focused || graph ? 0 : 1, dt);
    if (orbit > 0.01) {
      ctx.globalAlpha = 0.1 * orbit;
      ctx.strokeStyle = ink();
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([0, 7 / k]);
      ctx.lineDashOffset = 0;
      ctx.beginPath();
      ctx.arc(center.x, center.y, depts[0]?.d.x ?? 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Os anéis: a faixa da memória e uma linha para cada camada.
    if (deco.rings * G > 0.01 && scene.rings) {
      const ring = scene.rings;
      const on = deco.rings * G;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.03 * on;
      ctx.fillStyle = ink();
      ctx.beginPath();
      ctx.arc(0, 0, ring.M1, 0, TAU);
      ctx.arc(0, 0, ring.M0, 0, TAU, true);
      ctx.fill();
      ctx.lineWidth = 1 / k;
      ctx.globalAlpha = 0.4 * on;
      ctx.strokeStyle = routine();
      ctx.beginPath();
      ctx.arc(0, 0, ring.S, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = linked();
      ctx.beginPath();
      ctx.arc(0, 0, ring.A, 0, TAU);
      ctx.stroke();
    }
    for (const node of [center, ...depts]) {
      const big = node === focused ? 1 : 0;
      const size = node === center ? 320 : 300 + 320 * big;
      const lift = big * 180;
      ctx.globalAlpha = (node === center ? 0.1 : 0.13 + 0.05 * big) * fade(node, 0.3);
      ctx.drawImage(glow(area(node)), node.x + Math.cos(node.dir) * lift - size / 2, node.y + Math.sin(node.dir) * lift - size / 2, size, size);
    }
    // E cada pasta aberta acende o leque dela.
    for (const node of all) {
      node.glow = ease(node.glow, node.open && !node.dept && node !== center ? 1 : 0, dt);
      if (node.glow < 0.01 || !focused) continue;
      const size = 260 + node.half * 1.2;
      const ux = Math.cos(focused.dir);
      const uy = Math.sin(focused.dir);
      ctx.globalAlpha = 0.11 * node.glow * fadeD(node, 0.3);
      ctx.drawImage(glow(area(node)), node.x + ux * 110 - size / 2, node.y + uy * 110 - size / 2, size, size);
    }

    // 3. As ligações.
    for (const node of all) {
      const from = node.from;
      if (!from) continue;
      const spoke = node.link === "spoke";
      // O raio do centro a um departamento vale nas duas vistas; o resto é do leque.
      const show = spoke ? clamp(node.o.x) * D + clamp(node.go.x) * G * (0.8 - 0.45 * deco.rings) : clamp(node.o.x) * D;
      if (show < 0.02) continue;
      const both = Math.min(node.lit, from.lit);
      const on = spot * both;
      const alpha = show * (1 - spot * (1 - both) * 0.85);
      const color = area(node);
      ctx.setLineDash([]);
      ctx.beginPath();
      if (spoke) {
        const reach = Math.hypot(node.x - from.x, node.y - from.y) || 1;
        const ux = (node.x - from.x) / reach;
        const uy = (node.y - from.y) / reach;
        const x0 = from.x + ux * (from.r + 6);
        const y0 = from.y + uy * (from.r + 6);
        const x1 = node.x - ux * node.r;
        const y1 = node.y - uy * node.r;
        const line = ctx.createLinearGradient(x0, y0, x1, y1);
        line.addColorStop(0, ink(0.05));
        line.addColorStop(1, color(0.5));
        ctx.strokeStyle = line;
        ctx.globalAlpha = alpha * (0.55 + 0.45 * on);
        ctx.lineWidth = 1 / k;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const beat = (time * 0.16 + depts.indexOf(node) * 0.29) % 1.7;
        if (beat < 1 && !calm) {
          const t = beat * beat * (3 - 2 * beat);
          ctx.globalAlpha = alpha * Math.sin(Math.PI * beat) * 0.9;
          ctx.drawImage(glow(color), x0 + (x1 - x0) * t - 9, y0 + (y1 - y0) * t - 9, 18, 18);
        }
        continue;
      }
      // As hastes correm na direção do foco, em qualquer nível do leque.
      const hub = node.hub ?? from;
      const ux = Math.cos(hub.dir);
      const uy = Math.sin(hub.dir);
      const dx = node.x - from.x;
      const dy = node.y - from.y;
      const along = dx * ux + dy * uy;
      const across = dy * ux - dx * uy;
      const base = along + (node.base - along) * clamp(node.s.x);
      const bx = from.x + ux * base - uy * across;
      const by = from.y + uy * base + ux * across;
      const top = along - node.r - (14 + (node.lines.length + (node.note ? 1 : 0)) * LINE) * node.text;
      if (top > base) {
        ctx.strokeStyle = kind(node)();
        ctx.globalAlpha = alpha * (0.22 + 0.25 * on);
        ctx.lineWidth = 1 / k;
        ctx.moveTo(bx, by);
        ctx.lineTo(from.x + ux * top - uy * across, from.y + uy * top + ux * across);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = color();
        ctx.arc(bx, by, 1.8 / k, 0, TAU);
        ctx.fill();
        ctx.beginPath();
      }
      // Sem haste (um ponto recolhido), o fio sai da borda do ponto.
      const gap = top > base ? 0 : node.r / Math.max(1e-6, Math.hypot(from.x - bx, from.y - by));
      ctx.strokeStyle = color();
      ctx.globalAlpha = alpha * (0.4 + 0.45 * on);
      ctx.lineWidth = 1.5 / k;
      dotted(k, calm ? 0 : (time * 16) / k);
      ctx.moveTo(bx + (from.x - bx) * gap, by + (from.y - by) * gap);
      ctx.lineTo(from.x, from.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Nas outras vistas, um fio curvo de cada item ao dono; quase some nos
    // anéis, e acende com quem está sob o mouse.
    if (G > 0.01) {
      const rest = 0.2 - 0.15 * deco.rings;
      ctx.lineWidth = 1 / k;
      const wire = (node, to, i, weight) => {
        const show = Math.min(clamp(node.go.x), clamp(to.go.x)) * G;
        if (show < 0.02) return;
        const both = Math.min(node.lit, to.lit);
        const on = spot * both;
        ctx.globalAlpha = show * weight * (rest + (0.7 - rest) * on) * (1 - spot * (1 - both) * 0.8);
        ctx.strokeStyle = kind(node)();
        const bow = (i % 2 ? 1 : -1) * (0.06 + (((i * 97) % 13) / 13) * 0.08);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.quadraticCurveTo((node.x + to.x) / 2 - (to.y - node.y) * bow, (node.y + to.y) / 2 + (to.x - node.x) * bow, to.x, to.y);
        ctx.stroke();
      };
      all.forEach((node, i) => {
        if (node.gl) wire(node, node.gl, i, 1);
        if (node.kind === "app") node.wires.forEach((to, j) => to !== node.gl && wire(node, to, i + j + 1, 0.7));
      });
    }

    // 4. Os nós.
    const hot = (node) => (node === hover || node === looked || node === sel ? 1 : 0);
    // O departamento e, no leque, cada item: um círculo com o desenho dentro.
    const body = (node, alpha, i) => {
      const { x, y, r } = node;
      const color = kind(node);
      const hovered = hot(node);
      const hub = clamp(node.s.x - 1);
      const full = clamp((r * k - 4) / 3);
      if (full < 1) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * (1 - full) * (0.75 + 0.25 * hovered);
        ctx.fillStyle = ctx.strokeStyle = color();
        ctx.lineWidth = 1.2 / k;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(r, 1.6 / k), 0, TAU);
        if (node.folder) ctx.stroke(); // a pasta é um anel; o resto, um ponto
        else ctx.fill();
        if (full <= 0) return;
      }
      ctx.globalCompositeOperation = "lighter";
      const shine = hub * (0.4 + 0.25 * clamp(node.s.x - 2)) + (1 - hub) * 0.18 + hovered * 0.5;
      ctx.globalAlpha = alpha * full * shine;
      ctx.drawImage(glow(color), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * full;
      ctx.fillStyle = space();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color(node.dept || node.folder ? 0.18 + 0.08 * hub : 0.08);
      ctx.fill();
      ctx.lineWidth = (hub ? 1.5 : 1.2) / k + 0.25;
      ctx.strokeStyle = color(0.95);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle = color();
      const g = r * 0.38;
      if (node.kind === "skill") {
        ctx.beginPath();
        ctx.moveTo(x, y - g);
        ctx.lineTo(x + g, y);
        ctx.lineTo(x, y + g);
        ctx.lineTo(x - g, y);
        ctx.fill();
      } else if (node.kind === "routine") {
        ctx.lineWidth = 1.1 / k + 0.15;
        ctx.beginPath();
        ctx.arc(x, y, g, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, g * 0.38, 0, TAU);
        ctx.fill();
        const a = time * 0.9 + i;
        ctx.globalAlpha = alpha * full * 0.9;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.5 / k + 0.4, 0, TAU);
        ctx.fill();
      } else if (r * k > 6.5) {
        icon(node.dept ? node.path : node.folder ? "folder" : "page", x, y, r * (hub ? 1.1 : 1.25), color());
      }
      const focusRing = clamp(node.s.x - 2);
      if (focusRing > 0.01) {
        ctx.globalAlpha = alpha * focusRing * 0.5;
        ctx.strokeStyle = color();
        ctx.lineWidth = 1 / k;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = alpha * focusRing * 0.4;
        ctx.beginPath();
        for (let t = 0; t < 48; t++) {
          const a = (t / 48) * TAU + time * 0.15;
          const inner = r + 13;
          const outer = inner + (t % 4 ? 2.5 : 5);
          ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
          ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
        }
        ctx.stroke();
      }
      // Nas outras vistas, o departamento escolhido ganha um aro.
      if (node === sel) {
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = ink();
        ctx.lineWidth = 1.2 / k;
        ctx.beginPath();
        ctx.arc(x, y, r + 5 / k, 0, TAU);
        ctx.stroke();
      }
    };
    // Nas outras vistas, cada item é um sinal pequeno: a página é um ponto, a
    // pasta um anel, a skill um losango, a rotina um anel com uma lua e a
    // aplicação um hexágono.
    const mark = (node, alpha, i) => {
      const { x, y, r } = node;
      const color = kind(node);
      const hovered = node === hover || node === sel ? 1 : 0;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * (0.22 + 0.5 * hovered);
      const halo = r * (node.kind === "app" ? 2.4 : 3.6);
      ctx.drawImage(glow(color), x - halo, y - halo, halo * 2, halo * 2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ctx.strokeStyle = color();
      ctx.lineWidth = 1.2 / k + 0.2;
      ctx.beginPath();
      if (node.kind === "app") {
        for (let side = 0; side < 6; side++) {
          const angle = UP + (side * TAU) / 6;
          ctx[side ? "lineTo" : "moveTo"](x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fillStyle = space();
        ctx.fill();
        ctx.fillStyle = color(0.16);
        ctx.fill();
        ctx.stroke();
        if (r * k > 6) {
          ctx.fillStyle = color();
          ctx.font = font(600, r * 0.95);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.label[0], x, y + r * 0.06);
        }
      } else if (node.kind === "skill") {
        const g = r * 1.25;
        ctx.moveTo(x, y - g);
        ctx.lineTo(x + g, y);
        ctx.lineTo(x, y + g);
        ctx.lineTo(x - g, y);
        ctx.fill();
      } else if (node.kind === "routine") {
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.36, 0, TAU);
        ctx.fill();
        const a = time * 0.9 + i;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.3 / k + 0.35, 0, TAU);
        ctx.fill();
      } else if (node.folder) {
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = space();
        ctx.fill();
        ctx.fillStyle = color(node.exp ? 0.16 : 0.34);
        ctx.fill();
        ctx.stroke();
        // Fechada, a pasta diz quanto guarda.
        if (!node.exp && node.items.length && r * k > 7) {
          ctx.fillStyle = color();
          ctx.font = font(600, r * 0.95);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(node.items.length), x, y + r * 0.06);
        }
      } else {
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      if (hovered) {
        ctx.globalAlpha = alpha * (node === sel ? 0.85 : 0.5);
        ctx.strokeStyle = ink();
        ctx.lineWidth = 1.2 / k;
        ctx.beginPath();
        ctx.arc(x, y, r + (node === sel ? 4.5 + Math.sin(time * 3) * 0.8 : 3) / k + (node.kind === "skill" ? r * 0.25 : 0), 0, TAU);
        ctx.stroke();
      }
    };
    for (const [i, node] of all.entries()) {
      if (node === center) {
        const alpha = fade(node);
        if (alpha < 0.01) continue;
        const { x, y, r } = node;
        const hovered = hot(node);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = space();
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * (0.35 + 0.25 * hovered);
        ctx.drawImage(glow(ink), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        const spin = time * 0.1;
        const tilt = 0.42;
        const [cs, ss, ct, st] = [Math.cos(spin), Math.sin(spin), Math.cos(tilt), Math.sin(tilt)];
        ctx.fillStyle = ink();
        for (let p = 0; p < SPHERE.length; p += 3) {
          const px = SPHERE[p] * cs + SPHERE[p + 2] * ss;
          const pz = SPHERE[p + 2] * cs - SPHERE[p] * ss;
          const py = SPHERE[p + 1] * ct - pz * st;
          const depth = (SPHERE[p + 1] * st + pz * ct + 1) / 2;
          const size = (0.7 + 1.3 * depth) / Math.max(1, k * 0.8);
          ctx.globalAlpha = alpha * (0.1 + 0.8 * depth * depth);
          ctx.fillRect(x + px * r - size / 2, y + py * r - size / 2, size, size);
        }
        ctx.globalAlpha = alpha * 0.2;
        ctx.strokeStyle = ink();
        ctx.lineWidth = 1 / k;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, TAU);
        ctx.stroke();
      } else if (node.dept) {
        const alpha = fade(node);
        if (alpha >= 0.01) body(node, alpha, i);
      } else {
        const folded = fadeD(node);
        if (folded >= 0.01) body(node, folded, i);
        const loose = fadeG(node);
        if (loose >= 0.01) mark(node, loose, i);
      }
    }

    // 5. Na tela: a borda escura e os nomes.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(veil, 0, 0, w, h);
    ctx.lineJoin = "round";
    ctx.strokeStyle = space(0.92);
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0px";
    const screen = (node) => [node.x * k + cam.x.x, node.y * k + cam.y.x];
    const write = (text, x, y, alpha, fill) => {
      ctx.globalAlpha = alpha;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
    };
    const boxes = [];
    const size = TEXT * k;
    ctx.lineWidth = Math.max(2, size * 0.36);
    if (D > 0.01) {
      for (const node of all) {
        if (!node.parent || node.s.x >= 1.5) continue;
        const open = node.shown && size >= 4;
        node.text = ease(node.text, !graph && (open || (node === hover && !node.shown)) ? 1 : 0, dt);
        if (node.text < 0.02) continue;
        const [sx, sy] = screen(node);
        // No leque, o nome chega quando o item chega: nada se atropela no caminho.
        const alpha = node.text * fadeD(node, 0.16) * (node.shown ? clamp(node.s.x * 2 - 1) : 1);
        if (!node.shown) {
          ctx.font = font(500, 11);
          ctx.textAlign = "left";
          ctx.lineWidth = 4;
          write(node.label, sx + node.r * k + 7, sy, alpha, ink());
          ctx.lineWidth = Math.max(2, size * 0.36);
          continue;
        }
        ctx.font = font(500, size);
        ctx.textAlign = "center";
        const y0 = sy + node.r * k;
        let y = y0 + (8 + LINE / 2) * k;
        for (const line of node.lines) {
          write(line, sx, y, alpha * 0.94, ink());
          y += LINE * k;
        }
        if (node.note) {
          ctx.font = font(400, 10 * k, mono);
          write(node.note, sx, y, alpha * 0.85, routine());
          y += LINE * k;
        }
        const half = (node.width * k) / 2;
        boxes.push({ node, x0: sx - half, y0, x1: sx + half, y1: y - (LINE / 2) * k });
      }
    }
    const clash = (mine) => boxes.some((o) => mine.x0 < o.x1 && mine.x1 > o.x0 && mine.y0 < o.y1 && mine.y1 > o.y0);
    ctx.letterSpacing = "2.4px";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    const always = (node) => node === center || node === focused;
    const hubs = all.filter((node) => node.s.x >= 1.5 && node.o.x >= 0.02).sort((a, b) => Number(always(b)) - Number(always(a)));
    for (const node of hubs) {
      const text = node.label.toUpperCase();
      ctx.font = font(600, always(node) ? 11 : 10);
      const tw = measure(text);
      const [sx, sy] = screen(node);
      // Nos departamentos o nome fica do lado de dentro do anel; nas outras
      // vistas, embaixo.
      const inX = node === center ? 0 : -Math.cos(node.dir) * D;
      const inY = node === center ? 1 : -Math.sin(node.dir) * D + G;
      const gap = node.r * k + (node === center ? 16 : 13);
      const x = sx + inX * (gap + tw / 2);
      const y = sy + inY * (gap + 6);
      const mine = { node, x0: x - tw / 2, y0: y - 8, x1: x + tw / 2, y1: y + 8 };
      const free = always(node) || !clash(mine);
      node.text = ease(node.text, free ? 1 : 0, dt);
      if (free) boxes.push(mine);
      const alpha = clamp((node.s.x - 1.5) * 2) * fade(node, 0.3) * node.text;
      write(text, x, y, alpha, (node === center ? ink : area(node))(node === focused ? 1 : 0.92));
    }
    if (G > 0.01) {
      // O nome de cada anel, em cima, no vão entre um e outro.
      const rings = deco.rings * G * clamp((k - 0.42) * 5);
      if (rings > 0.01 && scene.rings) {
        const ring = scene.rings;
        ctx.font = font(600, 10.5);
        ctx.letterSpacing = "2.8px";
        ctx.lineWidth = 5;
        const name = (text, at, fill) => write(text, cam.x.x, cam.y.x - at * k, rings * 0.9, fill);
        name("MEMÓRIA", (ring.M1 + ring.S) / 2, ink(0.82));
        name("SKILLS", (ring.S + ring.A) / 2, routine());
        name("APLICAÇÕES", ring.A + 22, linked());
      }
      // Os nomes dos itens: o que está sob o mouse, o escolhido e quem se liga
      // a ele; de perto, todos os que couberem.
      ctx.letterSpacing = "0px";
      ctx.font = font(500, 10.5);
      ctx.lineWidth = 3.5;
      const crowd = opts.names && k >= 1.15;
      for (const node of all) {
        if (!node.parent || node.dept) continue;
        const chosen = node === hover || node === sel;
        const kin = lead && lead !== node && lead.parent && !lead.dept && spot > 0.5 && tied(node, lead);
        const wanted = clamp(node.go.x) > 0.5 && (chosen || kin || crowd);
        if (!wanted && node.gtext < 0.02) {
          node.gtext = 0;
          continue;
        }
        const [sx, sy] = screen(node);
        const tw = measure(node.label);
        const y = sy + node.r * k + 11;
        const mine = { node, x0: sx - tw / 2 - 4, y0: y - 7, x1: sx + tw / 2 + 4, y1: y + 7 };
        const fits = wanted && sx > -60 && sx < w + 60 && sy > -20 && sy < h + 20 && (chosen || !clash(mine));
        node.gtext = ease(node.gtext, fits ? 1 : 0, dt);
        if (fits) boxes.push(mine);
        if (node.gtext < 0.02) continue;
        write(node.label, sx, y, node.gtext * fadeG(node, 0.3), ink(chosen ? 1 : 0.86));
      }
    }
    ctx.letterSpacing = "0px";
    names = boxes;
  };

  // --- Mouse ---
  const local = (event) => {
    const bounds = canvas.getBoundingClientRect();
    // O quadro pode estar em escala (no canvas de design): converte para px do canvas.
    return [((event.clientX - bounds.left) * canvas.clientWidth) / bounds.width, ((event.clientY - bounds.top) * canvas.clientHeight) / bounds.height];
  };
  const hold = () => {
    for (const s of [cam.k, cam.x, cam.y]) {
      s.to = s.x;
      s.v = 0;
    }
  };
  const hit = (x, y) => {
    const wx = (x - cam.x.x) / cam.k.x;
    const wy = (y - cam.y.x) / cam.k.x;
    const graph = mode !== "depts";
    let best = null;
    let near = Infinity;
    for (const node of all) {
      const there = graph ? node.go.to > 0.5 && node.go.x > 0.5 : node.o.to && node.o.x > 0.5;
      const reach = node.r + 6 / cam.k.x;
      const distance = (node.x - wx) ** 2 + (node.y - wy) ** 2;
      if (there && distance < reach * reach && distance < near) {
        near = distance;
        best = node;
      }
    }
    return best ?? names.find((box) => x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1)?.node ?? null;
  };
  const listen = new AbortController();
  const on = (type, handler) => canvas.addEventListener(type, handler, { signal: listen.signal, passive: false });
  on("wheel", (event) => {
    event.preventDefault();
    const [x, y] = local(event);
    const k = clamp(cam.k.x * Math.exp(-event.deltaY * 0.0014), 0.2, 6);
    cam.x.x = x - ((x - cam.x.x) * k) / cam.k.x;
    cam.y.x = y - ((y - cam.y.x) * k) / cam.k.x;
    cam.k.x = k;
    hold();
  });
  on("pointerdown", (event) => {
    const [x, y] = local(event);
    canvas.setPointerCapture(event.pointerId);
    press = { node: hit(x, y), x, y, x0: x, y0: y, camX: cam.x.x - x, camY: cam.y.x - y, moved: false };
    hooks.touch?.();
  });
  on("pointermove", (event) => {
    const [x, y] = local(event);
    pointer.x = x;
    pointer.y = y;
    pointer.in = true;
    if (!press) {
      const was = hover;
      hover = hit(x, y);
      canvas.style.cursor = hover ? "pointer" : "grab";
      // Nas outras vistas, uma etiqueta acompanha o mouse.
      if (hover !== was) hooks.hover?.(mode !== "depts" && hover ? describe(hover) : null);
      hooks.point?.(x, y);
    } else if (press.moved || Math.hypot(x - press.x0, y - press.y0) > 5) {
      if (!press.moved) {
        hooks.hover?.(null);
        if (press.node?.parent && mode !== "depts") wake();
      }
      press.moved = true;
      press.x = x;
      press.y = y;
      canvas.style.cursor = "grabbing";
      if (!press.node?.parent) {
        cam.x.x = press.camX + x;
        cam.y.x = press.camY + y;
        hold();
      }
    }
  });
  on("pointerleave", () => {
    pointer.in = false;
    if (!press) {
      hover = null;
      hooks.hover?.(null);
    }
  });
  const release = () => {
    const node = press?.node;
    if (node && !press.moved) pick(node);
    // No vazio, tudo volta a fechar.
    if (press && !node && !press.moved) {
      if (mode === "depts") unlook();
      else if (sel) select(null);
    }
    // Nas vistas soltas, nada fica onde foi solto: as casas voltam para o
    // layout antes de as molas medirem o repouso.
    if (node?.parent && press.moved && mode !== "depts") {
      seat();
      springs?.release();
    }
    if (node?.parent && press.moved && mode === "depts") {
      const parent = node.parent;
      const base = node.dept ? turn.x : parent.dir;
      node.d.x = Math.hypot(node.x - parent.x, node.y - parent.y);
      node.a.x = node.a.to + wrap(node.dir - base - node.a.to);
      node.a.v = node.d.v = 0;
    }
    press = null;
    canvas.style.cursor = "grab";
  };
  on("pointerup", release);
  on("pointercancel", release);

  path = arrange(scene, null, turn);
  raf = requestAnimationFrame(tick);
  return {
    focus,
    look: (target) => look(find(target)),
    step,
    escape,
    mode: setMode,
    set,
    filter(next) {
      filters.layers = next.layers;
      filters.areas = next.areas;
      refresh();
    },
    expand,
    remove(target) {
      const node = find(target);
      if (node && node !== center && !node.dept) {
        node.removed = true;
        refresh(true);
      }
      return all.filter((item) => item.removed).length;
    },
    restore() {
      for (const node of all) node.removed = false;
      refresh(true);
    },
    go,
    fly: (target) => {
      const node = find(target);
      if (node) fly(node);
    },
    toggle,
    search,
    recenter: aim,
    // O que o cartão mostraria de um item, pelo caminho (os links do leitor).
    info: (target) => describe(find(target)),
    // Onde a câmera está, para uma cena nova continuar dali.
    camera: () => ({ k: cam.k.x, x: cam.x.x, y: cam.y.x }),
    stop() {
      settle();
      cancelAnimationFrame(raf);
      listen.abort();
    },
  };
}

export default startBrain;
