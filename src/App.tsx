// Busca a árvore do cérebro e a mantém em dia: quando algo muda no wiki ou
// nas skills, o servidor avisa e o mapa se refaz sem recarregar a página.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BrainTree } from "../server/scan";
import { Brain } from "./Brain";
import { css } from "./css";
import { Onboarding } from "./components/Onboarding";
import { paintAreas } from "./brain/areaStyle";

export function App() {
  const [tree, setTree] = useState<BrainTree | null>(null);
  const [error, setError] = useState(false);
  const last = useRef("");

  const fetchTree = useCallback(() => {
    fetch("/api/tree", { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => {
        setError(false);
        if (text === last.current) return;
        last.current = text;
        setTree(JSON.parse(text) as BrainTree);
      })
      .catch(() => setError(true));
  }, []);

  // Sem cérebro (nenhuma página e nenhuma skill), o app abre a criação guiada.
  const [setup, setSetup] = useState<{ brain: string; empty: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/brain/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSetup(data ? { brain: data.brain, empty: data.empty } : { brain: "", empty: false }))
      .catch(() => setSetup({ brain: "", empty: false }));
  }, []);

  useEffect(() => {
    fetchTree();
    const hot = import.meta.hot;
    hot?.on("brain:changed", fetchTree);
    window.addEventListener("focus", fetchTree);
    return () => {
      hot?.off?.("brain:changed", fetchTree);
      window.removeEventListener("focus", fetchTree);
    };
  }, [fetchTree]);

  if (setup?.empty)
    return (
      <Onboarding
        brain={setup.brain}
        onDone={() => {
          setSetup({ ...setup, empty: false });
          last.current = "";
          fetchTree();
        }}
      />
    );
  if (!tree || !setup)
    return (
      <div
        style={css(
          "display: grid; place-items: center; height: 100vh; background: oklch(0.135 0.008 268); color: oklch(0.74 0.012 268); font-family: Geist, system-ui, sans-serif; font-size: 13px",
        )}
      >
        {error ? "Não deu para ler o cérebro. Confira a pasta em BRAIN_DIR." : ""}
      </div>
    );
  // Pastas com nomes fora do padrão ganham cor antes de o mapa ler as cores.
  paintAreas(tree.areas.map((area) => area.path));
  return <Brain tree={tree.areas} apps={tree.apps} owners={(tree as BrainTree & { owners?: Record<string, string> }).owners} />;
}
