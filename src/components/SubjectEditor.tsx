import { useState } from 'react';
import type { TaskTemplate } from '../lib/types';
import { MinusCircle, PlusIcon } from './icons';
import { Panel } from './Modal';

export function SubjectEditor({
  task,
  onChange,
  onClose,
}: {
  task: TaskTemplate;
  onChange: (subjects: string[]) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !task.subjects.includes(v)) onChange([...task.subjects, v]);
    setValue('');
  };
  return (
    <Panel title="科目選項" onClose={onClose}>
      <p className="panel-note">「{task.name}」可以選擇的科目。修改會保存到往後每一輪；本輪已選的科目不受影響。</p>
      <ul className="subject-list">
        {task.subjects.map((s) => (
          <li key={s} className="subject-item">
            <span>{s}</span>
            <button
              type="button"
              className="icon-btn danger"
              aria-label={`刪除科目「${s}」`}
              onClick={() => onChange(task.subjects.filter((x) => x !== s))}
            >
              <MinusCircle />
            </button>
          </li>
        ))}
        {task.subjects.length === 0 && <li className="subject-empty">尚未設定科目</li>}
      </ul>
      <form
        className="subject-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="field"
          value={value}
          placeholder="新增科目，例如：民法"
          aria-label="新增科目"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn btn-soft" disabled={!value.trim()}>
          <PlusIcon width={18} height={18} /> 新增
        </button>
      </form>
    </Panel>
  );
}
