// Builds src/data/openings.json from the lichess chess-openings TSV files (CC0).
// Usage: node scripts/build-openings.mjs <dir-with-a..e.tsv>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";

const dir = process.argv[2];
const rows = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const lines = readFileSync(join(dir, f + ".tsv"), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split("\t");
    const chess = new Chess();
    chess.loadPgn(pgn);
    const sans = chess.history();
    const epd = chess.fen().split(" ").slice(0, 4).join(" ");
    rows.push([eco, name, sans.join(" "), epd]);
  }
}
writeFileSync("src/data/openings.json", JSON.stringify(rows));
console.log(rows.length, "openings");
