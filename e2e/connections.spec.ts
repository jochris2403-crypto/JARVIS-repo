import { expect, test, type Page } from '@playwright/test';
import { mysql, mysqlConfigured, uniqueName } from './helpers';

test.skip(!mysqlConfigured, 'Dev MySQL is not set up. Run: npm run db:init');

async function openNewConnection(page: Page) {
  await page.goto('/overview');
  await expect(page.getByText('Server online')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'New connection' }).click();
  return page.getByRole('form', { name: 'New connection' });
}

async function fill(
  page: Page,
  name: string,
  overrides: { password?: string; database?: string } = {},
) {
  await page.getByLabel('Connection name').fill(name);
  await page.getByLabel('Host').fill(mysql.host!);
  await page.getByLabel('Port').fill(mysql.port);
  await page.getByLabel('Username').fill(mysql.user!);
  await page.getByLabel('Password').fill(overrides.password ?? mysql.password);
  if (overrides.database) await page.getByLabel('Default database').fill(overrides.database);
}

test.describe('database connectivity', () => {
  test('connects to MySQL, reads the schema, and survives a reload without leaking the password', async ({
    page,
  }) => {
    const name = uniqueName('E2E');
    const apiBodies: string[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/')) apiBodies.push(await response.text().catch(() => ''));
    });

    const form = await openNewConnection(page);
    await fill(page, name, { database: mysql.database });

    await form.getByRole('button', { name: 'Test connection' }).click();
    await expect(form.getByText('Connection successful.')).toBeVisible();
    await expect(form.getByText(new RegExp(`MySQL \\d+\\.\\d+.*${mysql.user}@`))).toBeVisible();

    await form.getByRole('button', { name: 'Save & connect' }).click();

    // The default database opens automatically and real metadata is shown.
    const totals = page.getByLabel('Schema totals');
    await expect(totals).toBeVisible();
    await expect(totals.locator('div', { hasText: 'Tables' }).locator('dd')).toHaveText('10');
    await expect(totals.locator('div', { hasText: 'Views' }).locator('dd')).toHaveText('1');
    await expect(totals.locator('div', { hasText: 'Relationships' }).locator('dd')).toHaveText('7');
    await expect(page.getByRole('button', { name: `Active connection: ${name}` })).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Active database: ${mysql.database}` }),
    ).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(
      sidebar.getByRole('list', { name: 'Tables' }).getByText('ContactDetails'),
    ).toBeVisible();
    const row = page.getByRole('row', { name: /OrderItems/ });
    await expect(row).toContainText('item_id');

    // The session lives on the server: a reload restores it without re-entering anything.
    await page.reload();
    await expect(page.getByLabel('Schema totals')).toBeVisible();
    await expect(page.getByRole('button', { name: `Active connection: ${name}` })).toBeVisible();

    // The password was submitted once and never comes back or gets stored in the browser.
    expect(mysql.password.length).toBeGreaterThan(8);
    expect(apiBodies.join('\n')).not.toContain(mysql.password);
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toContain(mysql.password);

    // Switch database, then disconnect.
    await page.getByRole('button', { name: `Active database: ${mysql.database}` }).click();
    await page.getByRole('menuitemradio', { name: 'information_schema' }).click();
    await expect(
      page.getByRole('button', { name: 'Active database: information_schema' }),
    ).toBeVisible();
    await expect(page.getByLabel('Schema totals')).toBeVisible();

    await page.getByRole('button', { name: `Active connection: ${name}` }).click();
    await page.getByRole('menuitem', { name: `Disconnect from ${name}` }).click();
    await expect(page.getByRole('heading', { name: 'No active MySQL connection' })).toBeVisible();
  });

  test('explains a wrong password and an unreachable server', async ({ page }) => {
    const form = await openNewConnection(page);
    await fill(page, uniqueName('Bad'), { password: 'definitely-not-the-password' });
    await form.getByRole('button', { name: 'Test connection' }).click();
    await expect(form.getByText('Access denied. Check the username and password.')).toBeVisible();

    await page.getByLabel('Port').fill('1');
    await form.getByRole('button', { name: 'Test connection' }).click();
    await expect(form.getByText(/Connection refused at .*:1\./)).toBeVisible();
  });

  test('edits and deletes a saved connection with confirmation', async ({ page }) => {
    const name = uniqueName('Temp');
    const form = await openNewConnection(page);
    await fill(page, name);
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar.getByRole('button', { name: `${name} — Not connected` })).toBeVisible();

    await sidebar.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const edit = page.getByRole('form', { name: 'Edit connection' });
    await expect(page.getByLabel('Password')).toHaveValue('');
    await page.getByRole('switch', { name: 'Read-only' }).click();
    // The stored password still works even though it was not re-entered.
    await edit.getByRole('button', { name: 'Test connection' }).click();
    await expect(edit.getByText('Connection successful.')).toBeVisible();
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sidebar.getByLabel('Read-only')).toBeVisible();

    await sidebar.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Nothing on the MySQL server is changed.');
    await confirm.getByRole('button', { name: 'Delete connection' }).click();
    await expect(sidebar.getByRole('button', { name: `${name} — Not connected` })).toHaveCount(0);
  });
});
