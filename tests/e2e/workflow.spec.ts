import { test, expect } from '@playwright/test';
test('discover, save, rate, persist and remove', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.film-card')).toHaveCount(8);
  await page.screenshot({
    path: `test-results/${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'A few more stories', exact: true }).click();
  await expect(page.locator('.film-card')).toHaveCount(16);
  await page.getByRole('textbox', { name: 'Search films' }).fill('Static Bloom');
  await expect(page.locator('.film-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Static Bloom', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Watch status' }).selectOption('FINISHED');
  await dialog.getByRole('button', { name: 'Rate 4 of 5', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Your note' }).fill('A memorable final scene.');
  await dialog.getByRole('button', { name: 'Save to your list', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: /Your watchlist/ }).click();
  await expect(page.locator('.film-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Static Bloom', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your note' })).toHaveValue(
    'A memorable final scene.',
  );
  await page.getByRole('button', { name: 'Remove from watchlist', exact: true }).click();
  await expect(page.locator('.film-card')).toHaveCount(0);
  await expect(page.locator('.error')).toHaveCount(0);
});
