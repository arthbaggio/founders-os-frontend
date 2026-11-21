// Cor e ícone de qualquer departamento. O mapa tem os dos departamentos padrão
// do Founders OS (--area-<pasta> em styles.css e ICONS em ./icons). Um cérebro
// com outros nomes de pasta (conteudo, projetos, founders-os…) pegava cinza e o
// ícone de pasta. Agora a pasta herda o do padrão mais parecido pelo nome e, se
// nenhum servir, uma cor fixa da paleta (a mesma pasta, sempre a mesma cor).
import { ICONS } from "./icons";

const STANDARD = ["empresa", "produtos", "clientes", "vendas", "marketing", "operacoes", "financas", "administrativo", "compartilhado"];

const ALIASES: [RegExp, string][] = [
  [/vend|comercial|prospec|pipeline|sdr/, "vendas"],
  [/market|conteud|midia|social|brand|marca|comunic/, "marketing"],
  [/client|projet|entreg|contas|account|sucesso|cs\b/, "clientes"],
  [/financ|dinheiro|caixa|cobran|fiscal|contab/, "financas"],
  [/produt|programa|curso|mentoria|founders|oferta|servic/, "produtos"],
  [/operac|automac|process|sistema|tecnolog|ti\b|dev|engenh|suporte/, "operacoes"],
  [/admin|jurid|rh|pessoas|people|gente/, "administrativo"],
  [/compart|modelo|templat|recurso/, "compartilhado"],
];

const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// O departamento padrão mais parecido com a pasta (ou nenhum).
export function areaAlias(path: string): string | null {
  if (STANDARD.includes(path)) return path;
  const name = plain(path);
  for (const [pattern, key] of ALIASES) if (pattern.test(name)) return key;
  return null;
}

// Uma cor por pasta, fixa, para as que não lembram nenhum padrão.
const PALETTE = ["oklch(0.74 0.15 30)", "oklch(0.78 0.13 75)", "oklch(0.76 0.14 140)", "oklch(0.74 0.12 190)", "oklch(0.72 0.14 270)", "oklch(0.74 0.15 315)"];
const pick = (path: string) => PALETTE[[...path].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

// Põe --area-<pasta> no documento para as pastas que styles.css não conhece.
export function paintAreas(paths: string[]) {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const used = new Set<string>();
  for (const path of paths) {
    if (style.getPropertyValue(`--area-${path}`).trim() && !root.style.getPropertyValue(`--area-${path}`)) {
      used.add(areaAlias(path) ?? path);
      continue;
    }
    const alias = areaAlias(path);
    // Duas pastas novas com o mesmo padrão não ficam da mesma cor: a segunda vai para a paleta.
    const value = alias && !used.has(alias) ? style.getPropertyValue(`--area-${alias}`).trim() : pick(path);
    if (alias) used.add(alias);
    root.style.setProperty(`--area-${path}`, value || pick(path));
  }
}

// O desenho do departamento: o próprio, o do padrão parecido ou o de pasta.
export const areaIcon = (key: string) => ICONS[key] ?? ICONS[areaAlias(key) ?? ""] ?? ICONS.folder;
