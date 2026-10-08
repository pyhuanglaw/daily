import { memo } from 'react';
import { getProgress } from '../lib/domain';
import type { CurrentCycle, StageId, TaskTemplate } from '../lib/types';
import { AddTaskInput } from './AddTaskInput';
import { EditList } from './EditList';
import { ChevronDown } from './icons';
import { TaskRow } from './TaskRow';

export interface StageHandlers {
  onToggle: (taskId: string) => void;
  onSubject: (taskId: string, option: string) => void;
  onAdd: (stage: StageId, name: string) => void;
  onRename: (taskId: string, name: string) => void;
  onDelete: (task: TaskTemplate) => void;
  onMore: (task: TaskTemplate) => void;
  onEditSubjects: (task: TaskTemplate) => void;
  onReorder: (stage: StageId, orderedIds: string[]) => void;
}

interface Props {
  stage: StageId;
  name: string;
  tasks: TaskTemplate[];
  cycle: CurrentCycle;
  now: number;
  collapsed: boolean;
  editing: boolean;
  onCollapse: (stage: StageId) => void;
  onEdit: (stage: StageId) => void;
  handlers: StageHandlers;
}

export const StageSection = memo(function StageSection(props: Props) {
  const { stage, name, tasks, cycle, now, collapsed, editing, handlers } = props;
  const bodyId = `stage-body-${stage}`;
  return (
    <section className={`stage${collapsed ? ' is-collapsed' : ''}${editing ? ' is-editing' : ''}`} aria-label={name} data-stage={stage}>
      <header className="stage-header">
        <button
          type="button"
          className="stage-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => props.onCollapse(stage)}
        >
          <h2 className="stage-title">{name}</h2>
          <ChevronDown className="stage-chevron" />
        </button>
        {!collapsed && (
          <button type="button" className="text-btn" onClick={() => props.onEdit(stage)} aria-pressed={editing}>
            {editing ? '完成' : '編輯'}
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="stage-body" id={bodyId}>
          {editing ? (
            <EditList
              tasks={tasks}
              onRename={handlers.onRename}
              onDelete={handlers.onDelete}
              onMore={handlers.onMore}
              onEditSubjects={handlers.onEditSubjects}
              onReorder={(ids) => handlers.onReorder(stage, ids)}
            />
          ) : (
            <ul className="task-list">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  progress={getProgress(cycle, t.id)}
                  now={now}
                  onToggle={handlers.onToggle}
                  onSubject={handlers.onSubject}
                />
              ))}
            </ul>
          )}
          {tasks.length === 0 && !editing && <p className="stage-empty">目前沒有項目</p>}
          <AddTaskInput stageName={name} onAdd={(v) => handlers.onAdd(stage, v)} />
        </div>
      )}
    </section>
  );
});
