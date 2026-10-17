import { type Analysis, type EngineLine, parseInfo } from "./uci";

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** UCI "Skill Level" 0..20 (default 20). */
  skill?: number;
  /** Partial results while searching (live analysis). */
  onUpdate?: (a: Analysis) => void;
}

interface Job {
  fen: string;
  opts: SearchOptions;
  resolve: (a: Analysis) => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish.js`;

/**
 * Stockfish in a Web Worker, one search at a time. A new search with `interrupt` stops the
 * current one (live analysis); otherwise searches are queued (batch game analysis).
 */
export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines = new Map<number, EngineLine>();
  private maxDepth = 0;
  private listeners: ((line: string) => void)[] = [];
  private options = { multipv: 0, skill: -1 };
  private dead = false;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent) => this.onLine(String(e.data));
    this.worker.onerror = (e) => {
      this.dead = true;
      this.current?.reject(e);
      this.queue.forEach((j) => j.reject(e));
    };
    this.ready = (async () => {
      await this.waitFor("uci", (l) => l === "uciok");
      this.send("setoption name Hash value 32");
      await this.isReady();
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(cmd: string | null, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        if (done(line)) {
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve();
        }
      };
      this.listeners.push(l);
      if (cmd) this.send(cmd);
    });
  }

  private isReady() {
    return this.waitFor("isready", (l) => l === "readyok");
  }

  private onLine(line: string) {
    this.listeners.forEach((l) => l(line));
    const job = this.current;
    if (!job) return;
    if (line.startsWith("info")) {
      const parsed = parseInfo(line, job.fen.split(" ")[1] !== "b");
      if (!parsed) return;
      this.lines.set(parsed.multipv, parsed);
      if (parsed.multipv === 1) this.maxDepth = parsed.depth;
      if (job.opts.onUpdate && !job.cancelled && parsed.multipv === (job.opts.multipv ?? 1)) job.opts.onUpdate(this.snapshot(job, null));
    } else if (line.startsWith("bestmove")) {
      const best = line.split(" ")[1];
      const result = this.snapshot(job, best && best !== "(none)" ? best : null);
      this.current = null;
      if (job.cancelled) job.reject(new Error("cancelled"));
      else job.resolve(result);
      void this.next();
    }
  }

  private snapshot(job: Job, bestmove: string | null): Analysis {
    const lines = [...this.lines.values()].filter((l) => l.multipv <= (job.opts.multipv ?? 1)).sort((a, b) => a.multipv - b.multipv);
    return { fen: job.fen, depth: this.maxDepth, bestmove: bestmove ?? lines[0]?.pv[0] ?? null, lines };
  }

  private async next(): Promise<void> {
    if (this.current || this.dead) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.cancelled) {
      job.reject(new Error("cancelled"));
      return this.next();
    }
    this.current = job;
    await this.ready;
    const multipv = job.opts.multipv ?? 1;
    const skill = job.opts.skill ?? 20;
    if (multipv !== this.options.multipv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      this.options.multipv = multipv;
    }
    if (skill !== this.options.skill) {
      this.send(`setoption name Skill Level value ${skill}`);
      this.options.skill = skill;
    }
    this.lines = new Map();
    this.maxDepth = 0;
    this.send(`position fen ${job.fen}`);
    const go = job.opts.depth ? `go depth ${job.opts.depth}` : `go movetime ${job.opts.movetime ?? 1000}`;
    this.send(go);
  }

  analyse(fen: string, opts: SearchOptions = {}, interrupt = false): { promise: Promise<Analysis>; cancel: () => void } {
    let job!: Job;
    const promise = new Promise<Analysis>((resolve, reject) => {
      job = { fen, opts, resolve, reject, cancelled: false };
    });
    promise.catch(() => undefined);
    if (interrupt) {
      this.queue.forEach((j) => (j.cancelled = true));
      if (this.current) {
        this.current.cancelled = true;
        this.send("stop");
      }
    }
    this.queue.push(job);
    void this.next();
    return {
      promise,
      cancel: () => {
        job.cancelled = true;
        if (this.current === job) this.send("stop");
      },
    };
  }

  /** Clears the hash between unrelated games. */
  newGame() {
    this.send("ucinewgame");
  }

  stop() {
    this.queue.forEach((j) => (j.cancelled = true));
    if (this.current) {
      this.current.cancelled = true;
      this.send("stop");
    }
  }

  terminate() {
    this.dead = true;
    this.worker.terminate();
  }
}

let shared: Engine | null = null;
/** One engine for interactive use (live eval, mascot moves, hints). Batch analysis creates its own. */
export function sharedEngine(): Engine {
  shared ??= new Engine();
  return shared;
}
