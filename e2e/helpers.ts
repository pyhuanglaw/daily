import { expect, type Locator, type Page } from '@playwright/test';

export const stage = (page: Page, id: 'wake' | 'study' | 'sleep') => page.locator(`[data-stage="${id}"]`);

export async function openApp(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Daily Routine' })).toBeVisible();
  await expect(page.locator('.task').first()).toBeVisible();
}

/** Task names of a stage, in display order (normal mode). */
export async function taskNames(section: Locator): Promise<string[]> {
  return section.locator('.task-name').allTextContents();
}

export const checkbox = (scope: Page | Locator, name: string) =>
  scope.getByRole('checkbox', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });

export async function addTask(page: Page, id: 'wake' | 'study' | 'sleep', name: string) {
  const input = stage(page, id).getByPlaceholder('新增項目');
  await input.fill(name);
  await input.press('Enter');
  await expect(stage(page, id).locator('.task-name', { hasText: name })).toBeVisible();
}

export async function startNewDay(page: Page) {
  await page.getByRole('button', { name: '開始新的一天' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('要開始新的一天嗎？');
  await expect(dialog).toContainText('目前的完成紀錄會保存到歷史，所有勾選將重新開始，任務清單不會改變。');
  await dialog.getByRole('button', { name: '確認開始' }).click();
  await expect(dialog).toBeHidden();
}

export async function checkedNames(page: Page): Promise<string[]> {
  return page.locator('.task.is-done .task-name').allTextContents();
}

export async function noHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, 'page must not scroll horizontally').toBeLessThanOrEqual(client);
}
