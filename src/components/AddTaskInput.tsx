import { useState } from 'react';
import { PlusIcon } from './icons';

/**
 * Always-rendered input styled as "＋ 新增項目". Tapping it focuses the field
 * directly, which is what makes the iPhone keyboard appear reliably.
 * Enter adds the item and keeps the field open for the next one.
 */
export function AddTaskInput({ stageName, onAdd }: { stageName: string; onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');

  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue('');
  };

  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <PlusIcon className="add-icon" />
      <input
        className="add-input"
        type="text"
        value={value}
        placeholder="新增項目"
        aria-label={`在「${stageName}」新增項目`}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
    </form>
  );
}
