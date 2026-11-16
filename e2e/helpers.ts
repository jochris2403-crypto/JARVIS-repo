import { expect, type Page } from '@playwright/test';

export const mysql = {
  host: process.env.JARVIS_TEST_MYSQL_HOST,
  port: process.env.JARVIS_TEST_MYSQL_PORT ?? '3306',
  user: process.env.JARVIS_TEST_MYSQL_USER,
  password: process.env.JARVIS_TEST_MYSQL_PASSWORD ?? '',
  database: process.env.JARVIS_TEST_MYSQL_DATABASE ?? 'jarvis_demo',
};

export const mysqlConfigured = Boolean(mysql.host && mysql.user);

export const uniqueName = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Creates a connection to the dev database through the UI and waits until its schema is loaded. */
export async function connectToDemoDatabase(page: Page, label = 'E2E'): Promise<string> {
  const name = uniqueName(label);
  await page.goto('/overview');
  await expect(page.getByText('Server online')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'New connection' }).click();
  await page.getByLabel('Connection name').fill(name);
  await page.getByLabel('Host').fill(mysql.host!);
  await page.getByLabel('Port').fill(mysql.port);
  await page.getByLabel('Username').fill(mysql.user!);
  await page.getByLabel('Password').fill(mysql.password);
  await page.getByLabel('Default database').fill(mysql.database);
  await page.getByRole('button', { name: 'Save & connect' }).click();
  await expect(page.getByLabel('Schema totals')).toBeVisible();
  return name;
}
