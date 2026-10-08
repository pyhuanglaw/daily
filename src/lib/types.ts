export type StageId = 'wake' | 'study' | 'sleep';

export const STAGES: readonly { id: StageId; name: string }[] = [
  { id: 'wake', name: '起床' },
  { id: 'study', name: '唸書' },
  { id: 'sleep', name: '睡前' },
];

export const STAGE_IDS: readonly StageId[] = STAGES.map((s) => s.id);

export function stageName(id: StageId): string {
  return STAGES.find((s) => s.id === id)?.name ?? id;
}

/** A. 永久任務模板：每一輪生活循環的預設清單。 */
export interface TaskTemplate {
  id: string;
  stage: StageId;
  name: string;
  /** 0-based position within its stage. */
  order: number;
  /** 可選科目（空陣列代表此任務沒有科目選擇）。 */
  subjects: string[];
  createdAt: number;
  updatedAt: number;
}

/** B. 當前生活循環中某個任務的完成狀態。 */
export interface TaskProgress {
  done: boolean;
  completedAt: number | null;
  subject: string | null;
}

export interface CurrentCycle {
  id: string;
  startedAt: number;
  /** Keyed by task id. Missing entries mean "not done, no subject". */
  progress: Record<string, TaskProgress>;
}

/** 已封存歷史中的任務快照：當時的名稱、分類、順序與完成狀態。 */
export interface ArchivedTask {
  id: string;
  stage: StageId;
  name: string;
  order: number;
  subjects: string[];
  done: boolean;
  completedAt: number | null;
  subject: string | null;
}

/** C. 已封存的歷史生活循環（唯讀快照）。 */
export interface ArchivedCycle {
  id: string;
  startedAt: number;
  endedAt: number;
  tasks: ArchivedTask[];
}

/** D. 使用者設定及資料版本。 */
export interface AppMeta {
  key: 'app';
  schemaVersion: number;
  createdAt: number;
  lastExportAt: number | null;
  onboardingDismissed: boolean;
}

export interface Domain {
  tasks: TaskTemplate[];
  cycle: CurrentCycle;
  meta: AppMeta;
}

export interface FullData extends Domain {
  history: ArchivedCycle[];
}

export const SCHEMA_VERSION = 1;
