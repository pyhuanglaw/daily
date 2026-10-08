import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup } from '../../src/lib/backup';
import { RoutineDB } from '../../src/lib/db';
import { DEFAULT_TASKS } from '../../src/lib/defaults';
import { tasksInStage } from '../../src/lib/domain';
import { newId } from '../../src/lib/id';
import type { StageId } from '../../src/lib/types';
import { data, isDone, names, openApp, reopen, resetIndexedDB, taskId } from './helpers';

beforeEach(() => resetIndexedDB());

const now = () => Date.now();
const byId = <T extends { id: string }>(list: T[]) => list.slice().sort((a, b) => a.id.localeCompare(b.id));

describe('首次使用與預設清單', () => {
  it('建立完整的預設清單（保留原始寫法）', async () => {
    const app = await openApp();
    expect(names(app, 'wake')).toEqual(DEFAULT_TASKS.wake.map((t) => t.name));
    expect(names(app, 'study')).toEqual(DEFAULT_TASKS.study.map((t) => t.name));
    expect(names(app, 'sleep')).toEqual(DEFAULT_TASKS.sleep.map((t) => t.name));
    expect(names(app, 'wake')).toContain('起床清貓沙');
    expect(data(app).tasks).toHaveLength(25);
    const ids = new Set(data(app).tasks.map((t) => t.id));
    expect(ids.size).toBe(25);
  });

  it('第二、三、四顆有各自的科目選項', async () => {
    const app = await openApp();
    const study = tasksInStage(data(app).tasks, 'study');
    expect(study.map((t) => t.subjects)).toEqual([[], ['行政', '刑訴', '民訴'], ['行政', '刑訴', '民訴'], ['刑法', '憲法', '民法']]);
  });

  it('重新開啟不會再次用預設清單覆蓋', async () => {
    let app = await openApp();
    app.dispatch({ type: 'renameTask', taskId: taskId(app, 'wake', '叫早餐'), name: '叫早餐（外送）', at: now() });
    app = await reopen(app);
    expect(names(app, 'wake')[0]).toBe('叫早餐（外送）');
    expect(data(app).tasks).toHaveLength(25);
  });
});

describe('任務操作', () => {
  it('1-2. 勾選與取消勾選，並記錄完成時間', async () => {
    const app = await openApp();
    const id = taskId(app, 'wake', '吃早餐');
    const t = new Date('2026-10-08T08:42:00').getTime();
    app.dispatch({ type: 'setDone', taskId: id, done: true, at: t });
    expect(data(app).cycle.progress[id]).toEqual({ done: true, completedAt: t, subject: null });
    app.dispatch({ type: 'setDone', taskId: id, done: false, at: t + 1000 });
    expect(isDone(app, id)).toBe(false);
    expect(data(app).cycle.progress[id]).toBeUndefined();
  });

  it('3. 連續快速勾選多個項目，舊資料不會覆蓋新資料', async () => {
    let app = await openApp();
    const ids = data(app).tasks.map((t) => t.id);
    // Fire everything without awaiting, including toggling some back off.
    ids.forEach((id, i) => app.dispatch({ type: 'setDone', taskId: id, done: true, at: 1000 + i }));
    ids.slice(0, 5).forEach((id, i) => app.dispatch({ type: 'setDone', taskId: id, done: false, at: 2000 + i }));
    ids.slice(0, 2).forEach((id, i) => app.dispatch({ type: 'setDone', taskId: id, done: true, at: 3000 + i }));
    const expected = JSON.parse(JSON.stringify(data(app).cycle.progress));
    app = await reopen(app);
    expect(data(app).cycle.progress).toEqual(expected);
    expect(ids.filter((id) => isDone(app, id))).toHaveLength(25 - 5 + 2);
  });

  it('4-5. 重新整理／關閉重開後勾選仍存在', async () => {
    let app = await openApp();
    const id = taskId(app, 'sleep', '睡前鬧鐘');
    app.dispatch({ type: 'setDone', taskId: id, done: true, at: now() });
    app = await reopen(app);
    expect(isDone(app, id)).toBe(true);
    app = await reopen(app);
    expect(isDone(app, id)).toBe(true);
  });

  it('6. 起床及睡前的「換衣服」互不影響', async () => {
    let app = await openApp();
    const wake = taskId(app, 'wake', '換衣服');
    const sleep = taskId(app, 'sleep', '換衣服');
    expect(wake).not.toBe(sleep);
    app.dispatch({ type: 'setDone', taskId: wake, done: true, at: now() });
    app = await reopen(app);
    expect(isDone(app, wake)).toBe(true);
    expect(isDone(app, sleep)).toBe(false);
  });
});

describe('清單管理', () => {
  it.each<[StageId]>([['wake'], ['study'], ['sleep']])('7-9. 在 %s 新增任務：未完成、永久保存', async (stage) => {
    let app = await openApp();
    const before = names(app, stage).length;
    app.dispatch({ type: 'addTask', id: newId(), stage, name: '擦桌子', at: now() });
    expect(names(app, stage)).toHaveLength(before + 1);
    expect(names(app, stage).at(-1)).toBe('擦桌子');
    const id = taskId(app, stage, '擦桌子');
    expect(isDone(app, id)).toBe(false);
    app = await reopen(app);
    expect(names(app, stage).at(-1)).toBe('擦桌子');
  });

  it('10-11. 新增／刪除後開始新循環，新增的仍在，刪除的不會恢復（之後每一輪皆然）', async () => {
    let app = await openApp();
    app.dispatch({ type: 'addTask', id: newId(), stage: 'wake', name: '擦桌子', at: now() });
    app.dispatch({ type: 'deleteTask', taskId: taskId(app, 'wake', '叫早餐') });
    await app.startNewCycle();
    app = await reopen(app);
    expect(names(app, 'wake')).toContain('擦桌子');
    expect(names(app, 'wake')).not.toContain('叫早餐');
    await app.startNewCycle();
    await app.startNewCycle();
    app = await reopen(app);
    expect(names(app, 'wake')).toContain('擦桌子');
    expect(names(app, 'wake')).not.toContain('叫早餐');
  });

  it('12. 修改名稱後重新整理，新名稱仍存在；已完成的勾選不消失', async () => {
    let app = await openApp();
    const id = taskId(app, 'sleep', '睡前喝水');
    app.dispatch({ type: 'setDone', taskId: id, done: true, at: 5000 });
    app.dispatch({ type: 'renameTask', taskId: id, name: '睡前喝 500ml 水', at: 6000 });
    app = await reopen(app);
    expect(names(app, 'sleep')).toContain('睡前喝 500ml 水');
    expect(names(app, 'sleep')).not.toContain('睡前喝水');
    expect(data(app).cycle.progress[id]).toEqual({ done: true, completedAt: 5000, subject: null });
    await app.startNewCycle();
    expect(names(app, 'sleep')).toContain('睡前喝 500ml 水');
  });

  it('13. 修改順序後開始新循環，順序仍存在', async () => {
    let app = await openApp();
    const order = tasksInStage(data(app).tasks, 'wake').map((t) => t.id).reverse();
    app.dispatch({ type: 'reorderStage', stage: 'wake', orderedIds: order, at: now() });
    await app.startNewCycle();
    app = await reopen(app);
    expect(tasksInStage(data(app).tasks, 'wake').map((t) => t.id)).toEqual(order);
    expect(names(app, 'wake')[0]).toBe('起床清貓沙');
  });

  it('14. 任務跨階段移動後狀態正確並永久保存', async () => {
    let app = await openApp();
    app.dispatch({ type: 'addTask', id: newId(), stage: 'wake', name: '倒垃圾', at: now() });
    const id = taskId(app, 'wake', '倒垃圾');
    app.dispatch({ type: 'setDone', taskId: id, done: true, at: 7000 });
    app.dispatch({ type: 'moveTask', taskId: id, toStage: 'sleep', at: now() });
    app = await reopen(app);
    expect(names(app, 'wake')).not.toContain('倒垃圾');
    expect(names(app, 'sleep').at(-1)).toBe('倒垃圾');
    expect(data(app).cycle.progress[id]).toEqual({ done: true, completedAt: 7000, subject: null });
    // Orders stay contiguous in both stages.
    expect(tasksInStage(data(app).tasks, 'wake').map((t) => t.order)).toEqual([...Array(10).keys()]);
    expect(tasksInStage(data(app).tasks, 'sleep').map((t) => t.order)).toEqual([...Array(12).keys()]);
    await app.startNewCycle();
    expect(names(app, 'sleep').at(-1)).toBe('倒垃圾');
    expect(isDone(app, id)).toBe(false);
  });

  it('15. 刪除全部任務後重新整理，不會自動恢復預設清單', async () => {
    let app = await openApp();
    for (const t of [...data(app).tasks]) app.dispatch({ type: 'deleteTask', taskId: t.id });
    expect(data(app).tasks).toHaveLength(0);
    app = await reopen(app);
    expect(data(app).tasks).toHaveLength(0);
    await app.startNewCycle();
    app = await reopen(app);
    expect(data(app).tasks).toHaveLength(0);
  });
});

describe('生活循環', () => {
  it('16-18. 全部完成／部分完成／完全沒完成，都能開始新的一天並清空勾選', async () => {
    let app = await openApp();
    for (const t of data(app).tasks) app.dispatch({ type: 'setDone', taskId: t.id, done: true, at: now() });
    expect(await app.startNewCycle()).toBe('ok');
    expect(Object.keys(data(app).cycle.progress)).toHaveLength(0);

    app.dispatch({ type: 'setDone', taskId: data(app).tasks[0].id, done: true, at: now() });
    expect(await app.startNewCycle()).toBe('ok');
    expect(Object.keys(data(app).cycle.progress)).toHaveLength(0);

    expect(await app.startNewCycle()).toBe('ok');
    app = await reopen(app);
    expect(Object.keys(data(app).cycle.progress)).toHaveLength(0);
    expect(data(app).history).toHaveLength(3);
    expect(data(app).history[2].tasks.every((t) => t.done)).toBe(true);
    expect(data(app).history[1].tasks.filter((t) => t.done)).toHaveLength(1);
    expect(data(app).history[0].tasks.some((t) => t.done)).toBe(false);
  });

  it('19. 時間經過（跨午夜）不會自動重置：只有 startNewCycle 會建立新循環', async () => {
    let app = await openApp();
    const cycleId = data(app).cycle.id;
    const id = data(app).tasks[0].id;
    app.dispatch({ type: 'setDone', taskId: id, done: true, at: new Date('2026-10-08T23:50:00').getTime() });
    app.dispatch({ type: 'setDone', taskId: data(app).tasks[1].id, done: true, at: new Date('2026-10-09T00:20:00').getTime() });
    app = await reopen(app);
    expect(data(app).cycle.id).toBe(cycleId);
    expect(isDone(app, id)).toBe(true);
    expect(data(app).history).toHaveLength(0);
  });

  it('20. 連續按「開始新的一天」不會產生重複紀錄', async () => {
    let app = await openApp();
    app.dispatch({ type: 'setDone', taskId: data(app).tasks[0].id, done: true, at: now() });
    const results = await Promise.all([app.startNewCycle(), app.startNewCycle(), app.startNewCycle()]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'stale')).toHaveLength(2);
    app = await reopen(app);
    expect(data(app).history).toHaveLength(1);
  });

  it('20b. 兩個分頁同時按下也只封存一次', async () => {
    const a = await openApp();
    const b = await openApp();
    const [ra, rb] = await Promise.all([a.startNewCycle(), b.startNewCycle()]);
    expect([ra, rb].sort()).toEqual(['ok', 'stale']);
    const c = await reopen(a);
    expect(data(c).history).toHaveLength(1);
    b.dispose();
  });

  it('21. 開始新循環不影響永久任務清單', async () => {
    const app = await openApp();
    const before = JSON.stringify(data(app).tasks);
    await app.startNewCycle();
    expect(JSON.stringify(data(app).tasks)).toBe(before);
  });

  it('新循環是原子操作：封存與建立新循環同時成功', async () => {
    const app = await openApp();
    const oldId = data(app).cycle.id;
    await app.startNewCycle();
    await app.whenIdle();
    const db = await RoutineDB.open();
    const all = await db.readAll();
    db.close();
    expect(all.history.map((h) => h.id)).toEqual([oldId]);
    expect(all.cycle.id).not.toBe(oldId);
  });
});

describe('歷史紀錄', () => {
  async function withOneArchived() {
    const app = await openApp();
    const breakfast = taskId(app, 'wake', '叫早餐');
    const second = taskId(app, 'study', '第二顆：行政、刑訴、民訴');
    const fourth = taskId(app, 'study', '第四顆：刑法、憲法、民法');
    app.dispatch({ type: 'setDone', taskId: breakfast, done: true, at: 1111 });
    app.dispatch({ type: 'setSubject', taskId: second, subject: '刑訴' });
    app.dispatch({ type: 'setDone', taskId: second, done: true, at: 2222 });
    app.dispatch({ type: 'setSubject', taskId: fourth, subject: '民法' });
    await app.startNewCycle();
    return { app, breakfast, second, fourth };
  }

  it('22. 新循環開始前的資料正確封存', async () => {
    const { app, breakfast, second } = await withOneArchived();
    const h = data(app).history[0];
    expect(h.tasks).toHaveLength(25);
    expect(h.tasks.find((t) => t.id === breakfast)).toMatchObject({ name: '叫早餐', done: true, completedAt: 1111 });
    expect(h.tasks.find((t) => t.id === second)).toMatchObject({ done: true, completedAt: 2222, subject: '刑訴' });
    expect(h.endedAt).toBeGreaterThanOrEqual(h.startedAt);
  });

  it('23-26. 過去紀錄不受新增、刪除、改名、排序影響', async () => {
    let { app, breakfast } = await withOneArchived();
    const snapshot = JSON.stringify(data(app).history[0]);
    app.dispatch({ type: 'addTask', id: newId(), stage: 'wake', name: '擦桌子', at: now() });
    app.dispatch({ type: 'deleteTask', taskId: breakfast });
    app.dispatch({ type: 'renameTask', taskId: taskId(app, 'sleep', '睡前喝水'), name: '睡前喝 500ml 水', at: now() });
    const order = tasksInStage(data(app).tasks, 'sleep').map((t) => t.id).reverse();
    app.dispatch({ type: 'reorderStage', stage: 'sleep', orderedIds: order, at: now() });
    app.dispatch({ type: 'setSubjectOptions', taskId: taskId(app, 'study', '第二顆：行政、刑訴、民訴'), subjects: ['行政'], at: now() });
    await app.startNewCycle();
    app = await reopen(app);
    const old = data(app).history.find((h) => JSON.parse(snapshot).id === h.id)!;
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(old.tasks.map((t) => t.name)).toContain('叫早餐');
    expect(old.tasks.map((t) => t.name)).toContain('睡前喝水');
    expect(old.tasks.map((t) => t.name)).not.toContain('擦桌子');
    // The newest history entry reflects the new list.
    expect(data(app).history[0].tasks.map((t) => t.name)).toContain('擦桌子');
    expect(data(app).history[0].tasks.map((t) => t.name)).not.toContain('叫早餐');
  });

  it('27. 歷史讀書科目顯示正確', async () => {
    const { app, second, fourth } = await withOneArchived();
    const h = data(app).history[0];
    expect(h.tasks.find((t) => t.id === second)?.subject).toBe('刑訴');
    expect(h.tasks.find((t) => t.id === fourth)).toMatchObject({ subject: '民法', done: false });
    expect(h.tasks.find((t) => t.name.startsWith('第三顆'))?.subject).toBeNull();
  });
});

describe('讀書功能', () => {
  it('28-29. 各顆可各自選科目，勾選不會清空科目', async () => {
    let app = await openApp();
    const second = taskId(app, 'study', '第二顆：行政、刑訴、民訴');
    const third = taskId(app, 'study', '第三顆：行政、刑訴、民訴');
    app.dispatch({ type: 'setSubject', taskId: second, subject: '刑訴' });
    app.dispatch({ type: 'setSubject', taskId: third, subject: '行政' });
    app.dispatch({ type: 'setDone', taskId: second, done: true, at: 1 });
    app.dispatch({ type: 'setDone', taskId: second, done: false, at: 2 });
    app.dispatch({ type: 'setDone', taskId: second, done: true, at: 3 });
    app = await reopen(app);
    expect(data(app).cycle.progress[second]).toEqual({ done: true, completedAt: 3, subject: '刑訴' });
    expect(data(app).cycle.progress[third]).toEqual({ done: false, completedAt: null, subject: '行政' });
  });

  it('30. 新循環會清除上一輪的科目選擇', async () => {
    const app = await openApp();
    const second = taskId(app, 'study', '第二顆：行政、刑訴、民訴');
    app.dispatch({ type: 'setSubject', taskId: second, subject: '民訴' });
    await app.startNewCycle();
    expect(data(app).cycle.progress[second]).toBeUndefined();
  });

  it('31. 可選科目設定會永久保存', async () => {
    let app = await openApp();
    const fourth = taskId(app, 'study', '第四顆：刑法、憲法、民法');
    app.dispatch({ type: 'setSubjectOptions', taskId: fourth, subjects: ['刑法', '民法', '商法'], at: now() });
    await app.startNewCycle();
    app = await reopen(app);
    expect(data(app).tasks.find((t) => t.id === fourth)?.subjects).toEqual(['刑法', '民法', '商法']);
  });
});

describe('備份', () => {
  it('32-33, 35. 匯出的 JSON 可以匯入，任務及歷史正確還原', async () => {
    let app = await openApp();
    app.dispatch({ type: 'addTask', id: newId(), stage: 'wake', name: '擦桌子', at: now() });
    app.dispatch({ type: 'setDone', taskId: taskId(app, 'wake', '擦桌子'), done: true, at: 4444 });
    await app.startNewCycle();
    app.dispatch({ type: 'setDone', taskId: taskId(app, 'sleep', '睡前鬧鐘'), done: true, at: 5555 });
    await app.whenIdle();
    const exported = JSON.stringify(buildBackup(data(app)));
    const snapshot = { tasks: data(app).tasks, cycle: data(app).cycle, history: data(app).history };

    // Wipe and change things, then restore.
    for (const t of [...data(app).tasks]) app.dispatch({ type: 'deleteTask', taskId: t.id });
    await app.startNewCycle();
    const parsed = parseBackup(exported);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await app.importData(parsed.data);
    app = await reopen(app);
    expect(byId(data(app).tasks)).toEqual(byId(snapshot.tasks));
    expect(data(app).cycle).toEqual(snapshot.cycle);
    expect(data(app).history).toEqual(snapshot.history);
  });

  it('34. 無效 JSON 不會破壞既有資料', async () => {
    const app = await openApp();
    const before = JSON.stringify(data(app));
    for (const bad of ['not json', '{}', '{"app":"daily-routine","formatVersion":99,"data":{}}', '{"app":"daily-routine","formatVersion":1,"data":{"tasks":[{"id":1}]}}']) {
      const r = parseBackup(bad);
      expect(r.ok).toBe(false);
    }
    const reopened = await reopen(app);
    expect(JSON.stringify(data(reopened))).toBe(before);
  });

  it('拒絕重複 id 與錯誤階段', () => {
    const base = {
      app: 'daily-routine',
      formatVersion: 1,
      data: {
        tasks: [
          { id: 'a', stage: 'wake', name: 'x', order: 0, subjects: [] },
          { id: 'a', stage: 'wake', name: 'y', order: 1, subjects: [] },
        ],
        currentCycle: { id: 'c', startedAt: 1, progress: {} },
        history: [],
      },
    };
    expect(parseBackup(JSON.stringify(base)).ok).toBe(false);
    base.data.tasks = [{ id: 'a', stage: 'lunch', name: 'x', order: 0, subjects: [] }];
    expect(parseBackup(JSON.stringify(base)).ok).toBe(false);
  });
});

describe('寫入順序與重新同步', () => {
  it('reload 進行中產生的新操作不會被舊讀取蓋掉', async () => {
    const app = await openApp();
    const [a, b] = data(app).tasks;
    app.dispatch({ type: 'setDone', taskId: a.id, done: true, at: 1 });
    const reloading = app.reload();
    app.dispatch({ type: 'setDone', taskId: b.id, done: true, at: 2 });
    await reloading;
    expect(isDone(app, a.id)).toBe(true);
    expect(isDone(app, b.id)).toBe(true);
    const again = await reopen(app);
    expect(isDone(again, a.id)).toBe(true);
    expect(isDone(again, b.id)).toBe(true);
  });
});
