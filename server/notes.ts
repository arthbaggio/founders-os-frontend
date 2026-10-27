// As notas: o que se anota rápido para mandar ao wiki. Cada nota é um .md em
// fontes/notas/, com a data no nome e a origem no topo, como pede o CLAUDE.md.
// Na caixa, a nota é rascunho e muda à vontade. Gravada no wiki pelo Processar,
// ela vira fonte e não muda mais: em fontes/, nada se edita depois.
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export type Note = {
  id: string;
  title: string;
  body: string;
  status: "caixa" | "enviada";
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
};

// O id é AAAA-MM-DD-hhmmss, a hora em que a nota nasceu. O arquivo leva o id e,
// se havia título quando foi criado, um resumo dele: <id>-<titulo>.md. O resumo
// fica como nasceu; o título de verdade mora no topo do arquivo.
const ID = /^\d{4}-\d{2}-\d{2}-\d{6}$/;
export const NOTES_DIR = "fontes/notas";

const slug = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");

export function noteStore(brain: string) {
  const dir = join(brain, NOTES_DIR);
  const fileName = (id: string): string | null => {
    if (!ID.test(id)) return null;
    try {
      return readdirSync(dir).find((name) => name === id + ".md" || (name.startsWith(id + "-") && name.endsWith(".md"))) ?? null;
    } catch {
      return null;
    }
  };
  const file = (id: string) => {
    const name = fileName(id);
    return name ? join(dir, name) : null;
  };

  const read = (id: string): Note | null => {
    const path = file(id);
    if (!path) return null;
    const text = readFileSync(path, "utf8");
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    const meta: Record<string, string> = {};
    for (const line of (match ? match[1] : "").split("\n")) {
      const at = line.match(/^([\w-]+)\s*:\s*(.*)$/);
      if (at) meta[at[1]] = at[2].trim();
    }
    const time = (value: string | undefined) => (value && !Number.isNaN(Date.parse(value)) ? Date.parse(value) : null);
    let title = meta.titulo ?? "";
    try {
      if (title.startsWith('"')) title = JSON.parse(title);
    } catch {
      // Um título escrito à mão, sem aspas: vale como está.
    }
    const body = (match ? text.slice(match[0].length) : text).replace(/^\n/, "").replace(/\n$/, "");
    const updatedAt = statSync(path).mtimeMs;
    return {
      id,
      title,
      body,
      status: meta.status === "enviada" ? "enviada" : "caixa",
      createdAt: time(meta.criada) ?? updatedAt,
      updatedAt,
      sentAt: time(meta.enviada),
    };
  };

  const write = (note: Pick<Note, "id" | "title" | "body" | "status" | "createdAt" | "sentAt">) => {
    mkdirSync(dir, { recursive: true });
    const meta = [
      "origem: nota do Arthur, escrita no Founders OS",
      "criada: " + new Date(note.createdAt).toISOString(),
      "status: " + note.status,
      ...(note.sentAt ? ["enviada: " + new Date(note.sentAt).toISOString()] : []),
      "titulo: " + JSON.stringify(note.title),
    ];
    const name = fileName(note.id) ?? note.id + (slug(note.title) ? "-" + slug(note.title) : "") + ".md";
    writeFileSync(join(dir, name), "---\n" + meta.join("\n") + "\n---\n\n" + note.body + "\n");
    return read(note.id)!;
  };

  return {
    get: read,

    // O caminho do arquivo da nota, a partir da raiz do cérebro.
    path: (id: string) => {
      const name = fileName(id);
      return name ? NOTES_DIR + "/" + name : null;
    },

    list(): Note[] {
      let names: string[] = [];
      try {
        names = readdirSync(dir).filter((name) => name.endsWith(".md"));
      } catch {
        return [];
      }
      return names
        .map((name) => read(name.slice(0, 17)))
        .filter((note): note is Note => !!note)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    // Guarda o rascunho. Vazia, a nota não vira arquivo (e, se já era, some).
    save(id: string, title: string, body: string): { note: Note | null; error?: string } {
      if (!ID.test(id)) return { note: null, error: "Nota inválida" };
      const was = read(id);
      if (was?.status === "enviada") return { note: was, error: "A nota já é fonte e não muda mais" };
      if (!title.trim() && !body.trim()) {
        if (was) unlinkSync(file(id)!);
        return { note: null };
      }
      return { note: write({ id, title, body, status: "caixa", createdAt: was?.createdAt ?? Date.now(), sentAt: null }) };
    },

    // Gravada no wiki: a nota fica como está, agora como fonte.
    send(id: string): Note | null {
      const was = read(id);
      if (!was) return null;
      if (was.status === "enviada") return was;
      return write({ ...was, status: "enviada", sentAt: Date.now() });
    },

    // Só um rascunho pode ser apagado; uma fonte fica.
    remove(id: string): boolean {
      const was = read(id);
      if (!was || was.status === "enviada") return false;
      unlinkSync(file(id)!);
      return true;
    },
  };
}
