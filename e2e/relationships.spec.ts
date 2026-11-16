import { expect, test, type Page } from '@playwright/test';
import { connectToDemoDatabase, mysqlConfigured } from './helpers';

test.skip(!mysqlConfigured, 'Dev MySQL is not set up. Run: npm run db:init');

const node = (page: Page, table: string) => page.locator(`[data-table="${table}"]`);
const edges = (page: Page) => page.locator('[data-relationship]');
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openDesigner(page: Page) {
  await connectToDemoDatabase(page, 'ERD');
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('link', { name: 'Relationship Designer' })
    .click();
  await expect(node(page, 'ContactDetails')).toBeVisible();
}

test.describe('relationship designer', () => {
  test('draws every table and only the declared foreign keys', async ({ page }) => {
    await openDesigner(page);
    await expect(page.locator('[data-table]')).toHaveCount(11);
    await expect(edges(page)).toHaveCount(7);
    await expect(page.locator('[data-relationship][data-source="foreign-key"]')).toHaveCount(7);
    await expect(page.getByRole('status').filter({ hasText: '11 tables' })).toContainText(
      '7 relationships',
    );

    // A table node lists its key, columns and types.
    const contact = node(page, 'ContactDetails');
    await expect(contact.getByLabel('Primary key')).toHaveCount(1);
    await expect(contact).toContainText('first_name');
    await expect(contact).toContainText('varchar(80)');
    await expect(node(page, 'ContactPhones').getByLabel('Foreign key')).toHaveCount(1);

    // SupportTickets.contact_id has no constraint, so nothing links it.
    await expect(page.locator('[data-relationship*="SupportTickets"]')).toHaveCount(0);
  });

  test('selecting a table shows its parents and children', async ({ page }) => {
    await openDesigner(page);
    await node(page, 'Orders').click();

    await expect(node(page, 'Orders')).toHaveAttribute('data-role', 'selected');
    await expect(node(page, 'ContactDetails')).toHaveAttribute('data-role', 'parent');
    await expect(node(page, 'OrderItems')).toHaveAttribute('data-role', 'child');
    await expect(node(page, 'AuditLog')).toHaveAttribute('data-dimmed', 'true');
    await expect(node(page, 'ContactPhones')).toHaveAttribute('data-dimmed', 'true');

    const panel = page.getByRole('complementary', { name: 'Selection details' });
    await expect(panel.getByRole('region', { name: 'Parents' })).toContainText('ContactDetails');
    await expect(panel.getByRole('region', { name: 'Parents' })).toContainText(
      'on delete set null',
    );
    const children = panel.getByRole('region', { name: 'Children' });
    await expect(children).toContainText('OrderItems');
    await expect(children).toContainText('order_id, region_code → order_id, region_code');

    // Navigate along a relationship from the panel.
    await children.getByRole('button', { name: 'OrderItems' }).click();
    await expect(node(page, 'OrderItems')).toHaveAttribute('data-role', 'selected');
    await expect(node(page, 'Orders')).toHaveAttribute('data-role', 'parent');
  });

  test('highlights ancestors, descendants and everything connected', async ({ page }) => {
    await openDesigner(page);
    await node(page, 'ContactDetails').click();
    // Direct: OrderItems is a grandchild, so it is not highlighted yet.
    await expect(node(page, 'OrderItems')).toHaveAttribute('data-dimmed', 'true');

    await page.getByLabel('Highlight').selectOption('children');
    await expect(node(page, 'OrderItems')).toHaveAttribute('data-role', 'child');
    await expect(node(page, 'Tags')).toHaveAttribute('data-dimmed', 'true');

    await page.getByLabel('Highlight').selectOption('connected');
    await expect(node(page, 'Tags')).toHaveAttribute('data-role', 'connected');
    await expect(node(page, 'AuditLog')).toHaveAttribute('data-dimmed', 'true');

    await node(page, 'OrderItems').click();
    await page.getByLabel('Highlight').selectOption('parents');
    await expect(node(page, 'Orders')).toHaveAttribute('data-role', 'parent');
    await expect(node(page, 'ContactDetails')).toHaveAttribute('data-role', 'parent');
    await expect(node(page, 'ContactPhones')).toHaveAttribute('data-dimmed', 'true');
  });

  test('hides unrelated tables and finds a table by name', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByRole('button', { name: 'Hide unrelated' })).toBeDisabled();

    await page.getByLabel('Find table').fill('orderit');
    await page.getByLabel('Find table').press('Enter');
    await expect(node(page, 'OrderItems')).toHaveAttribute('data-role', 'selected');

    await page.getByRole('button', { name: 'Hide unrelated' }).click();
    await expect(page.locator('[data-table]')).toHaveCount(2);
    await expect(node(page, 'Orders')).toBeVisible();
    await expect(node(page, 'AuditLog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.locator('[data-table]')).toHaveCount(11);
  });

  test('shows inferred relationships only on request, clearly marked', async ({ page }) => {
    await openDesigner(page);
    await page.getByRole('switch', { name: 'Show inferred' }).click();

    await expect(edges(page)).toHaveCount(8);
    const inferred = page.locator('[data-relationship][data-source="inferred"]');
    await expect(inferred).toHaveCount(1);
    await expect(inferred).toContainText('inferred');
    await expect(page.getByRole('status').filter({ hasText: '11 tables' })).toContainText(
      '7 relationships · 1 inferred',
    );

    await node(page, 'SupportTickets').click();
    const parents = page
      .getByRole('complementary', { name: 'Selection details' })
      .getByRole('region', { name: 'Parents' });
    await expect(parents).toContainText('ContactDetails');
    await expect(parents).toContainText('Not enforced by the database');

    await page.getByRole('switch', { name: 'Show inferred' }).click();
    await expect(edges(page)).toHaveCount(7);
  });

  test('merges junction tables into many-to-many links', async ({ page }) => {
    await openDesigner(page);
    await page.getByRole('switch', { name: 'Merge junctions' }).click();

    await expect(node(page, 'ContactTags')).toHaveCount(0);
    await expect(page.locator('[data-table]')).toHaveCount(10);
    // Two foreign keys through ContactTags become one many-to-many link.
    await expect(edges(page)).toHaveCount(6);
    const manyToMany = page.locator('[data-relationship][data-source="many-to-many"]');
    await expect(manyToMany).toHaveCount(1);
    await expect(manyToMany).toContainText('via ContactTags');

    await node(page, 'Tags').click();
    await expect(node(page, 'ContactDetails')).not.toHaveAttribute('data-dimmed', 'true');
    await expect(
      page
        .getByRole('complementary', { name: 'Selection details' })
        .getByRole('region', { name: 'Many-to-many' }),
    ).toContainText('through ContactTags');
  });

  test('collapses tables and changes how much detail is shown', async ({ page }) => {
    await openDesigner(page);
    const contact = node(page, 'ContactDetails');
    await expect(contact).toContainText('last_name');

    await contact.getByRole('button', { name: 'Collapse ContactDetails' }).click();
    await expect(contact).not.toContainText('last_name');
    await contact.getByRole('button', { name: 'Expand ContactDetails' }).click();
    await expect(contact).toContainText('last_name');

    await page.getByRole('radio', { name: 'Keys' }).click();
    await expect(node(page, 'ContactPhones')).toContainText('contact_id');
    await expect(node(page, 'ContactPhones')).not.toContainText('phone_number');
    await expect(node(page, 'ContactPhones')).toContainText('+2 more columns');

    await page.getByRole('radio', { name: 'Names' }).click();
    await expect(node(page, 'ContactPhones')).not.toContainText('contact_id');
  });

  test('keeps hand-arranged positions across a reload and can re-layout', async ({ page }) => {
    await openDesigner(page);
    const audit = node(page, 'AuditLog');
    const before = (await audit.boundingBox())!;

    await audit.hover();
    await page.mouse.down();
    await page.mouse.move(before.x + 20, before.y - 150, { steps: 8 });
    await page.mouse.up();

    const saved = () =>
      page.evaluate(() => {
        const layouts = JSON.parse(localStorage.getItem('jarvis.erd') ?? '{}').state?.layouts ?? {};
        return Object.values(layouts as Record<string, Record<string, unknown>>).some(
          (l) => 'AuditLog' in l,
        );
      });
    await expect.poll(saved).toBe(true);

    await page.reload();
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link', { name: 'Relationship Designer' })
      .click();
    await expect(node(page, 'AuditLog')).toBeVisible();
    expect(await saved()).toBe(true);

    await page.getByRole('button', { name: 'Auto layout' }).click();
    await expect.poll(saved).toBe(false);
  });

  test('changing options never moves the diagram', async ({ page }) => {
    await openDesigner(page);
    await page.waitForTimeout(400); // initial fit
    const place = async (table: string) => {
      const box = (await node(page, table).boundingBox())!;
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
    };
    const contact = await place('ContactDetails');
    const orders = await place('Orders');
    const unchanged = async () => {
      await page.waitForTimeout(450); // longer than any animation
      expect(await place('ContactDetails')).toEqual(contact);
      expect(await place('Orders')).toEqual(orders);
    };

    await page.getByRole('switch', { name: 'Merge junctions' }).click();
    await unchanged();
    await page.getByRole('switch', { name: 'Show inferred' }).click();
    await unchanged();
    await page.getByRole('switch', { name: 'Merge junctions' }).click();
    await expect(node(page, 'ContactTags')).toBeVisible();
    await unchanged();

    await node(page, 'Orders').click();
    await page.getByRole('button', { name: 'Hide unrelated' }).click();
    await expect(page.locator('[data-table]')).toHaveCount(3);
    await unchanged();
    await page.getByLabel('Highlight').selectOption('connected');
    await unchanged();
    await page.getByRole('button', { name: 'Show all' }).click();
    await unchanged();
    await page.getByRole('radio', { name: 'Keys' }).click();
    await unchanged();
  });

  test('has no minimap and can go full screen', async ({ page }) => {
    await openDesigner(page);
    await expect(page.locator('.react-flow__minimap')).toHaveCount(0);

    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('[data-fullscreen="true"]')).toBeVisible();
    const size = page.viewportSize()!;
    const box = (await page.locator('[data-fullscreen="true"]').boundingBox())!;
    expect(box).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    // The diagram is still interactive on top of the app.
    await node(page, 'Orders').click();
    await expect(node(page, 'Orders')).toHaveAttribute('data-role', 'selected');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-fullscreen="false"]')).toBeVisible();
    await page.getByRole('button', { name: 'Full screen' }).click();
    await page.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible();
  });

  test('sends a multi-table selection to the query builder with its joins', async ({ page }) => {
    await openDesigner(page);
    await node(page, 'OrderItems').click();
    await node(page, 'ContactDetails').click({ modifiers: [modifier] });
    await node(page, 'Orders').click({ modifiers: [modifier] });

    const panel = page.getByRole('complementary', { name: 'Selection details' });
    await expect(panel.getByRole('heading', { name: '3 tables selected' })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Relationships between them' })).toContainText(
      'OrderItems → Orders',
    );
    await expect(page.locator('[data-relationship][data-active="strong"]')).toHaveCount(2);

    await panel.getByRole('button', { name: 'Add 3 tables to query' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Query Builder' })).toBeVisible();
    const sql = page.getByLabel('SQL statement');
    // Ordered so each table joins one already in the query, on its (composite) foreign key.
    await expect(sql).toContainText('FROM `jarvis_demo`.`ContactDetails`');
    await expect(sql).toContainText(
      'INNER JOIN `jarvis_demo`.`Orders` ON `ContactDetails`.`contact_id` = `Orders`.`contact_id`',
    );
    await expect(sql).toContainText(
      'INNER JOIN `jarvis_demo`.`OrderItems` ON `Orders`.`order_id` = `OrderItems`.`order_id` AND `Orders`.`region_code` = `OrderItems`.`region_code`',
    );
  });
});
