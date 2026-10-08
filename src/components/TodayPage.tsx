import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProgress, tasksInStage } from '../lib/domain';
import { newId } from '../lib/id';
import { mdhm } from '../lib/time';
import { STAGES, stageName, type StageId, type TaskTemplate } from '../lib/types';
import { useData, useStore, useToast } from '../state';
import { SunriseIcon } from './icons';
import { ActionSheet, ConfirmDialog, type SheetAction } from './Modal';
import { StageSection, type StageHandlers } from './StageSection';
import { SubjectEditor } from './SubjectEditor';

const COLLAPSE_KEY = 'daily-routine:collapsed';

function loadCollapsed(): StageId[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveCollapsed(v: StageId[]) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v));
  } catch {
    /* private mode etc. – collapsing is only a convenience */
  }
}

/** Current time, refreshed every 30 s (for "today" vs. date display of completion times). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function TodayPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const now = useNow();
  const [collapsed, setCollapsed] = useState<StageId[]>(loadCollapsed);
  const [editing, setEditing] = useState<StageId | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [subjectsFor, setSubjectsFor] = useState<string | null>(null);
  const [confirmNewDay, setConfirmNewDay] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  const byStage = useMemo(() => {
    const m = {} as Record<StageId, TaskTemplate[]>;
    for (const s of STAGES) m[s.id] = tasksInStage(data.tasks, s.id);
    return m;
  }, [data.tasks]);

  const findTask = (id: string | null) => (id ? data.tasks.find((t) => t.id === id) ?? null : null);

  const handlers = useMemo<StageHandlers>(
    () => ({
      onToggle: (taskId) => {
        const s = store.getState();
        if (s.status !== 'ready') return;
        const done = !getProgress(s.cycle, taskId).done;
        store.dispatch({ type: 'setDone', taskId, done, at: Date.now() });
      },
      onSubject: (taskId, option) => {
        const s = store.getState();
        if (s.status !== 'ready') return;
        const subject = getProgress(s.cycle, taskId).subject === option ? null : option;
        store.dispatch({ type: 'setSubject', taskId, subject });
      },
      onAdd: (stage, name) => store.dispatch({ type: 'addTask', id: newId(), stage, name, at: Date.now() }),
      onRename: (taskId, name) => store.dispatch({ type: 'renameTask', taskId, name, at: Date.now() }),
      onDelete: (task) => setDeleteFor(task.id),
      onMore: (task) => setMoreFor(task.id),
      onEditSubjects: (task) => setSubjectsFor(task.id),
      onReorder: (stage, orderedIds) => store.dispatch({ type: 'reorderStage', stage, orderedIds, at: Date.now() }),
    }),
    [store],
  );

  const onCollapse = useCallback((stage: StageId) => {
    // Commit a rename / new item being typed before its input disappears.
    (document.activeElement as HTMLElement | null)?.blur?.();
    setCollapsed((c) => {
      const next = c.includes(stage) ? c.filter((s) => s !== stage) : [...c, stage];
      saveCollapsed(next);
      return next;
    });
    setEditing((e) => (e === stage ? null : e));
  }, []);

  const onEdit = useCallback((stage: StageId) => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setEditing((e) => (e === stage ? null : stage));
  }, []);

  const moveWithin = (task: TaskTemplate, delta: number) => {
    const ids = byStage[task.stage].map((t) => t.id);
    const i = ids.indexOf(task.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    store.dispatch({ type: 'reorderStage', stage: task.stage, orderedIds: ids, at: Date.now() });
  };

  const moreTask = findTask(moreFor);
  const deleteTask = findTask(deleteFor);
  const subjectsTask = findTask(subjectsFor);

  const moreActions = (task: TaskTemplate): SheetAction[] => {
    const list = byStage[task.stage];
    const i = list.findIndex((t) => t.id === task.id);
    return [
      { label: '上移', onSelect: () => moveWithin(task, -1), disabled: i <= 0 },
      { label: '下移', onSelect: () => moveWithin(task, 1), disabled: i < 0 || i >= list.length - 1 },
      ...STAGES.filter((s) => s.id !== task.stage).map((s) => ({
        label: `移到「${s.name}」`,
        onSelect: () => {
          store.dispatch({ type: 'moveTask', taskId: task.id, toStage: s.id, at: Date.now() });
          toast.show(`已移到「${s.name}」`);
        },
      })),
      { label: '科目選項…', onSelect: () => setSubjectsFor(task.id) },
      { label: '刪除項目', destructive: true, onSelect: () => setDeleteFor(task.id) },
    ];
  };

  const startNewDay = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const res = await store.startNewCycle();
      setConfirmNewDay(false);
      setEditing(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.show(res === 'ok' ? '新的一天開始了，上一輪已保存到紀錄' : '已經開始新的一天了');
    } catch {
      setConfirmNewDay(false);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  return (
    <div className="page today">
      <header className="hero">
        <h1 className="hero-title">Daily Routine</h1>
        <p className="hero-sub">本輪開始：{mdhm(data.cycle.startedAt)}</p>
      </header>

      {!data.meta.onboardingDismissed && (
        <div className="card welcome">
          <p className="welcome-title">歡迎使用</p>
          <p>
            清單與勾選只保存在這支裝置的瀏覽器裡，不會上傳。建議先「加入主畫面」，並記得定期在「設定」匯出備份。
          </p>
          <div className="welcome-actions">
            <button type="button" className="btn btn-soft" onClick={onOpenSettings}>
              查看說明
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => store.dispatch({ type: 'patchMeta', patch: { onboardingDismissed: true } })}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {STAGES.map((s) => (
        <StageSection
          key={s.id}
          stage={s.id}
          name={s.name}
          tasks={byStage[s.id]}
          cycle={data.cycle}
          now={now}
          collapsed={collapsed.includes(s.id)}
          editing={editing === s.id}
          onCollapse={onCollapse}
          onEdit={onEdit}
          handlers={handlers}
        />
      ))}

      <div className="new-day">
        <button type="button" className="btn btn-primary btn-block" onClick={() => setConfirmNewDay(true)} disabled={starting}>
          <SunriseIcon width={22} height={22} />
          開始新的一天
        </button>
        <p className="new-day-note">勾選會清空並保存到紀錄，任務清單不會改變。</p>
      </div>

      {moreTask && (
        <ActionSheet
          title={moreTask.name}
          subtitle={stageName(moreTask.stage)}
          actions={moreActions(moreTask)}
          onClose={() => setMoreFor(null)}
        />
      )}

      {deleteTask && (
        <ConfirmDialog
          title={`刪除「${deleteTask.name}」？`}
          message="之後每一輪都不會再出現這個項目。過去的紀錄仍會保留。"
          confirmLabel="刪除"
          destructive
          onCancel={() => setDeleteFor(null)}
          onConfirm={() => {
            store.dispatch({ type: 'deleteTask', taskId: deleteTask.id });
            setDeleteFor(null);
            toast.show(`已刪除「${deleteTask.name}」`);
          }}
        />
      )}

      {subjectsTask && (
        <SubjectEditor
          task={subjectsTask}
          onChange={(subjects) =>
            store.dispatch({ type: 'setSubjectOptions', taskId: subjectsTask.id, subjects, at: Date.now() })
          }
          onClose={() => setSubjectsFor(null)}
        />
      )}

      {confirmNewDay && (
        <ConfirmDialog
          title="要開始新的一天嗎？"
          message="目前的完成紀錄會保存到歷史，所有勾選將重新開始，任務清單不會改變。"
          cancelLabel="取消"
          confirmLabel="確認開始"
          busy={starting}
          onCancel={() => setConfirmNewDay(false)}
          onConfirm={startNewDay}
        />
      )}
    </div>
  );
}
