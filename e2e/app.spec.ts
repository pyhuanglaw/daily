import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_URL } from '../playwright.config';
import { addTask, checkbox, checkedNames, noHorizontalOverflow, openApp, stage, startNewDay, taskNames } from './helpers';

test.describe('最終驗收情境', () => {
  test('新增、刪除、改名、勾選 → 開始新的一天 → 關閉瀏覽器再開，全部正確', async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium');
    const dir = mkdtempSync(join(tmpdir(), 'daily-e2e-'));
    const device = testInfo.project.use;
    const launch = () =>
      chromium.launchPersistentContext(dir, {
        viewport: device.viewport,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
      });
    let ctx: BrowserContext = await launch();
    try {
      let page: Page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(APP_URL);
      await expect(page.locator('.task').first()).toBeVisible();
      const wake = stage(page, 'wake');

      // 新增「擦桌子」
      await addTask(page, 'wake', '擦桌子');

      // 刪除「叫早餐」（有確認視窗）
      await wake.getByRole('button', { name: '編輯' }).click();
      await wake.getByRole('button', { name: '刪除「叫早餐」' }).click();
      const dlg = page.getByRole('alertdialog');
      await expect(dlg).toContainText('刪除「叫早餐」？');
      await dlg.getByRole('button', { name: '刪除', exact: true }).click();

      // 修改第三個任務的名稱
      const rename = wake.getByRole('textbox', { name: '「佈置書房（電腦、燈、書）」的名稱' });
      await rename.fill('佈置書房＋開燈');
      await rename.press('Enter');
      await wake.getByRole('button', { name: '完成' }).click();

      const expectedWake = ['登記飼料', '佈置書房＋開燈', '換衣服', '吃營養品', '吃早餐', '收早餐', '弄湯湯', '餵藥', '起床清貓沙', '擦桌子'];
      await expect.poll(() => taskNames(wake)).toEqual(expectedWake);

      // 勾選一些，並選讀書科目
      await checkbox(wake, '登記飼料').click();
      await checkbox(wake, '擦桌子').click();
      await checkbox(wake, '佈置書房＋開燈').click();
      const study = stage(page, 'study');
      const second = study.locator('.task').filter({ hasText: '第二顆' });
      await second.getByRole('radio', { name: '刑訴' }).click();
      await checkbox(study, '第二顆').click();
      await expect(second.getByRole('radio', { name: '刑訴' })).toHaveAttribute('aria-checked', 'true');
      await expect(wake.locator('.task.is-done .task-time')).toHaveCount(3);
      await expect(page.locator('.task.is-done')).toHaveCount(4);

      // 重新整理後仍在
      await page.reload();
      await expect(page.locator('.task.is-done')).toHaveCount(4);
      await expect(second.getByRole('radio', { name: '刑訴' })).toHaveAttribute('aria-checked', 'true');

      // 開始新的一天
      await startNewDay(page);
      const verifyNewCycle = async (p: Page) => {
        const w = stage(p, 'wake');
        await expect(p.locator('.task').first()).toBeVisible();
        await expect(p.locator('.task.is-done')).toHaveCount(0);
        await expect(p.getByRole('checkbox', { checked: true })).toHaveCount(0);
        await expect.poll(() => taskNames(w)).toEqual(expectedWake);
        await expect(p.getByRole('radio', { checked: true })).toHaveCount(0);
        await expect(stage(p, 'study').locator('.task').filter({ hasText: '第二顆' }).getByRole('radio')).toHaveCount(3);
      };
      await verifyNewCycle(page);

      // 上一輪已保存
      await page.getByRole('link', { name: '紀錄' }).click();
      await expect(page.locator('.history-row')).toHaveCount(1);
      await expect(page.locator('.history-row')).toContainText('唸書：刑訴');

      // 關掉瀏覽器再開
      await ctx.close();
      ctx = await launch();
      page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(APP_URL);
      await verifyNewCycle(page);
      await page.getByRole('link', { name: '紀錄' }).click();
      await expect(page.locator('.history-row')).toHaveCount(1);
      await page.locator('.history-row').click();
      const record = page.locator('.record');
      // 「叫早餐」在這一輪結束前就刪除了，所以這一輪的快照沒有它；改名後的名稱是當時的名稱。
      await expect(record).not.toContainText('叫早餐');
      await expect(record).toContainText('佈置書房＋開燈');
      await expect(record).toContainText('擦桌子');
      await expect(record.locator('.rec-item.is-done')).toHaveCount(4);
      await expect(record.locator('.rec-item.is-done', { hasText: '第二顆' })).toContainText('刑訴');
    } finally {
      await ctx.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('任務操作', () => {
  test('勾選、取消勾選、顯示完成時間', async ({ page }) => {
    await openApp(page);
    const row = page.locator('[data-stage="wake"] .task').filter({ hasText: '吃早餐' });
    await row.getByRole('checkbox').click();
    await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    await expect(row.locator('.task-time')).toHaveText(/^\d{2}:\d{2}$/);
    await row.getByRole('checkbox').click();
    await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    await expect(row.locator('.task-time')).toHaveCount(0);
  });

  test('連續快速勾選多個項目後重新整理不遺失', async ({ page }) => {
    await openApp(page);
    const boxes = page.getByRole('checkbox');
    const n = await boxes.count();
    // Tap all of them as fast as possible, without waiting between taps.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]').forEach((b) => b.click());
      const first = document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
      first[0].click();
      first[1].click();
    });
    await expect(page.locator('.task.is-done')).toHaveCount(n - 2);
    // The whole burst is written as one transaction; wait until it has committed (a few ms).
    await expect(page.locator('html')).not.toHaveAttribute('data-saving');
    await page.reload();
    await expect(page.locator('.task').first()).toBeVisible();
    await expect(page.locator('.task.is-done')).toHaveCount(n - 2);
  });

  test('起床及睡前的「換衣服」互不影響', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '換衣服').click();
    await page.reload();
    await expect(checkbox(stage(page, 'wake'), '換衣服')).toHaveAttribute('aria-checked', 'true');
    await expect(checkbox(stage(page, 'sleep'), '換衣服')).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('清單管理', () => {
  test('三個階段都能新增，開始新的一天後仍存在', async ({ page }) => {
    await openApp(page);
    await addTask(page, 'wake', '起床新項目');
    await addTask(page, 'study', '唸書新項目');
    await addTask(page, 'sleep', '睡前新項目');
    await startNewDay(page);
    await page.reload();
    for (const [id, name] of [
      ['wake', '起床新項目'],
      ['study', '唸書新項目'],
      ['sleep', '睡前新項目'],
    ] as const) {
      expect((await taskNames(stage(page, id))).at(-1)).toBe(name);
    }
  });

  test('拖曳排序（觸控）與上移／下移，開始新的一天後順序仍存在', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    await openApp(page);
    const sleep = stage(page, 'sleep');
    await sleep.getByRole('button', { name: '編輯' }).click();
    await page.evaluate(() => {
      document.querySelector('[data-stage="sleep"]')!.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -150);
    });
    // Drag "睡前鬧鐘" (last) by its grip to the top with a real touch sequence.
    const g = (await sleep.getByRole('button', { name: '拖曳排序「睡前鬧鐘」' }).boundingBox())!;
    const t = (await sleep.getByRole('button', { name: '拖曳排序「睡前清貓砂」' }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = g.x + g.width / 2;
    const y0 = g.y + g.height / 2;
    const y1 = t.y + 4;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 15; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 15 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await sleep.locator('.edit-name').first().inputValue())).toBe('睡前鬧鐘');
    // "上移" via the action sheet for 睡前洗碗.
    await sleep.getByRole('button', { name: '「睡前洗碗」更多操作' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '上移' }).click();
    await sleep.getByRole('button', { name: '完成' }).click();
    const expected = ['睡前鬧鐘', '睡前清貓砂', '睡前洗碗', '睡前換水', '睡前餵藥', '換衣服', '睡前倒除濕機水', '睡前喝水', '睡前確認', '睡前餵飽', '睡前設定飼料機'];
    await expect.poll(() => taskNames(sleep)).toEqual(expected);
    await startNewDay(page);
    await page.reload();
    await expect.poll(() => taskNames(stage(page, 'sleep'))).toEqual(expected);
  });

  test('移到其他階段後勾選狀態保留', async ({ page }) => {
    await openApp(page);
    await addTask(page, 'wake', '倒垃圾');
    await checkbox(stage(page, 'wake'), '倒垃圾').click();
    await stage(page, 'wake').getByRole('button', { name: '編輯' }).click();
    await stage(page, 'wake').getByRole('button', { name: '「倒垃圾」更多操作' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '移到「睡前」' }).click();
    await stage(page, 'wake').getByRole('button', { name: '完成' }).click();
    await page.reload();
    expect(await taskNames(stage(page, 'wake'))).not.toContain('倒垃圾');
    expect((await taskNames(stage(page, 'sleep'))).at(-1)).toBe('倒垃圾');
    await expect(checkbox(stage(page, 'sleep'), '倒垃圾')).toHaveAttribute('aria-checked', 'true');
  });

  test('改名後重新整理仍是新名稱，勾選不消失', async ({ page }) => {
    await openApp(page);
    const sleep = stage(page, 'sleep');
    await checkbox(sleep, '睡前喝水').click();
    await sleep.getByRole('button', { name: '編輯' }).click();
    const input = sleep.getByRole('textbox', { name: '「睡前喝水」的名稱' });
    await input.fill('睡前喝 500ml 水');
    await input.press('Enter');
    await sleep.getByRole('button', { name: '完成' }).click();
    await page.reload();
    await expect(checkbox(sleep, '睡前喝 500ml 水')).toHaveAttribute('aria-checked', 'true');
    expect(await taskNames(sleep)).not.toContain('睡前喝水');
  });

  test('刪除全部任務後重新整理，不會恢復預設清單', async ({ page }) => {
    await openApp(page);
    for (const id of ['wake', 'study', 'sleep'] as const) {
      const s = stage(page, id);
      await s.getByRole('button', { name: '編輯' }).click();
      while ((await s.locator('.edit-row').count()) > 0) {
        await s.locator('.edit-row .icon-btn.danger').first().click();
        await page.getByRole('alertdialog').getByRole('button', { name: '刪除', exact: true }).click();
      }
      await s.getByRole('button', { name: '完成' }).click();
    }
    await expect(page.locator('.task')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.stage').first()).toBeVisible();
    await expect(page.locator('.task')).toHaveCount(0);
    await startNewDay(page);
    await page.reload();
    await expect(page.locator('.stage').first()).toBeVisible();
    await expect(page.locator('.task')).toHaveCount(0);
  });

  test('科目選項可新增刪除並永久保存', async ({ page }) => {
    await openApp(page);
    const study = stage(page, 'study');
    await study.getByRole('button', { name: '編輯' }).click();
    await study.getByRole('button', { name: /^科目：刑法、憲法、民法/ }).click();
    const panel = page.getByRole('dialog', { name: '科目選項' });
    await panel.getByRole('button', { name: '刪除科目「憲法」' }).click();
    await panel.getByRole('textbox', { name: '新增科目' }).fill('商法');
    await panel.getByRole('button', { name: '新增' }).click();
    await panel.getByRole('button', { name: '完成' }).click();
    await study.getByRole('button', { name: '完成' }).click();
    await startNewDay(page);
    await page.reload();
    const fourth = study.locator('.task').filter({ hasText: '第四顆' });
    await expect(fourth.getByRole('radio')).toHaveText(['刑法', '民法', '商法']);
  });
});

test.describe('生活循環', () => {
  test('跨越午夜不會自動重置', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-08T23:50:00+08:00') });
    await openApp(page);
    await expect(page.locator('.hero-sub')).toHaveText('本輪開始：10/8 23:50');
    await checkbox(stage(page, 'wake'), '吃早餐').click();
    await page.clock.fastForward('02:00:00');
    await checkbox(stage(page, 'wake'), '收早餐').click();
    await expect(page.locator('.task.is-done')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('.hero-sub')).toHaveText('本輪開始：10/8 23:50');
    await expect(page.locator('.task.is-done')).toHaveCount(2);
    // Completion time from the previous calendar day shows its date.
    await expect(stage(page, 'wake').locator('.task').filter({ hasText: '吃早餐' }).locator('.task-time')).toHaveText('10/8 23:50');
    await page.getByRole('link', { name: '紀錄' }).click();
    await expect(page.locator('.history-row')).toHaveCount(0);
  });

  test('連按「確認開始」不會重複封存', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '吃早餐').click();
    await page.getByRole('button', { name: '開始新的一天' }).click();
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll<HTMLButtonElement>('.alert-btn')].find((b) => b.textContent === '確認開始')!;
      btn.click();
      btn.click();
      btn.click();
    });
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await page.getByRole('link', { name: '紀錄' }).click();
    await expect(page.locator('.history-row')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.history-row')).toHaveCount(1);
  });

  test('取消不會開始新的一天', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '吃早餐').click();
    await page.getByRole('button', { name: '開始新的一天' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.task.is-done')).toHaveCount(1);
  });
});

test.describe('紀錄', () => {
  test('紀錄頁直接顯示本輪完成事項與時間', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'sleep'), '睡前洗碗').click();
    await page.getByRole('link', { name: '紀錄' }).click();
    const current = page.getByRole('region', { name: '本輪紀錄' });
    await expect(current.locator('.rec-item.is-done')).toHaveCount(1);
    await expect(current.locator('.rec-item.is-done')).toContainText('睡前洗碗');
    await expect(current.locator('.rec-item.is-done .rec-time')).toHaveText(/^\d{2}:\d{2}$/);
  });

  test('過去紀錄不受之後的改名、刪除、新增、排序影響', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '叫早餐').click();
    await startNewDay(page);
    const wake = stage(page, 'wake');
    await addTask(page, 'wake', '新任務');
    await wake.getByRole('button', { name: '編輯' }).click();
    await wake.getByRole('button', { name: '刪除「叫早餐」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除', exact: true }).click();
    const input = wake.getByRole('textbox', { name: '「吃早餐」的名稱' });
    await input.fill('吃早餐（改名）');
    await input.press('Enter');
    await wake.getByRole('button', { name: '「起床清貓沙」更多操作' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '上移' }).click();
    await wake.getByRole('button', { name: '完成' }).click();
    await page.getByRole('link', { name: '紀錄' }).click();
    await page.locator('.history-row').first().click();
    await expect(page.locator('.detail-sub')).toContainText('唯讀紀錄');
    const names = await page.locator('.rec-stage-group').first().locator('.rec-name').allTextContents();
    expect(names).toEqual(['叫早餐', '登記飼料', '佈置書房（電腦、燈、書）', '換衣服', '吃營養品', '吃早餐', '收早餐', '弄湯湯', '餵藥', '起床清貓沙']);
    await expect(page.locator('.rec-item.is-done')).toHaveCount(1);
    await page.getByRole('link', { name: '紀錄' }).first().click();
    await expect(page).toHaveURL(/#\/records$/);
  });
});

test.describe('備份', () => {
  test('匯出、無效檔案不影響資料、匯入還原', async ({ page }, testInfo) => {
    await openApp(page);
    await addTask(page, 'wake', '備份測試項目');
    await checkbox(stage(page, 'wake'), '備份測試項目').click();
    await startNewDay(page);
    await checkbox(stage(page, 'sleep'), '睡前鬧鐘').click();

    await page.getByRole('link', { name: '設定' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出備份' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^daily-routine-backup-\d{8}-\d{4}\.json$/);
    const backupPath = testInfo.outputPath('backup.json');
    await download.saveAs(backupPath);
    const json = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(json.app).toBe('daily-routine');
    expect(json.formatVersion).toBe(1);
    expect(json.data.tasks).toHaveLength(26);
    expect(json.data.history).toHaveLength(1);
    await expect(page.locator('.settings-meta').first()).not.toContainText('尚未匯出');

    // Invalid file: error, nothing changes.
    const badPath = testInfo.outputPath('bad.json');
    writeFileSync(badPath, '{ this is not json');
    // Pass contents directly: Chromium ignores uploads from paths with non-ASCII characters.
    await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: readFileSync(badPath) });
    await expect(page.getByRole('alert').filter({ hasText: '無法匯入' })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Change data, then restore from the backup.
    await page.getByRole('link', { name: '今日' }).click();
    await startNewDay(page);
    await stage(page, 'wake').getByRole('button', { name: '編輯' }).click();
    await stage(page, 'wake').getByRole('button', { name: '刪除「備份測試項目」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除', exact: true }).click();
    await page.getByRole('link', { name: '設定' }).click();
    await page
      .getByTestId('import-input')
      .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: readFileSync(backupPath) });
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('用備份覆蓋目前資料？');
    await expect(confirm).toContainText('任務 26 項、歷史紀錄 1 輪');
    await confirm.getByRole('button', { name: '覆蓋並匯入' }).click();
    await expect(confirm).toBeHidden();

    await page.getByRole('link', { name: '今日' }).click();
    await page.reload();
    expect((await taskNames(stage(page, 'wake'))).at(-1)).toBe('備份測試項目');
    expect(await checkedNames(page)).toEqual(['睡前鬧鐘']);
    await page.getByRole('link', { name: '紀錄' }).click();
    await expect(page.locator('.history-row')).toHaveCount(1);
  });
});

test.describe('版面、導覽與部署', () => {
  test('GitHub Pages 子路徑下所有資源正常載入', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openApp(page);
    const manifest = await page.request.get('manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    for (const icon of (await manifest.json()).icons) {
      expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
    }
    expect((await page.request.get('icons/apple-touch-icon.png')).ok()).toBe(true);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('設定頁可以回到主畫面', async ({ page }) => {
    await openApp(page);
    await page.getByRole('link', { name: '設定' }).click();
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    await page.getByRole('link', { name: '今日' }).click();
    await expect(page.getByRole('heading', { name: 'Daily Routine' })).toBeVisible();
    // Browser back also works (hash routes).
    await page.getByRole('link', { name: '設定' }).click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Daily Routine' })).toBeVisible();
  });

  for (const width of [320, 375, 390, 430]) {
    test(`寬度 ${width}px 沒有水平溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openApp(page);
      await addTask(page, 'wake', '一個非常非常非常長的任務名稱用來測試換行是否正常而且不會撐破版面ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      await noHorizontalOverflow(page);
      await stage(page, 'study').getByRole('button', { name: '編輯' }).click();
      await noHorizontalOverflow(page);
      await page.getByRole('link', { name: '紀錄' }).click();
      await noHorizontalOverflow(page);
      await page.getByRole('link', { name: '設定' }).click();
      await noHorizontalOverflow(page);
    });
  }

  test('沒有百分比或進度條', async ({ page }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '吃早餐').click();
    await expect(page.locator('body')).not.toContainText('%');
    await expect(page.locator('progress, [role="progressbar"]')).toHaveCount(0);
  });

  test('離線時仍可開啟並保有資料（Service Worker）', async ({ page, context }) => {
    await openApp(page);
    await checkbox(stage(page, 'wake'), '吃早餐').click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Make sure this page is controlled before going offline.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Daily Routine' })).toBeVisible();
    await expect(checkbox(stage(page, 'wake'), '吃早餐')).toHaveAttribute('aria-checked', 'true');
    await checkbox(stage(page, 'wake'), '收早餐').click();
    await page.reload();
    await expect(page.locator('.task.is-done')).toHaveCount(2);
    await context.setOffline(false);
  });
});
