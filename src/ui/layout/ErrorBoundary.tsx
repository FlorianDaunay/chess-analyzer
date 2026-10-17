import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/ui/icons";
import { Mascot } from "@/ui/mascot/Mascot";

interface State {
  error: Error | null;
  details: string;
}

/**
 * Catches rendering errors of a page so the app never turns into a blank screen: the menu
 * stays usable and the user sees what happened. Keyed by route in the layout, so moving to
 * another page resets it.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, details: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
    if (reloadForStaleBuild(error)) return;
    this.setState({ details: `${error.name}: ${error.message}\n${info.componentStack?.trim().split("\n").slice(0, 6).join("\n") ?? ""}` });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorPanel error={this.state.error} details={this.state.details} onRetry={() => this.setState({ error: null, details: "" })} />;
  }
}

/**
 * After a new deploy, a tab opened earlier asks for page files that no longer exist. Reload once
 * to get the new version instead of showing an error.
 */
function reloadForStaleBuild(error: Error): boolean {
  if (!/dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(error.message)) return false;
  try {
    const last = Number(sessionStorage.getItem("chesslab-stale-reload") ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem("chesslab-stale-reload", String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Last resort around the whole app (layout included): a plain screen with a reload button. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <h1 className="text-xl">Chess Lab could not start</h1>
          <p className="mt-2 font-mono text-xs text-danger">{this.state.error.message}</p>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export function ErrorPanel({ error, details, onRetry }: { error: Error; details?: string; onRetry?: () => void }) {
  const report = `Chess Lab v${__APP_VERSION__}\n${navigator.userAgent}\n${location.hash}\n\n${details || `${error.name}: ${error.message}`}`;
  return (
    <div className="card mx-auto mt-6 flex max-w-xl flex-col items-center gap-3 py-8 text-center">
      <Mascot size={90} mood="sad" />
      <h1 className="text-xl">Oops, this page ran into a problem</h1>
      <p className="max-w-md text-sm text-text-secondary">
        Something went wrong while showing this page. The rest of the app still works: use the menu, or try again.
      </p>
      <p className="max-w-md rounded-control bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error.message || String(error)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button className="btn-primary" onClick={onRetry}>
            <Icon name="refresh" /> Try again
          </button>
        )}
        <button className="btn" onClick={() => location.reload()}>
          Reload the page
        </button>
        <Link to="/" className="btn" onClick={onRetry}>
          <Icon name="home" /> Home
        </Link>
      </div>
      <details className="w-full max-w-md text-left text-xs">
        <summary className="cursor-pointer muted">Technical details</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-surface-hover p-2">{report}</pre>
        <button className="btn-sm btn mt-2" onClick={() => navigator.clipboard?.writeText(report)}>
          <Icon name="copy" size={14} /> Copy details
        </button>
      </details>
    </div>
  );
}
