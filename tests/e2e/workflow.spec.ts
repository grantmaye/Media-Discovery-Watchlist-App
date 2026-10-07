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

test('a delayed next page cannot replace a newer search', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const paginationRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/api/graphql', async (route) => {
    if (!route.request().postDataJSON().variables?.after) return route.continue();
    const response = await route.fetch();
    requested();
    await held;
    await route.fulfill({ response });
  });
  await page.goto('/');
  await expect(page.locator('.film-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'A few more stories' }).click();
  await paginationRequested;
  await page.getByRole('textbox', { name: 'Search films' }).fill('Static Bloom');
  await expect(page.locator('.film-card')).toHaveCount(1);
  release();
  // The pagination handler clears busy only after processing the delayed response.
  await expect(page.getByRole('button', { name: 'Save Static Bloom', exact: true })).toBeEnabled();
  await expect(page.locator('.film-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Static Bloom', exact: true })).toBeVisible();
});
