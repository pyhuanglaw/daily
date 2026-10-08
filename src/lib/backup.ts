import { sortHistory } from './db';
import {
  SCHEMA_VERSION,
  STAGE_IDS,
  type AppMeta,
  type ArchivedCycle,
  type ArchivedTask,
  type CurrentCycle,
  type FullData,
  type StageId,
  type TaskProgress,
  type TaskTemplate,
} from './types';

export const BACKUP_APP_ID = 'daily-routine';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  formatVersion: number;
  exportedAt: string;
  data: {
    meta: AppMeta;
    tasks: TaskTemplate[];
    currentCycle: CurrentCycle;
    history: ArchivedCycle[];
  };
}

export function buildBackup(data: FullData, now: number = Date.now()): BackupFile {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: {
      meta: data.meta,
      tasks: data.tasks,
      currentCycle: data.cycle,
      history: data.history,
    },
  };
}

export function backupFileName(now: number = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `daily-routine-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export type ParseResult = { ok: true; data: FullData; exportedAt: string | null } | { ok: false; error: string };

class InvalidBackup extends Error {}

function fail(msg: string): never {
  throw new InvalidBackup(msg);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStage = (v: unknown): v is StageId => isStr(v) && (STAGE_IDS as readonly string[]).includes(v);
const numOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const strOrNull = (v: unknown): v is string | null => v === null || isStr(v);

function strArray(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || !v.every(isStr)) fail(`${where} 的科目選項格式錯誤`);
  return [...v];
}

function parseTask(v: unknown, i: number): TaskTemplate {
  const where = `第 ${i + 1} 個任務`;
  if (!isObj(v)) fail(`${where} 格式錯誤`);
  if (!isStr(v.id) || !v.id) fail(`${where} 缺少 id`);
  if (!isStr(v.name)) fail(`${where} 缺少名稱`);
  if (!isStage(v.stage)) fail(`${where} 的階段不正確`);
  if (!isNum(v.order)) fail(`${where} 的順序不正確`);
  return {
    id: v.id,
    stage: v.stage,
    name: v.name,
    order: v.order,
    subjects: strArray(v.subjects, where),
    createdAt: isNum(v.createdAt) ? v.createdAt : 0,
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : 0,
  };
}

function parseProgress(v: unknown, where: string): TaskProgress {
  if (!isObj(v) || typeof v.done !== 'boolean' || !numOrNull(v.completedAt) || !strOrNull(v.subject)) {
    fail(`${where} 的完成狀態格式錯誤`);
  }
  return { done: v.done, completedAt: v.completedAt, subject: v.subject };
}

function parseCycle(v: unknown): CurrentCycle {
  if (!isObj(v)) fail('缺少當前生活循環');
  if (!isStr(v.id) || !v.id || !isNum(v.startedAt)) fail('當前生活循環格式錯誤');
  if (!isObj(v.progress)) fail('當前生活循環的完成狀態格式錯誤');
  const progress: Record<string, TaskProgress> = {};
  for (const [k, p] of Object.entries(v.progress)) progress[k] = parseProgress(p, '當前生活循環');
  return { id: v.id, startedAt: v.startedAt, progress };
}

function parseArchivedTask(v: unknown, where: string): ArchivedTask {
  if (!isObj(v)) fail(`${where} 的任務格式錯誤`);
  if (!isStr(v.id) || !isStr(v.name) || !isStage(v.stage) || !isNum(v.order)) fail(`${where} 的任務格式錯誤`);
  if (typeof v.done !== 'boolean' || !numOrNull(v.completedAt) || !strOrNull(v.subject)) fail(`${where} 的完成狀態格式錯誤`);
  return {
    id: v.id,
    stage: v.stage,
    name: v.name,
    order: v.order,
    subjects: strArray(v.subjects, where),
    done: v.done,
    completedAt: v.completedAt,
    subject: v.subject,
  };
}

function parseHistory(v: unknown): ArchivedCycle[] {
  if (!Array.isArray(v)) fail('歷史紀錄格式錯誤');
  const ids = new Set<string>();
  return v.map((h, i) => {
    const where = `第 ${i + 1} 筆歷史紀錄`;
    if (!isObj(h) || !isStr(h.id) || !h.id || !isNum(h.startedAt) || !isNum(h.endedAt)) fail(`${where} 格式錯誤`);
    if (ids.has(h.id)) fail(`${where} 的 id 重複`);
    ids.add(h.id);
    if (!Array.isArray(h.tasks)) fail(`${where} 缺少任務清單`);
    return { id: h.id, startedAt: h.startedAt, endedAt: h.endedAt, tasks: h.tasks.map((t) => parseArchivedTask(t, where)) };
  });
}

function parseMeta(v: unknown, fallbackNow: number): AppMeta {
  const m = isObj(v) ? v : {};
  return {
    key: 'app',
    schemaVersion: SCHEMA_VERSION,
    createdAt: isNum(m.createdAt) ? m.createdAt : fallbackNow,
    lastExportAt: isNum(m.lastExportAt) ? m.lastExportAt : null,
    onboardingDismissed: typeof m.onboardingDismissed === 'boolean' ? m.onboardingDismissed : true,
  };
}

/** Validates a backup file. Never touches stored data. */
export function parseBackup(text: string, now: number = Date.now()): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '檔案不是有效的 JSON，請確認選擇的是 Daily Routine 匯出的備份檔。' };
  }
  try {
    if (!isObj(raw) || raw.app !== BACKUP_APP_ID) fail('這不是 Daily Routine 的備份檔。');
    if (!isNum(raw.formatVersion)) fail('備份檔缺少資料格式版本。');
    if (raw.formatVersion > BACKUP_FORMAT_VERSION) {
      fail(`備份檔的格式版本（${raw.formatVersion}）比目前網站新，請先更新網站後再匯入。`);
    }
    if (raw.formatVersion < 1) fail('備份檔的格式版本不正確。');
    const d = raw.data;
    if (!isObj(d)) fail('備份檔缺少資料內容。');
    if (!Array.isArray(d.tasks)) fail('備份檔缺少任務清單。');
    const tasks = d.tasks.map(parseTask);
    const ids = new Set<string>();
    for (const t of tasks) {
      if (ids.has(t.id)) fail(`任務 id 重複：${t.name}`);
      ids.add(t.id);
    }
    const cycle = parseCycle(d.currentCycle);
    // Drop progress for tasks that no longer exist so the data stays consistent.
    for (const k of Object.keys(cycle.progress)) if (!ids.has(k)) delete cycle.progress[k];
    const history = parseHistory(d.history ?? []);
    if (history.some((h) => h.id === cycle.id)) fail('當前生活循環與歷史紀錄的 id 重複。');
    const meta = parseMeta(d.meta, now);
    return {
      ok: true,
      data: { tasks, cycle, meta, history: sortHistory(history) },
      exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : null,
    };
  } catch (err) {
    if (err instanceof InvalidBackup) return { ok: false, error: err.message };
    throw err;
  }
}
