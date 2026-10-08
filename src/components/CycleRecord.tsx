import type { ArchivedTask } from '../lib/types';
import { STAGES, stageName } from '../lib/types';
import { timeRelativeTo } from '../lib/time';
import { CheckIcon } from './icons';

export type RecordView = 'time' | 'stage';

function Subject({ task }: { task: ArchivedTask }) {
  return task.subject ? <span className="rec-subject">{task.subject}</span> : null;
}

/** Read-only checklist of one cycle (current or archived), by time or by stage. */
export function CycleRecord({ tasks, refTime, view }: { tasks: ArchivedTask[]; refTime: number; view: RecordView }) {
  if (tasks.length === 0) return <p className="muted-note">這一輪沒有任何項目。</p>;

  if (view === 'time') {
    const done = tasks
      .filter((t) => t.done)
      .sort((a, b) => (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity));
    const todo = tasks.filter((t) => !t.done);
    return (
      <div className="record">
        <h3 className="rec-group-title">已完成</h3>
        {done.length === 0 ? (
          <p className="muted-note">還沒有完成的項目。</p>
        ) : (
          <ul className="rec-list">
            {done.map((t) => (
              <li key={t.id} className="rec-item is-done">
                <time className="rec-time">{t.completedAt !== null ? timeRelativeTo(t.completedAt, refTime) : '—'}</time>
                <span className="rec-name">
                  {t.name}
                  <Subject task={t} />
                </span>
                <span className="rec-stage">{stageName(t.stage)}</span>
              </li>
            ))}
          </ul>
        )}
        {todo.length > 0 && (
          <>
            <h3 className="rec-group-title">未完成</h3>
            <ul className="rec-list">
              {todo.map((t) => (
                <li key={t.id} className="rec-item is-todo">
                  <span className="rec-time rec-dash">—</span>
                  <span className="rec-name">
                    {t.name}
                    <Subject task={t} />
                  </span>
                  <span className="rec-stage">{stageName(t.stage)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="record">
      {STAGES.map((s) => {
        const list = tasks.filter((t) => t.stage === s.id).sort((a, b) => a.order - b.order);
        if (list.length === 0) return null;
        return (
          <div key={s.id} className="rec-stage-group">
            <h3 className="rec-group-title">{s.name}</h3>
            <ul className="rec-list">
              {list.map((t) => (
                <li key={t.id} className={`rec-item ${t.done ? 'is-done' : 'is-todo'}`}>
                  <span className={`rec-check${t.done ? ' on' : ''}`} aria-label={t.done ? '已完成' : '未完成'}>
                    {t.done && <CheckIcon width={14} height={14} strokeWidth={3} />}
                  </span>
                  <span className="rec-name">
                    {t.name}
                    <Subject task={t} />
                  </span>
                  {t.done && t.completedAt !== null && (
                    <time className="rec-time-right">{timeRelativeTo(t.completedAt, refTime)}</time>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function ViewSwitch({ value, onChange }: { value: RecordView; onChange: (v: RecordView) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="排列方式">
      {(
        [
          ['time', '依時間'],
          ['stage', '依階段'],
        ] as const
      ).map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
