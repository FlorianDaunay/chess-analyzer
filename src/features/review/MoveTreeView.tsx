import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { MoveTree, TreeNode } from "@/core/chess/tree";
import type { GameAnalysis } from "@/core/analysis/classify";
import { CLASS_STYLE } from "@/ui/palette";
import { scrollWithin } from "@/ui/scroll";

/** Game moves with nested variations "( … )". Main-line moves show their classification. */
export function MoveTreeView({ tree, current, onSelect, analysis }: { tree: MoveTree; current: string; onSelect: (id: string) => void; analysis?: GameAnalysis | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollWithin(ref.current, ref.current?.querySelector("[data-current='true']"));
  }, [current]);

  const moveEl = (node: TreeNode, showNumber: boolean, main: boolean) => {
    const cls = main && analysis ? analysis.moves[node.ply - 1]?.cls : undefined;
    const style = cls ? CLASS_STYLE[cls] : undefined;
    const white = node.ply % 2 === 1;
    return (
      <button
        key={node.id}
        data-current={node.id === current}
        onClick={() => onSelect(node.id)}
        className={`mx-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${node.id === current ? "bg-accent text-accent-foreground" : "hover:bg-surface-hover"} ${main ? "font-semibold" : ""}`}
      >
        {(showNumber || white) && <span className={node.id === current ? "" : "text-text-muted"}>{Math.ceil(node.ply / 2)}{white ? "." : "..."}</span>}
        {node.san}
        {style && ["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"].includes(cls!) && (
          <span className="text-[11px] font-bold" style={{ color: node.id === current ? undefined : style.color }}>
            {style.symbol}
          </span>
        )}
      </button>
    );
  };

  const line = (startId: string, main: boolean, depth: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let node = tree.nodes[startId];
    let needNumber = true;
    while (node && node.children.length) {
      const [first, ...vars] = node.children.map((c) => tree.nodes[c]);
      out.push(moveEl(first, needNumber, main));
      needNumber = false;
      for (const v of vars) {
        out.push(
          <span key={"v" + v.id} className={`${depth === 0 ? "my-1 block border-l-2 border-border pl-2" : "inline"} text-text-secondary`}>
            {depth > 0 && "( "}
            {moveEl(v, true, false)}
            {line(v.id, false, depth + 1)}
            {depth > 0 && " )"}
          </span>
        );
        needNumber = true;
      }
      node = first;
    }
    return out;
  };

  return (
    <div ref={ref} className="no-scrollbar max-h-72 overflow-y-auto font-mono text-sm leading-7 lg:max-h-[38vh]">
      {tree.nodes[tree.rootId].children.length === 0 ? <p className="font-sans text-sm muted">No moves. Play on the board to explore.</p> : <Fragment>{line(tree.rootId, true, 0)}</Fragment>}
    </div>
  );
}
