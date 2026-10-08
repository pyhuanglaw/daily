import { newId } from './id';
import { SCHEMA_VERSION, type AppMeta, type CurrentCycle, type StageId, type TaskTemplate } from './types';

interface DefaultTask {
  name: string;
  subjects?: string[];
}

/**
 * 首次使用時建立的預設清單。只會在資料庫完全沒有資料（沒有 meta 紀錄）時使用一次，
 * 之後一律讀取使用者保存的清單。名稱保留原始寫法，請勿修改。
 */
export const DEFAULT_TASKS: Record<StageId, DefaultTask[]> = {
  wake: [
    { name: '叫早餐' },
    { name: '登記飼料' },
    { name: '佈置書房（電腦、燈、書）' },
    { name: '換衣服' },
    { name: '吃營養品' },
    { name: '吃早餐' },
    { name: '收早餐' },
    { name: '弄湯湯' },
    { name: '餵藥' },
    { name: '起床清貓沙' },
  ],
  study: [
    { name: '第一顆啟動' },
    { name: '第二顆：行政、刑訴、民訴', subjects: ['行政', '刑訴', '民訴'] },
    { name: '第三顆：行政、刑訴、民訴', subjects: ['行政', '刑訴', '民訴'] },
    { name: '第四顆：刑法、憲法、民法', subjects: ['刑法', '憲法', '民法'] },
  ],
  sleep: [
    { name: '睡前清貓砂' },
    { name: '睡前換水' },
    { name: '睡前洗碗' },
    { name: '睡前餵藥' },
    { name: '換衣服' },
    { name: '睡前倒除濕機水' },
    { name: '睡前喝水' },
    { name: '睡前確認' },
    { name: '睡前餵飽' },
    { name: '睡前設定飼料機' },
    { name: '睡前鬧鐘' },
  ],
};

export function buildDefaultTasks(now: number): TaskTemplate[] {
  const tasks: TaskTemplate[] = [];
  for (const stage of Object.keys(DEFAULT_TASKS) as StageId[]) {
    DEFAULT_TASKS[stage].forEach((t, order) => {
      tasks.push({
        id: newId(),
        stage,
        name: t.name,
        order,
        subjects: t.subjects ? [...t.subjects] : [],
        createdAt: now,
        updatedAt: now,
      });
    });
  }
  return tasks;
}

export function buildNewCycle(now: number, id: string = newId()): CurrentCycle {
  return { id, startedAt: now, progress: {} };
}

export function buildMeta(now: number): AppMeta {
  return {
    key: 'app',
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    lastExportAt: null,
    onboardingDismissed: false,
  };
}
