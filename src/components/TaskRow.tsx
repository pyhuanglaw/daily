import { memo } from 'react';
import type { TaskProgress, TaskTemplate } from '../lib/types';
import { timeRelativeTo } from '../lib/time';
import { CheckIcon } from './icons';

interface Props {
  task: TaskTemplate;
  progress: TaskProgress;
  now: number;
  /** Flips the task based on the latest state (not this render), so very fast taps are never lost. */
  onToggle: (taskId: string) => void;
  /** Selects the option, or clears it when it is already selected. */
  onSubject: (taskId: string, option: string) => void;
}

export const TaskRow = memo(function TaskRow({ task, progress, now, onToggle, onSubject }: Props) {
  const { done, completedAt, subject } = progress;
  // Show the chosen subject even if it was later removed from the options.
  const options = subject && !task.subjects.includes(subject) ? [...task.subjects, subject] : task.subjects;
  return (
    <li className={`task${done ? ' is-done' : ''}`} data-task-id={task.id}>
      <button
        type="button"
        className="task-main"
        role="checkbox"
        aria-checked={done}
        onClick={() => onToggle(task.id)}
      >
        <span className="check" aria-hidden="true">
          <CheckIcon className="check-mark" />
        </span>
        <span className="task-name">{task.name}</span>
        {done && completedAt !== null && (
          <time className="task-time" dateTime={new Date(completedAt).toISOString()} aria-label={`完成時間 ${timeRelativeTo(completedAt, now)}`}>
            {timeRelativeTo(completedAt, now)}
          </time>
        )}
      </button>
      {options.length > 0 && (
        <div className="chips" role="radiogroup" aria-label={`${task.name} 科目`}>
          {options.map((opt) => {
            const selected = opt === subject;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`chip${selected ? ' is-selected' : ''}`}
                onClick={() => onSubject(task.id, opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
});
