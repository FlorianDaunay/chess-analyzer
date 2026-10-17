export interface Opening {
  eco: string;
  name: string;
  /** SAN moves of the line, space separated. */
  moves: string;
  epd: string;
}

export interface OpeningBook {
  all: Opening[];
  byEpd: Map<string, Opening>;
}

let book: Promise<OpeningBook> | null = null;

/** The opening database (lichess chess-openings, CC0) is loaded on demand: it is ~600 kB. */
export function loadOpenings(): Promise<OpeningBook> {
  book ??= import("@/data/openings.json").then((mod) => {
    const rows = (mod.default ?? mod) as unknown as [string, string, string, string][];
    const all = rows.map(([eco, name, moves, epd]) => ({ eco, name, moves, epd }));
    const byEpd = new Map<string, Opening>();
    // Several rows can reach the same position (transpositions): keep the shortest line's name.
    for (const o of all) {
      const prev = byEpd.get(o.epd);
      if (!prev || o.moves.length < prev.moves.length) byEpd.set(o.epd, o);
    }
    return { all, byEpd };
  });
  return book;
}

export const epdOf = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Deepest named opening reached along a sequence of positions. */
export function identifyOpening(b: OpeningBook, fens: string[]): { opening: Opening; ply: number } | null {
  let found: { opening: Opening; ply: number } | null = null;
  fens.forEach((fen, i) => {
    const o = b.byEpd.get(epdOf(fen));
    if (o) found = { opening: o, ply: i + 1 };
  });
  return found;
}

/** "Sicilian Defense: Najdorf Variation" → "Sicilian Defense". */
export const openingFamily = (name: string) => name.split(":")[0].trim();
