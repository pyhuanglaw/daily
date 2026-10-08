import { IDBFactory } from 'fake-indexeddb';
import { tasksInStage } from '../../src/lib/domain';
import { AppStore } from '../../src/lib/store';
import type { FullData, StageId } from '../../src/lib/types';

/** Fresh, empty IndexedDB for every test. */
export function resetIndexedDB() {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
}

/** Simulates opening the site: a new store instance reading the same database. */
export async function openApp(): Promise<AppStore> {
  const store = new AppStore();
  await store.init();
  if (store.getState().status !== 'ready') throw new Error(JSON.stringify(store.getState()));
  return store;
}

/** Simulates closing the site and opening it again. */
export async function reopen(store: AppStore): Promise<AppStore> {
  await store.whenIdle();
  store.dispose();
  return openApp();
}

export function data(store: AppStore): FullData {
  const s = store.getState();
  if (s.status !== 'ready') throw new Error('not ready');
  return s;
}

export function names(store: AppStore, stage: StageId): string[] {
  return tasksInStage(data(store).tasks, stage).map((t) => t.name);
}

export function taskId(store: AppStore, stage: StageId, name: string, nth = 0): string {
  const list = tasksInStage(data(store).tasks, stage).filter((t) => t.name === name);
  if (!list[nth]) throw new Error(`task not found: ${stage}/${name}`);
  return list[nth].id;
}

export function isDone(store: AppStore, id: string): boolean {
  return data(store).cycle.progress[id]?.done ?? false;
}
