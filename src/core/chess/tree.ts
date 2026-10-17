import { Chess } from "chess.js";
import { uciToMove } from "./game";

/**
 * A game with variations: the main line comes from the game, every move the user tries
 * elsewhere creates a side line ("edit the game to see how other moves would have gone").
 */
export interface TreeNode {
  id: string;
  parent: string | null;
  /** Move that leads to this node (absent on the root). */
  uci?: string;
  san?: string;
  fen: string;
  /** Half-move index from the start (root = 0). */
  ply: number;
  children: string[];
  /** Clock of the mover after this move, seconds (from the PGN). */
  clock?: number;
}

export interface MoveTree {
  rootId: string;
  nodes: Record<string, TreeNode>;
  /** Length of the original game, so the UI can tell game moves from explored moves. */
  mainLength: number;
}

let counter = 0;
const newId = () => `n${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createTree(startFen: string): MoveTree {
  const root: TreeNode = { id: "root", parent: null, fen: startFen, ply: 0, children: [] };
  return { rootId: root.id, nodes: { root }, mainLength: 0 };
}

export function treeFromMoves(startFen: string, ucis: string[], clocks?: (number | undefined)[]): MoveTree {
  let tree = createTree(startFen);
  let at = tree.rootId;
  ucis.forEach((uci, i) => {
    const res = addMove(tree, at, uci);
    if (!res) return;
    tree = res.tree;
    at = res.nodeId;
    if (clocks?.[i] !== undefined) tree.nodes[at].clock = clocks[i];
  });
  tree.mainLength = ucis.length;
  return tree;
}

/** Plays a move from a node. Reuses an existing child if that move was already explored. */
export function addMove(tree: MoveTree, fromId: string, uci: string): { tree: MoveTree; nodeId: string } | null {
  const from = tree.nodes[fromId];
  if (!from) return null;
  const chess = new Chess(from.fen);
  let move;
  try {
    move = chess.move(uciToMove(uci));
  } catch {
    return null;
  }
  const existing = from.children.find((c) => tree.nodes[c].uci === move.lan);
  if (existing) return { tree, nodeId: existing };
  const node: TreeNode = { id: newId(), parent: fromId, uci: move.lan, san: move.san, fen: chess.fen(), ply: from.ply + 1, children: [] };
  return {
    tree: { ...tree, nodes: { ...tree.nodes, [fromId]: { ...from, children: [...from.children, node.id] }, [node.id]: node } },
    nodeId: node.id,
  };
}

/** Nodes from the root to `id` (root excluded). */
export function pathTo(tree: MoveTree, id: string): TreeNode[] {
  const path: TreeNode[] = [];
  let node: TreeNode | undefined = tree.nodes[id];
  while (node && node.parent !== null) {
    path.unshift(node);
    node = tree.nodes[node.parent];
  }
  return path;
}

/** Main line (first child at every step) from a node. */
export function mainLineFrom(tree: MoveTree, id: string): TreeNode[] {
  const line: TreeNode[] = [];
  let node = tree.nodes[id];
  while (node?.children.length) {
    node = tree.nodes[node.children[0]];
    line.push(node);
  }
  return line;
}

export const mainLine = (tree: MoveTree) => mainLineFrom(tree, tree.rootId);

export function isOnMainLine(tree: MoveTree, id: string): boolean {
  let node = tree.nodes[id];
  while (node && node.parent !== null) {
    const parent = tree.nodes[node.parent];
    if (parent.children[0] !== node.id) return false;
    node = parent;
  }
  return true;
}

/** Removes a node and its subtree. */
export function deleteNode(tree: MoveTree, id: string): MoveTree {
  const node = tree.nodes[id];
  if (!node || node.parent === null) return tree;
  const nodes = { ...tree.nodes };
  const drop = (nid: string) => {
    nodes[nid].children.forEach(drop);
    delete nodes[nid];
  };
  drop(id);
  const parent = nodes[node.parent];
  nodes[node.parent] = { ...parent, children: parent.children.filter((c) => c !== id) };
  return { ...tree, nodes };
}

/** Moves a variation one step up among its siblings (index 0 = main line). */
export function promoteNode(tree: MoveTree, id: string): MoveTree {
  const node = tree.nodes[id];
  if (!node || node.parent === null) return tree;
  const parent = tree.nodes[node.parent];
  const i = parent.children.indexOf(id);
  if (i <= 0) return tree;
  const children = [...parent.children];
  [children[i - 1], children[i]] = [children[i], children[i - 1]];
  return { ...tree, nodes: { ...tree.nodes, [parent.id]: { ...parent, children } } };
}

export function moveNumberLabel(ply: number): string {
  const n = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${n}.` : `${n}...`;
}
