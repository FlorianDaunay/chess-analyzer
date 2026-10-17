import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSettings } from "@/store/settings";
import { Icon } from "@/ui/icons";
import { Mascot } from "./Mascot";
import { PAGE_TIPS, useGuide } from "./guide";

export const BOARD_ROUTES = ["/play", "/review", "/board", "/online", "/tournament", "/train"];

/** Hoot, floating in a corner on every page: page tips and messages from the pages. */
export function GuideWidget() {
  const enabled = useSettings((s) => s.mascotGuide);
  const { message, mood, open, setOpen } = useGuide();
  const { pathname } = useLocation();
  const [tip, setTip] = useState(0);
  const seen = useRef(new Set<string>());
  const tips = PAGE_TIPS[pathname] ?? PAGE_TIPS["/"];

  // First visit of a page in this session: show its first tip.
  useEffect(() => {
    setTip(0);
    useGuide.setState({ message: null, mood: "idle" });
    // A bubble left open would cover the next page: close it, except on the first visit of Home.
    const firstHome = !seen.current.has(pathname) && pathname === "/";
    seen.current.add(pathname);
    setOpen(enabled && firstHome);
  }, [pathname, enabled, setOpen]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => useGuide.setState({ mood: "idle" }), 2500);
    return () => clearTimeout(t);
  }, [open, message]);

  if (!enabled) return null;
  const text = message ?? tips[tip % tips.length];
  // On phones the floating owl would cover the board: on board pages it moves to the header.
  const boardPage = BOARD_ROUTES.includes(pathname);

  return (
    <div
      className={`pointer-events-none fixed z-40 flex flex-col items-end gap-2 lg:bottom-5 lg:right-5 lg:top-auto ${
        boardPage ? "right-3 top-14 flex-col-reverse lg:flex-col" : "bottom-20 right-3"
      }`}
    >
      {open && (
        <div className="animate-pop pointer-events-auto relative max-w-[min(20rem,calc(100vw-5rem))] rounded-card border border-border bg-surface p-3 pr-8 text-sm shadow-overlay">
          <p className="leading-snug">{text}</p>
          {!message && tips.length > 1 && (
            <button className="mt-2 text-xs font-semibold text-accent" onClick={() => setTip((t) => t + 1)}>
              Next tip →
            </button>
          )}
          <button className="absolute right-2 top-2 text-text-muted hover:text-text-primary" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
          <span className="absolute -bottom-2 right-8 h-4 w-4 rotate-45 border-b border-r border-border bg-surface" />
        </div>
      )}
      <button
        className={`pointer-events-auto rounded-full transition-transform hover:scale-105 ${boardPage ? "hidden lg:block" : ""}`}
        onClick={() => {
          if (open && !message) setTip((t) => t + 1);
          else setOpen(!open);
        }}
        aria-label="Hoot, your guide"
        title="Hoot, your guide"
      >
        <Mascot size={56} mood={open ? mood : "idle"} />
      </button>
    </div>
  );
}
