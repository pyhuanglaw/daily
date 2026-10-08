import {
  STAGE_IDS,
  type AppMeta,
  type ArchivedCycle,
  type ArchivedTask,
  type CurrentCycle,
  type Domain,
  type StageId,
  type TaskProgress,
  type TaskTemplate,
} from './types';

/**
 * Every change the user makes is expressed as an Op. The same pure function
 * (applyOp) is used for the optimistic in-memory state and inside the
 * IndexedDB transaction, so both always end up identical.
 */
export type Op =
  | { type: 'setDone'; taskId: string; done: boolean; at: number }
  | { type: 'setSubject'; taskId: string; subject: string | null }
  | { type: 'addTask'; id: string; stage: StageId; name: string; at: number }
  | { type: 'renameTask'; taskId: string; name: string; at: number }
  | { type: 'deleteTask'; taskId: string }
  | { type: 'reorderStage'; stage: StageId; orderedIds: string[]; at: number }
  | { type: 'moveTask'; taskId: string; toStage: StageId; at: number }
  | { type: 'setSubjectOptions'; taskId: string; subjects: string[]; at: number }
  | { type: 'patchMeta'; patch: Partial<Omit<AppMeta, 'key' | 'schemaVersion' | 'createdAt'>> };

export const EMPTY_PROGRESS: TaskProgress = Object.freeze({ done: false, completedAt: null, subject: null });

export function getProgress(cycle: CurrentCycle, taskId: string): TaskProgress {
  return cycle.progress[taskId] ?? EMPTY_PROGRESS;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function cleanSubjects(subjects: string[]): string[] {
  const out: string[] = [];
  for (const s of subjects) {
    const v = cleanName(s);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Tasks of one stage, in display order. */
export function tasksInStage(tasks: TaskTemplate[], stage: StageId): TaskTemplate[] {
  return tasks
    .filter((t) => t.stage === stage)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** All tasks sorted by stage, then order. */
export function sortTasks(tasks: TaskTemplate[]): TaskTemplate[] {
  return STAGE_IDS.flatMap((s) => tasksInStage(tasks, s));
}

/** Re-number `order` to 0..n-1 inside each stage. Keeps object identity for unchanged tasks. */
function normalizeOrders(tasks: TaskTemplate[]): TaskTemplate[] {
  const newOrder = new Map<string, number>();
  for (const s of STAGE_IDS) tasksInStage(tasks, s).forEach((t, i) => newOrder.set(t.id, i));
  return tasks.map((t) => {
    const o = newOrder.get(t.id) ?? t.order;
    return o === t.order ? t : { ...t, order: o };
  });
}

function updateTask(domain: Domain, taskId: string, fn: (t: TaskTemplate) => TaskTemplate): Domain {
  const idx = domain.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return domain;
  const next = fn(domain.tasks[idx]);
  if (next === domain.tasks[idx]) return domain;
  const tasks = domain.tasks.slice();
  tasks[idx] = next;
  return { ...domain, tasks };
}

function setProgress(domain: Domain, taskId: string, p: TaskProgress): Domain {
  const progress = { ...domain.cycle.progress };
  if (!p.done && p.completedAt === null && p.subject === null) delete progress[taskId];
  else progress[taskId] = p;
  return { ...domain, cycle: { ...domain.cycle, progress } };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function applyOp(domain: Domain, op: Op): Domain {
  switch (op.type) {
    case 'setDone': {
      if (!domain.tasks.some((t) => t.id === op.taskId)) return domain;
      const cur = getProgress(domain.cycle, op.taskId);
      if (cur.done === op.done) return domain;
      return setProgress(domain, op.taskId, {
        ...cur,
        done: op.done,
        completedAt: op.done ? op.at : null,
      });
    }
    case 'setSubject': {
      if (!domain.tasks.some((t) => t.id === op.taskId)) return domain;
      const cur = getProgress(domain.cycle, op.taskId);
      const subject = op.subject === null ? null : cleanName(op.subject) || null;
      if (cur.subject === subject) return domain;
      return setProgress(domain, op.taskId, { ...cur, subject });
    }
    case 'addTask': {
      const name = cleanName(op.name);
      if (!name || domain.tasks.some((t) => t.id === op.id)) return domain;
      const inStage = tasksInStage(domain.tasks, op.stage);
      const order = inStage.length ? inStage[inStage.length - 1].order + 1 : 0;
      const task: TaskTemplate = {
        id: op.id,
        stage: op.stage,
        name,
        order,
        subjects: [],
        createdAt: op.at,
        updatedAt: op.at,
      };
      return { ...domain, tasks: normalizeOrders([...domain.tasks, task]) };
    }
    case 'renameTask': {
      const name = cleanName(op.name);
      if (!name) return domain;
      return updateTask(domain, op.taskId, (t) => (t.name === name ? t : { ...t, name, updatedAt: op.at }));
    }
    case 'deleteTask': {
      if (!domain.tasks.some((t) => t.id === op.taskId)) return domain;
      const tasks = normalizeOrders(domain.tasks.filter((t) => t.id !== op.taskId));
      let next: Domain = { ...domain, tasks };
      if (op.taskId in domain.cycle.progress) {
        const progress = { ...domain.cycle.progress };
        delete progress[op.taskId];
        next = { ...next, cycle: { ...domain.cycle, progress } };
      }
      return next;
    }
    case 'reorderStage': {
      const current = tasksInStage(domain.tasks, op.stage);
      const byId = new Map(current.map((t) => [t.id, t]));
      const ordered: TaskTemplate[] = [];
      for (const id of op.orderedIds) {
        const t = byId.get(id);
        if (t) {
          ordered.push(t);
          byId.delete(id);
        }
      }
      // Anything the caller did not mention keeps its relative order at the end.
      for (const t of current) if (byId.has(t.id)) ordered.push(t);
      if (sameList(ordered.map((t) => t.id), current.map((t) => t.id))) return domain;
      const pos = new Map(ordered.map((t, i) => [t.id, i]));
      const tasks = domain.tasks.map((t) => {
        const o = pos.get(t.id);
        return o === undefined || o === t.order ? t : { ...t, order: o, updatedAt: op.at };
      });
      return { ...domain, tasks };
    }
    case 'moveTask': {
      const task = domain.tasks.find((t) => t.id === op.taskId);
      if (!task || task.stage === op.toStage) return domain;
      const target = tasksInStage(domain.tasks, op.toStage);
      const order = target.length ? target[target.length - 1].order + 1 : 0;
      const moved = updateTask(domain, op.taskId, (t) => ({ ...t, stage: op.toStage, order, updatedAt: op.at }));
      // Progress is keyed by task id, so the current completion state travels with the task.
      return { ...moved, tasks: normalizeOrders(moved.tasks) };
    }
    case 'setSubjectOptions': {
      const subjects = cleanSubjects(op.subjects);
      return updateTask(domain, op.taskId, (t) =>
        sameList(t.subjects, subjects) ? t : { ...t, subjects, updatedAt: op.at },
      );
    }
    case 'patchMeta': {
      const entries = Object.entries(op.patch) as [keyof AppMeta, unknown][];
      if (entries.every(([k, v]) => domain.meta[k] === v)) return domain;
      return { ...domain, meta: { ...domain.meta, ...op.patch } };
    }
  }
}

/** Snapshot of the given tasks + progress, in display order (used for history and the live record). */
export function snapshotTasks(tasks: TaskTemplate[], cycle: CurrentCycle): ArchivedTask[] {
  return sortTasks(tasks).map((t) => {
    const p = getProgress(cycle, t.id);
    return {
      id: t.id,
      stage: t.stage,
      name: t.name,
      order: t.order,
      subjects: [...t.subjects],
      done: p.done,
      completedAt: p.done ? p.completedAt : null,
      subject: p.subject,
    };
  });
}

export function archiveCycle(tasks: TaskTemplate[], cycle: CurrentCycle, endedAt: number): ArchivedCycle {
  return {
    id: cycle.id,
    startedAt: cycle.startedAt,
    endedAt,
    tasks: snapshotTasks(tasks, cycle),
  };
}
