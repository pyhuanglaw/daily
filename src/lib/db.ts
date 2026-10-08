import { buildDefaultTasks, buildMeta, buildNewCycle } from './defaults';
import { applyOp, archiveCycle, type Op } from './domain';
import type { AppMeta, ArchivedCycle, CurrentCycle, Domain, FullData, TaskTemplate } from './types';

/**
 * IndexedDB layout (database "daily-routine", version 1):
 *
 *   tasks         永久任務模板        keyPath "id"
 *   currentCycle  當前生活循環        single record under key "current"
 *   history       已封存的歷史循環    keyPath "id", index "endedAt"
 *   meta          設定及資料版本      keyPath "key" (record "app")
 *
 * Every write is a single readwrite transaction that reads the current
 * records, applies the change and writes the result, so a later write can
 * never be overwritten by an older snapshot. Promises resolve only after the
 * transaction has committed.
 */

export const DB_NAME = 'daily-routine';
const DB_VERSION = 1;
const CURRENT_KEY = 'current';

const ALL_STORES = ['tasks', 'currentCycle', 'history', 'meta'] as const;
type StoreName = (typeof ALL_STORES)[number];

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export type StartCycleResult =
  | { status: 'ok'; archived: ArchivedCycle; cycle: CurrentCycle }
  | { status: 'stale' };

export class RoutineDB {
  private constructor(private readonly db: IDBDatabase) {
    db.onversionchange = () => db.close();
  }

  static open(name: string = DB_NAME): Promise<RoutineDB> {
    return new Promise((resolve, reject) => {
      const factory = globalThis.indexedDB;
      if (!factory) {
        reject(new Error('此瀏覽器不支援 IndexedDB，無法保存資料。'));
        return;
      }
      const request = factory.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('currentCycle')) db.createObjectStore('currentCycle');
        if (!db.objectStoreNames.contains('history')) {
          const h = db.createObjectStore('history', { keyPath: 'id' });
          h.createIndex('endedAt', 'endedAt');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(new RoutineDB(request.result));
      request.onerror = () => reject(request.error ?? new Error('無法開啟資料庫'));
      request.onblocked = () => reject(new Error('資料庫被其他分頁佔用，請關閉其他 Daily Routine 分頁後重試。'));
    });
  }

  close(): void {
    this.db.close();
  }

  private run<T>(stores: readonly StoreName[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(stores as StoreName[], mode);
      } catch (err) {
        reject(err);
        return;
      }
      let result: T;
      let bodyError: unknown = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(bodyError ?? tx.error ?? new Error('寫入被中止'));
      body(tx).then(
        (r) => {
          result = r;
          // All requests are issued: commit now instead of waiting for the event loop (Safari 15+, Chrome 76+).
          try {
            (tx as IDBTransaction & { commit?: () => void }).commit?.();
          } catch {
            /* already committing */
          }
        },
        (err) => {
          bodyError = err;
          try {
            tx.abort();
          } catch {
            /* already finished */
          }
        },
      );
    });
  }

  private async readDomain(tx: IDBTransaction): Promise<Domain | null> {
    const [tasks, cycle, meta] = await Promise.all([
      req(tx.objectStore('tasks').getAll() as IDBRequest<TaskTemplate[]>),
      req(tx.objectStore('currentCycle').get(CURRENT_KEY) as IDBRequest<CurrentCycle | undefined>),
      req(tx.objectStore('meta').get('app') as IDBRequest<AppMeta | undefined>),
    ]);
    if (!meta || !cycle) return null;
    return { tasks, cycle, meta };
  }

  /**
   * Loads everything. Seeds the default list only when the database has never
   * been initialised (no meta record). An empty task list is a valid user state
   * and is never replaced by the defaults.
   */
  loadOrInit(now: number = Date.now()): Promise<FullData> {
    return this.run(ALL_STORES, 'readwrite', async (tx) => {
      const tasksStore = tx.objectStore('tasks');
      const cycleStore = tx.objectStore('currentCycle');
      const metaStore = tx.objectStore('meta');
      let meta = (await req(metaStore.get('app'))) as AppMeta | undefined;
      if (!meta) {
        meta = buildMeta(now);
        const existing = await req(tasksStore.count());
        if (existing === 0) for (const t of buildDefaultTasks(now)) tasksStore.put(t);
        metaStore.put(meta);
      }
      let cycle = (await req(cycleStore.get(CURRENT_KEY))) as CurrentCycle | undefined;
      if (!cycle) {
        cycle = buildNewCycle(now);
        cycleStore.put(cycle, CURRENT_KEY);
      }
      const [tasks, history] = await Promise.all([
        req(tasksStore.getAll() as IDBRequest<TaskTemplate[]>),
        req(tx.objectStore('history').getAll() as IDBRequest<ArchivedCycle[]>),
      ]);
      return { tasks, cycle, meta, history: sortHistory(history) };
    });
  }

  readAll(): Promise<FullData> {
    return this.run(ALL_STORES, 'readonly', async (tx) => {
      const domain = await this.readDomain(tx);
      if (!domain) throw new Error('資料庫尚未初始化');
      const history = await req(tx.objectStore('history').getAll() as IDBRequest<ArchivedCycle[]>);
      return { ...domain, history: sortHistory(history) };
    });
  }

  /** Applies ops in order, atomically, against what is stored right now. */
  applyOps(ops: Op[]): Promise<void> {
    return this.run(['tasks', 'currentCycle', 'meta'], 'readwrite', async (tx) => {
      const before = await this.readDomain(tx);
      if (!before) throw new Error('資料庫尚未初始化');
      const after = ops.reduce(applyOp, before);
      if (after === before) return;
      if (after.tasks !== before.tasks) {
        const store = tx.objectStore('tasks');
        const prev = new Map(before.tasks.map((t) => [t.id, t]));
        for (const t of after.tasks) {
          if (prev.get(t.id) !== t) store.put(t);
          prev.delete(t.id);
        }
        for (const id of prev.keys()) store.delete(id);
      }
      if (after.cycle !== before.cycle) tx.objectStore('currentCycle').put(after.cycle, CURRENT_KEY);
      if (after.meta !== before.meta) tx.objectStore('meta').put(after.meta);
    });
  }

  /**
   * Archives the current cycle and starts a new one in a single transaction:
   * either both happen or neither does. If the stored current cycle is no
   * longer `expectedCycleId` (e.g. a double tap already started a new one),
   * nothing is written.
   */
  startNewCycle(expectedCycleId: string, now: number, newCycleId: string): Promise<StartCycleResult> {
    return this.run(['tasks', 'currentCycle', 'history'], 'readwrite', async (tx) => {
      const cycleStore = tx.objectStore('currentCycle');
      const cycle = (await req(cycleStore.get(CURRENT_KEY))) as CurrentCycle | undefined;
      if (!cycle || cycle.id !== expectedCycleId) return { status: 'stale' } as const;
      const tasks = (await req(tx.objectStore('tasks').getAll())) as TaskTemplate[];
      const archived = archiveCycle(tasks, cycle, now);
      // add() (not put) fails if this cycle id was somehow archived already.
      await req(tx.objectStore('history').add(archived));
      const next = buildNewCycle(now, newCycleId);
      cycleStore.put(next, CURRENT_KEY);
      return { status: 'ok', archived, cycle: next } as const;
    });
  }

  /** Replaces all stored data (used by backup import). Atomic. */
  replaceAll(data: FullData): Promise<void> {
    return this.run(ALL_STORES, 'readwrite', async (tx) => {
      for (const name of ALL_STORES) tx.objectStore(name).clear();
      const tasks = tx.objectStore('tasks');
      for (const t of data.tasks) tasks.put(t);
      tx.objectStore('currentCycle').put(data.cycle, CURRENT_KEY);
      const history = tx.objectStore('history');
      for (const h of data.history) history.put(h);
      tx.objectStore('meta').put(data.meta);
    });
  }
}

export function sortHistory(history: ArchivedCycle[]): ArchivedCycle[] {
  return history.slice().sort((a, b) => b.endedAt - a.endedAt);
}
