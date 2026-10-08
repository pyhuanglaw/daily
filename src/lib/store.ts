import { RoutineDB, DB_NAME } from './db';
import { applyOp, type Op } from './domain';
import { newId } from './id';
import type { FullData } from './types';

export type AppState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | ({ status: 'ready'; saveError: string | null } & FullData);

type ReadyState = Extract<AppState, { status: 'ready' }>;

interface LoggedOp {
  seq: number;
  op: Op;
  persisted: boolean;
}

function message(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

/**
 * Holds the app state for React and serialises every IndexedDB write through
 * one queue, so writes are applied in exactly the order the user made them.
 *
 * UI updates are optimistic: an op is applied in memory immediately and the
 * same op is then applied inside a transaction. If a write fails the error is
 * shown and the state is reloaded from the database, so the screen never
 * claims something is saved when it is not.
 */
export class AppStore {
  private state: AppState = { status: 'loading' };
  private listeners = new Set<() => void>();
  private db: RoutineDB | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private idleWaiters: (() => void)[] = [];
  private seq = 0;
  private log: LoggedOp[] = [];
  /** Ops dispatched but not yet handed to a transaction. */
  private batch: LoggedOp[] = [];
  private flushQueued = false;
  /** Highest op seq that has been handed to a transaction (in queue order). */
  private flushedSeq = 0;
  /** Called with true while writes are in flight, false when everything is saved. */
  onSavingChange: ((saving: boolean) => void) | null = null;
  private reloading: Promise<void> | null = null;
  private reloadAgain = false;
  private channel: BroadcastChannel | null = null;
  private readonly tabId = newId();

  constructor(private readonly dbName: string = DB_NAME) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): AppState => this.state;

  private set(next: AppState) {
    this.state = next;
    for (const fn of this.listeners) fn();
  }

  private patchReady(patch: Partial<ReadyState>) {
    if (this.state.status !== 'ready') return;
    this.set({ ...this.state, ...patch });
  }

  async init(): Promise<void> {
    try {
      this.db = await RoutineDB.open(this.dbName);
      const data = await this.enqueue(() => this.db!.loadOrInit(Date.now()));
      this.set({ status: 'ready', saveError: null, ...data });
    } catch (err) {
      this.set({ status: 'error', error: message(err) });
      return;
    }
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`daily-routine:${this.dbName}`);
        this.channel.onmessage = (e: MessageEvent) => {
          if (e.data?.from !== this.tabId) void this.reload();
        };
      } catch {
        this.channel = null;
      }
    }
  }

  dispose(): void {
    this.channel?.close();
    this.db?.close();
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pending++ === 0) this.onSavingChange?.(true);
    const p = this.queue.then(fn);
    this.queue = p.then(
      () => this.done(),
      () => this.done(),
    );
    return p;
  }

  private done() {
    this.pending--;
    if (this.pending === 0) {
      this.onSavingChange?.(false);
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** Resolves when every queued write has finished. */
  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  get hasPendingWrites(): boolean {
    return this.pending > 0;
  }

  private notifyOtherTabs() {
    try {
      this.channel?.postMessage({ from: this.tabId });
    } catch {
      /* ignore */
    }
  }

  dispatch(op: Op): void {
    const s = this.state;
    if (s.status !== 'ready' || !this.db) return;
    const domain = { tasks: s.tasks, cycle: s.cycle, meta: s.meta };
    const next = applyOp(domain, op);
    if (next === domain) return;
    this.set({ ...s, ...next });

    const entry: LoggedOp = { seq: ++this.seq, op, persisted: false };
    this.log.push(entry);
    this.batch.push(entry);
    if (!this.flushQueued) {
      this.flushQueued = true;
      void this.enqueue(() => this.flush());
    }
  }

  /**
   * Writes every op dispatched so far in ONE transaction. A burst of taps
   * therefore becomes a single atomic write instead of many small ones.
   */
  private async flush(): Promise<void> {
    this.flushQueued = false;
    const entries = this.batch;
    this.batch = [];
    if (entries.length === 0 || !this.db) return;
    this.flushedSeq = entries[entries.length - 1].seq;
    try {
      await this.db.applyOps(entries.map((e) => e.op));
    } catch (err) {
      this.log = this.log.filter((e) => !entries.includes(e));
      this.patchReady({ saveError: `儲存失敗：${message(err)}。畫面已改回實際保存的內容。` });
      void this.reload();
      return;
    }
    for (const e of entries) e.persisted = true;
    if (!this.reloading) this.log = this.log.filter((e) => !e.persisted);
    this.notifyOtherTabs();
  }

  /**
   * Re-reads everything from IndexedDB. Ops not yet written when the read ran
   * are re-applied on top, so a reload never hides newer taps.
   */
  reload(): Promise<void> {
    if (!this.db || this.state.status !== 'ready') return Promise.resolve();
    if (this.reloading) {
      this.reloadAgain = true;
      return this.reloading;
    }
    const db = this.db;
    this.reloading = this.enqueue(async () => {
      // Everything up to flushedSeq is in the database by now (the queue is serial);
      // later ops are still waiting and get re-applied on top of what we read.
      const since = this.flushedSeq;
      return { since, data: await db.readAll() };
    })
      .then(
        ({ since, data }) => {
          let domain = { tasks: data.tasks, cycle: data.cycle, meta: data.meta };
          for (const e of this.log) if (e.seq > since) domain = applyOp(domain, e.op);
          this.log = this.log.filter((e) => e.seq > since && !e.persisted);
          if (this.state.status === 'ready') this.set({ ...this.state, ...domain, history: data.history });
        },
        (err) => {
          this.patchReady({ saveError: `讀取資料失敗：${message(err)}` });
        },
      )
      .finally(() => {
        this.reloading = null;
        if (this.reloadAgain) {
          this.reloadAgain = false;
          void this.reload();
        }
      });
    return this.reloading;
  }

  /**
   * 開始新的一天：封存本輪並建立新循環（同一個交易內完成）。
   * Returns 'stale' when the cycle had already been replaced (double tap).
   */
  async startNewCycle(): Promise<'ok' | 'stale'> {
    const s = this.state;
    if (s.status !== 'ready' || !this.db) throw new Error('資料尚未載入');
    const expected = s.cycle.id;
    const db = this.db;
    const result = await this.enqueue(() => db.startNewCycle(expected, Date.now(), newId())).catch((err) => {
      this.patchReady({ saveError: `開始新的一天失敗：${message(err)}。資料沒有變更。` });
      throw err;
    });
    if (result.status === 'stale') {
      await this.reload();
      return 'stale';
    }
    const cur = this.state;
    if (cur.status === 'ready') {
      this.set({
        ...cur,
        cycle: result.cycle,
        history: [result.archived, ...cur.history.filter((h) => h.id !== result.archived.id)],
      });
    }
    this.notifyOtherTabs();
    return 'ok';
  }

  /** Replaces everything with validated backup data. */
  async importData(data: FullData): Promise<void> {
    if (!this.db) throw new Error('資料尚未載入');
    const db = this.db;
    await this.enqueue(() => db.replaceAll(data)).catch((err) => {
      this.patchReady({ saveError: `匯入失敗：${message(err)}。原本的資料沒有變更。` });
      throw err;
    });
    this.log = [];
    await this.reload();
    this.notifyOtherTabs();
  }

  dismissSaveError(): void {
    this.patchReady({ saveError: null });
  }
}
