import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";
import { GuideWidget } from "@/ui/mascot/GuideWidget";
import { useGuide } from "@/ui/mascot/guide";

export const NAV: { to: string; label: string; icon: IconName; mobile?: boolean }[] = [
  { to: "/", label: "Home", icon: "home", mobile: true },
  { to: "/analyze", label: "Analyze", icon: "chart", mobile: true },
  { to: "/play", label: "Play", icon: "play", mobile: true },
  { to: "/train", label: "Train", icon: "target", mobile: true },
  { to: "/online", label: "Online", icon: "users", mobile: true },
  { to: "/tournament", label: "Tournament", icon: "trophy" },
  { to: "/board", label: "Free board", icon: "grid" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <NavLink to="/" className="mb-4 flex items-center gap-2 px-2 py-1">
          <Mascot size={36} />
          <span className="text-lg font-extrabold tracking-tight text-sidebar-text-strong">Chess Lab</span>
        </NavLink>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-sidebar-active text-sidebar-text-active" : "text-sidebar-text hover:bg-sidebar-hover"
                }`
              }
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-sidebar-text opacity-70">v{__APP_VERSION__} · Stockfish 17.1</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-2 backdrop-blur lg:hidden">
          <NavLink to="/" className="flex items-center gap-2">
            <Mascot size={28} />
            <span className="font-extrabold tracking-tight">Chess Lab</span>
          </NavLink>
          <div className="flex gap-1">
            <button className="btn-icon btn-ghost" onClick={() => useGuide.getState().setOpen(!useGuide.getState().open)} aria-label="Hoot, your guide">
              <Mascot size={22} />
            </button>
            <NavLink to="/tournament" className="btn-icon btn-ghost" aria-label="Tournament">
              <Icon name="trophy" />
            </NavLink>
            <NavLink to="/board" className="btn-icon btn-ghost" aria-label="Free board">
              <Icon name="grid" />
            </NavLink>
            <NavLink to="/settings" className="btn-icon btn-ghost" aria-label="Settings">
              <Icon name="settings" />
            </NavLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-accent" : "text-text-muted"}`}
          >
            <Icon name={n.icon} size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <GuideWidget />
    </div>
  );
}
