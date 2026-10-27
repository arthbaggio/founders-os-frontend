import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { brainApi } from "./server/brainApi";

// A pasta do cérebro: BRAIN_DIR, ou a irmã `founders-os-brain`.
const brain = process.env.BRAIN_DIR ?? resolve(__dirname, "../founders-os-brain");
// O resultado das sessões do Claude: aqui no app, fora do cérebro.
const results = resolve(__dirname, "sessoes");

export default defineConfig({
  plugins: [react(), brainApi(brain, results)],
  server: { port: 5178, strictPort: false },
  preview: { port: 5179 },
});
