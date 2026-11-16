import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('loads, reaches the API and reports it online', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Server online')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'JARVIS server' }).getByText(/^v\d+\.\d+\.\d+$/),
    ).toBeVisible();
  });

  test('navigates between workspaces via tabs and keyboard', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link', { name: 'Data Explorer' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Data Explorer' })).toBeVisible();
    await page.keyboard.press('Alt+Digit4');
    await expect(page.getByRole('heading', { level: 1, name: 'Query Builder' })).toBeVisible();
  });

  test('command palette switches theme and the choice persists', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Search workspaces and commands…').fill('theme light');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('sidebar collapses and the preference persists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await page.reload();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });

  test('unknown API routes return a JSON error, not the SPA', async ({ request }) => {
    const res = await request.get('/api/nope');
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});
