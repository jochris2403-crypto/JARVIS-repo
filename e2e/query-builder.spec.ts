import { expect, test } from '@playwright/test';
import { connectToDemoDatabase, mysqlConfigured } from './helpers';

test.skip(!mysqlConfigured, 'Dev MySQL is not set up. Run: npm run db:init');

test.describe('visual query builder', () => {
  test('joins related tables, filters, sorts and runs against MySQL', async ({ page }) => {
    await connectToDemoDatabase(page, 'Query');
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });

    // Step 1: pick a table from the explorer, then a related one inside the builder.
    await sidebar.getByRole('list', { name: 'Tables' }).getByText('ContactDetails').hover();
    await sidebar.getByRole('button', { name: 'Add ContactDetails to query' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Query Builder' })).toBeVisible();
    await page.getByRole('button', { name: 'Add related table ContactPhones' }).click();

    const sql = page.getByLabel('SQL statement');
    await expect(sql).toContainText(
      'INNER JOIN `jarvis_demo`.`ContactPhones` ON `ContactDetails`.`contact_id` = `ContactPhones`.`contact_id`',
    );

    // Step 2: columns, with an output name.
    await page.getByRole('checkbox', { name: 'ContactDetails.first_name' }).check();
    await page.getByRole('checkbox', { name: 'ContactPhones.phone_number' }).check();
    await page.getByLabel('Output name for ContactDetails.first_name').fill('Name');

    // Step 3: a filter.
    const filters = page.getByRole('region', { name: 'Filter rows' });
    await filters.getByRole('button', { name: 'Add filter' }).click();
    await filters.getByLabel('Condition column').selectOption({ label: 'ContactDetails.status' });
    await filters.getByLabel('Condition value').fill('ACTIVE');

    // Step 5: sorting.
    const sort = page.getByRole('region', { name: 'Sort and limit' });
    await sort.getByRole('button', { name: 'Add sort' }).click();
    await sort.getByLabel('Sort column').selectOption({ label: 'ContactPhones.phone_number' });

    await expect(sql).toContainText("WHERE `ContactDetails`.`status` = 'ACTIVE'");
    await expect(sql).toContainText('`ContactDetails`.`first_name` AS `Name`');
    await expect(sql).toContainText('ORDER BY `ContactPhones`.`phone_number` ASC');

    // The parameterized form shows what is really sent: a placeholder plus a bound value.
    await page.getByRole('radio', { name: 'As sent' }).click();
    await expect(sql).toContainText('WHERE `ContactDetails`.`status` = ?');
    await expect(page.getByRole('list', { name: 'Bound values' })).toContainText('"ACTIVE"');

    await page.keyboard.press('ControlOrMeta+Enter');
    const results = page.getByRole('region', { name: 'Results' });
    await expect(results.getByText('4 rows')).toBeVisible();
    await expect(results.getByRole('columnheader', { name: /^Name/ })).toBeVisible();
    // Sorted by phone number: Ben's +234 number sorts first.
    await expect(results.getByRole('row').nth(1)).toContainText('Ben');
    await expect(results.getByRole('row').nth(1)).toContainText('8030000003');
  });

  test('counts rows per group with HAVING', async ({ page }) => {
    await connectToDemoDatabase(page, 'Agg');
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link', { name: 'Query Builder' })
      .click();
    await page.getByLabel('Add table').selectOption('ContactPhones');
    await page.getByRole('checkbox', { name: 'ContactPhones.country_code' }).check();

    const summarize = page.getByRole('region', { name: 'Summarize' });
    await summarize.getByRole('button', { name: 'Add aggregate' }).click();
    await summarize.getByLabel('Output name for COUNT(*)').fill('phones');
    await summarize.getByRole('button', { name: 'Group by selected columns' }).click();
    await summarize.getByRole('button', { name: 'Add group filter' }).click();
    await summarize.getByLabel('Condition column').selectOption({ label: 'COUNT(*)' });
    await summarize.getByLabel('Condition operator').selectOption('gt');
    await summarize.getByLabel('Condition value').fill('1');

    const sql = page.getByLabel('SQL statement');
    await expect(sql).toContainText('COUNT(*) AS `phones`');
    await expect(sql).toContainText('GROUP BY `ContactPhones`.`country_code`');
    await expect(sql).toContainText('HAVING COUNT(*) > 1');

    await page.getByRole('button', { name: 'Run query' }).first().click();
    const results = page.getByRole('region', { name: 'Results' });
    await expect(results.getByText(/^1 row\b/)).toBeVisible();
    await expect(results.getByRole('row').nth(1)).toContainText('+91');
    await expect(results.getByRole('row').nth(1)).toContainText('3');
  });

  test('cancels a long-running query', async ({ page }) => {
    await connectToDemoDatabase(page, 'Cancel');
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link', { name: 'Query Builder' })
      .click();

    // Cross-joining a 4-row table with itself 14 times makes ~268 million rows. Summing a
    // column forces MySQL to visit every one (a bare COUNT(*) is answered without scanning).
    const COPIES = 14;
    for (let i = 0; i < COPIES; i++)
      await page.getByLabel('Add table').selectOption('ContactDetails');
    for (let i = 2; i <= COPIES; i++) {
      await page.getByLabel(`Join type for ContactDetails_${i}`).selectOption('cross');
    }
    const summarize = page.getByRole('region', { name: 'Summarize' });
    await summarize.getByRole('button', { name: 'Add aggregate' }).click();
    await summarize.getByLabel('Aggregate function').selectOption('SUM');
    await summarize
      .getByLabel('Aggregate column')
      .selectOption({ label: 'ContactDetails_14.contact_id' });
    await expect(page.getByLabel('SQL statement')).toContainText(
      'CROSS JOIN `jarvis_demo`.`ContactDetails` AS `ContactDetails_14`',
    );

    await page.getByRole('button', { name: 'Run query' }).first().click();
    const results = page.getByRole('region', { name: 'Results' });
    await expect(results.getByText('Running query…')).toBeVisible();
    await results.getByRole('button', { name: 'Cancel query' }).click();
    await expect(results.getByRole('heading', { name: 'Query cancelled' })).toBeVisible({
      timeout: 10_000,
    });

    // The connection is still healthy afterwards.
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear query' }).click();
    await page.getByLabel('Add table').selectOption('Tags');
    await page.getByRole('button', { name: 'Run query' }).first().click();
    await expect(results.getByText('3 rows')).toBeVisible();
  });
});
