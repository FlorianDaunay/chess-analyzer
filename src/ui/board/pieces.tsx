export type PieceCode = "wK" | "wQ" | "wR" | "wB" | "wN" | "wP" | "bK" | "bQ" | "bR" | "bB" | "bN" | "bP";

/** Piece set: cburnett (Colin M.L. Burnett), via lichess. */
const urls = import.meta.glob<string>("@/assets/pieces/*.svg", { eager: true, query: "?url", import: "default" });

export const PIECE_URL = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url])
) as Record<PieceCode, string>;

export const PIECE_NAMES: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };

export function PieceImg({ code, className = "" }: { code: PieceCode; className?: string }) {
  return <img src={PIECE_URL[code]} alt={`${code[0] === "w" ? "White" : "Black"} ${PIECE_NAMES[code[1]]}`} draggable={false} className={`h-full w-full ${className}`} />;
}
