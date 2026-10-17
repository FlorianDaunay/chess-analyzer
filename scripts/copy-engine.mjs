// Copies the single-threaded lite Stockfish build into public/engine (no COOP/COEP needed, works on GitHub Pages).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "stockfish", "src");
const out = join("public", "engine");
if (!existsSync(src)) process.exit(0);
mkdirSync(out, { recursive: true });
const files = readdirSync(src);
const js = files.find((f) => /^stockfish-.*-lite-single-[0-9a-f]+\.js$/.test(f));
const wasm = files.find((f) => /^stockfish-.*-lite-single-[0-9a-f]+\.wasm$/.test(f));
if (!js || !wasm) throw new Error("Stockfish lite-single build not found in " + src);
copyFileSync(join(src, js), join(out, "stockfish.js"));
copyFileSync(join(src, wasm), join(out, "stockfish.wasm"));
console.log(`engine: ${js} -> public/engine/stockfish.js`);
