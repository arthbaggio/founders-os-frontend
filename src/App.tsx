// Busca a árvore do cérebro e a mantém em dia: quando algo muda no wiki ou
// nas skills, o servidor avisa e o mapa se refaz sem recarregar a página.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BrainTree } from "../server/scan";
import { Brain } from "./Brain";
import { css } from "./css";

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

  if (!tree)
    return (
      <div
        style={css(
          "display: grid; place-items: center; height: 100vh; background: oklch(0.135 0.008 268); color: oklch(0.74 0.012 268); font-family: Geist, system-ui, sans-serif; font-size: 13px",
        )}
      >
        {error ? "Não deu para ler o cérebro. Confira a pasta em BRAIN_DIR." : ""}
      </div>
    );
  return <Brain tree={tree.areas} apps={tree.apps} />;
}
