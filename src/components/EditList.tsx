import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { TaskTemplate } from '../lib/types';
import { GripIcon, MinusCircle, MoreIcon } from './icons';

interface Props {
  tasks: TaskTemplate[];
  onRename: (taskId: string, name: string) => void;
  onDelete: (task: TaskTemplate) => void;
  onMore: (task: TaskTemplate) => void;
  onEditSubjects: (task: TaskTemplate) => void;
  onReorder: (orderedIds: string[]) => void;
}

interface DragInfo {
  pointerId: number;
  index: number;
  startY: number;
  startScroll: number;
  clientY: number;
  rects: { top: number; height: number }[];
}

interface DragView {
  index: number;
  over: number;
  dy: number;
  height: number;
}

function NameInput({ task, onRename }: { task: TaskTemplate; onRename: Props['onRename'] }) {
  const [value, setValue] = useState(task.name);
  const [focused, setFocused] = useState(false);
  // Follow outside changes (e.g. another tab) while not being edited.
  useEffect(() => {
    if (!focused) setValue(task.name);
  }, [task.name, focused]);
  const commit = () => {
    const v = value.trim();
    if (v && v !== task.name) onRename(task.id, v);
    else setValue(task.name);
  };
  return (
    <input
      className="edit-name"
      value={value}
      aria-label={`「${task.name}」的名稱`}
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      maxLength={80}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setValue(task.name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/**
 * Edit mode of a stage: rename inline, delete, more actions, and drag to
 * reorder by the grip handle (pointer events, works with touch).
 */
export function EditList({ tasks, onRename, onDelete, onMore, onEditSubjects, onReorder }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const drag = useRef<DragInfo | null>(null);
  const raf = useRef(0);
  const [view, setView] = useState<DragView | null>(null);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!settling) return;
    const id = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(id);
  }, [settling]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const compute = () => {
    const d = drag.current;
    if (!d) return;
    const dy = d.clientY - d.startY + (window.scrollY - d.startScroll);
    const r = d.rects[d.index];
    const center = r.top + r.height / 2 + dy;
    let over = 0;
    d.rects.forEach((o, i) => {
      if (i !== d.index && o.top + o.height / 2 < center) over++;
    });
    setView({ index: d.index, over, dy, height: r.height });
  };

  const tick = () => {
    const d = drag.current;
    if (!d) return;
    const edge = 72;
    const bottomEdge = window.innerHeight - 96;
    let speed = 0;
    if (d.clientY < edge) speed = -Math.ceil((edge - d.clientY) / 6);
    else if (d.clientY > bottomEdge) speed = Math.ceil((d.clientY - bottomEdge) / 6);
    if (speed !== 0) {
      window.scrollBy(0, speed);
      compute();
    }
    raf.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>, index: number) => {
    if (e.button !== 0 || drag.current) return;
    e.preventDefault();
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const rects = rows.map((row) => {
      const b = row.getBoundingClientRect();
      return { top: b.top + window.scrollY, height: b.height };
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag.current = { pointerId: e.pointerId, index, startY: e.clientY, startScroll: window.scrollY, clientY: e.clientY, rects };
    setView({ index, over: index, dy: 0, height: rects[index]?.height ?? 0 });
    raf.current = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    d.clientY = e.clientY;
    compute();
  };

  const finish = (e: ReactPointerEvent<HTMLSpanElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    cancelAnimationFrame(raf.current);
    d.clientY = e.clientY;
    const dy = d.clientY - d.startY + (window.scrollY - d.startScroll);
    const r = d.rects[d.index];
    const center = r.top + r.height / 2 + dy;
    let over = 0;
    d.rects.forEach((o, i) => {
      if (i !== d.index && o.top + o.height / 2 < center) over++;
    });
    drag.current = null;
    setSettling(true);
    setView(null);
    if (commit && over !== d.index) {
      const ids = tasks.map((t) => t.id);
      const [moved] = ids.splice(d.index, 1);
      ids.splice(over, 0, moved);
      onReorder(ids);
    }
  };

  const shiftFor = (i: number): number => {
    if (!view || i === view.index) return 0;
    if (view.index < view.over && i > view.index && i <= view.over) return -view.height;
    if (view.index > view.over && i >= view.over && i < view.index) return view.height;
    return 0;
  };

  return (
    <ul ref={listRef} className={`edit-list${view ? ' is-dragging' : ''}${settling ? ' no-anim' : ''}`}>
      {tasks.map((task, i) => {
        const dragging = view?.index === i;
        const y = dragging ? view!.dy : shiftFor(i);
        return (
          <li
            key={task.id}
            className={`edit-row${dragging ? ' is-lifted' : ''}`}
            data-task-id={task.id}
            style={y ? { transform: `translate3d(0, ${y}px, 0)` } : undefined}
          >
            <button type="button" className="icon-btn danger" aria-label={`刪除「${task.name}」`} onClick={() => onDelete(task)}>
              <MinusCircle />
            </button>
            <div className="edit-main">
              <NameInput task={task} onRename={onRename} />
              {task.subjects.length > 0 && (
                <button type="button" className="edit-subjects" onClick={() => onEditSubjects(task)}>
                  科目：{task.subjects.join('、')}
                </button>
              )}
            </div>
            <button type="button" className="icon-btn muted" aria-label={`「${task.name}」更多操作`} onClick={() => onMore(task)}>
              <MoreIcon />
            </button>
            <span
              className="grip"
              role="button"
              aria-label={`拖曳排序「${task.name}」`}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => finish(e, true)}
              onPointerCancel={(e) => finish(e, false)}
            >
              <GripIcon />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
