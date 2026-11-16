import type { QuerySpec } from '@jarvis/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/app-routes';
import { useConnectionStore } from '@/stores/connection-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useQueryStore } from '@/stores/query-store';
import { useSystemStore } from '@/stores/system-store';
import { DEFAULT_SIDEBAR_SECTIONS, useUiStore } from '@/stores/ui-store';
import { installFakeApi, type FakeApi } from '@/test/fake-api';

const CONNECTION_ID = '00000000-0000-4000-8000-000000000042';
let api: FakeApi;

/** Starts with an open connection whose default database is `shop`. */
async function renderQueryBuilder() {
  render(
    <MemoryRouter initialEntries={['/query']}>
      <AppRoutes />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Query Builder' });
  return userEvent.setup();
}

beforeEach(() => {
  useUiStore.setState({
    sidebarCollapsed: false,
    sidebarSections: DEFAULT_SIDEBAR_SECTIONS,
    commandPaletteOpen: false,
  });
  useNotificationStore.setState({ items: [] });
  useSystemStore.setState({
    apiStatus: 'checking',
    health: null,
    latencyMs: null,
    lastCheckedAt: null,
    lastError: null,
  });
  useConnectionStore.getState().reset();
  useQueryStore.getState().ensureContext('reset');
  api = installFakeApi({
    profiles: [
      {
        id: CONNECTION_ID,
        name: 'Shop DB',
        host: '127.0.0.1',
        port: 3306,
        user: 'app',
        database: 'shop',
        ssl: { enabled: false, rejectUnauthorized: true },
        connectTimeoutMs: 10000,
        readOnly: false,
        hasPassword: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastConnectedAt: '2026-01-01T00:00:00.000Z',
        connected: true,
        serverVersion: '8.0.45',
      },
    ],
  });
  useConnectionStore.setState({ activeId: CONNECTION_ID });
});

const steps = () => screen.getByLabelText('Query steps');
const sql = () => screen.getByLabelText('SQL statement');
/** The toolbar's Run button (the empty results panel offers a second one). */
const runButton = () => screen.getAllByRole('button', { name: 'Run query' })[0]!;
const lastSpec = (kind: 'compile' | 'execute'): QuerySpec => {
  const request = api.requests.filter((r) => r.path.endsWith(`/query/${kind}`)).at(-1);
  if (!request) throw new Error(`no ${kind} request was made`);
  const body = request.body as QuerySpec | { query: QuerySpec };
  return 'query' in body ? body.query : body;
};

describe('visual query builder', () => {
  it('builds a joined query, shows server-generated SQL and runs it', async () => {
    const user = await renderQueryBuilder();
    expect(runButton()).toBeDisabled();

    await user.selectOptions(within(steps()).getByLabelText('Add table'), 'customers');
    await waitFor(() => expect(sql()).toHaveTextContent('SELECT * FROM customers LIMIT 100'));

    // The related table is offered and joined on its foreign key automatically.
    await user.click(within(steps()).getByRole('button', { name: 'Add related table orders' }));
    await waitFor(() =>
      expect(sql()).toHaveTextContent('SELECT * FROM customers INNER JOIN orders LIMIT 100'),
    );
    expect(lastSpec('compile').joins).toEqual([
      {
        type: 'inner',
        table: 'orders',
        alias: 'orders',
        on: [
          {
            left: { table: 'customers', column: 'id' },
            operator: 'eq',
            right: { table: 'orders', column: 'customer_id' },
          },
        ],
      },
    ]);
    expect(within(screen.getByLabelText('Join overview')).getByText('INNER')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Join type for orders'), 'left');
    await user.click(screen.getByRole('checkbox', { name: 'customers.name' }));
    await user.click(screen.getByRole('checkbox', { name: 'orders.total' }));
    await user.type(screen.getByLabelText('Output name for customers.name'), 'Customer');
    await waitFor(() =>
      expect(sql()).toHaveTextContent('SELECT 2 FROM customers LEFT JOIN orders LIMIT 100'),
    );
    expect(lastSpec('compile').select).toEqual([
      { kind: 'column', column: { table: 'customers', column: 'name' }, alias: 'Customer' },
      { kind: 'column', column: { table: 'orders', column: 'total' } },
    ]);

    await user.click(runButton());
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(await within(results).findByText('2 rows')).toBeInTheDocument();
    expect(within(results).getByRole('columnheader', { name: /^name/ })).toBeInTheDocument();
    expect(within(results).getByText('Ada')).toBeInTheDocument();
    expect(within(results).getByText('NULL')).toBeInTheDocument();
    expect(lastSpec('execute').joins[0]!.type).toBe('left');
  });

  it('builds nested AND/OR conditions with every kind of value editor', async () => {
    const user = await renderQueryBuilder();
    await user.selectOptions(within(steps()).getByLabelText('Add table'), 'customers');
    const filters = screen.getByRole('region', { name: 'Filter rows' });

    await user.click(within(filters).getByRole('button', { name: 'Add filter' }));
    // An incomplete condition blocks the query and says why.
    expect(await screen.findByText('Filter: choose a column.')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();

    await user.selectOptions(
      within(filters).getByLabelText('Condition column'),
      'customers.country',
    );
    await user.type(within(filters).getByLabelText('Condition value'), 'IN');
    await waitFor(() =>
      expect(screen.queryByText('Filter: choose a column.')).not.toBeInTheDocument(),
    );

    await user.click(within(filters).getByRole('button', { name: 'Add group' }));
    const group = within(filters).getByRole('group', { name: 'Nested OR group' });
    await user.selectOptions(within(group).getByLabelText('Condition column'), 'customers.name');
    await user.selectOptions(within(group).getByLabelText('Condition operator'), 'IN');
    await user.type(within(group).getByLabelText('Add value to list'), 'Ada{Enter}Grace,');

    await user.click(within(group).getByRole('button', { name: 'Add filter' }));
    const second = within(group).getAllByRole('group', { name: 'Condition' })[1]!;
    await user.selectOptions(within(second).getByLabelText('Condition column'), 'customers.id');
    await user.selectOptions(within(second).getByLabelText('Condition operator'), 'BETWEEN');
    await user.type(within(second).getByLabelText('From value'), '10');
    await user.type(within(second).getByLabelText('To value'), '20');

    await waitFor(() =>
      expect(lastSpec('compile').where).toEqual({
        kind: 'group',
        op: 'and',
        items: [
          {
            kind: 'condition',
            left: { kind: 'column', column: { table: 'customers', column: 'country' } },
            operator: 'eq',
            right: { kind: 'value', value: 'IN' },
          },
          {
            kind: 'group',
            op: 'or',
            items: [
              {
                kind: 'condition',
                left: { kind: 'column', column: { table: 'customers', column: 'name' } },
                operator: 'in',
                values: ['Ada', 'Grace'],
              },
              {
                kind: 'condition',
                left: { kind: 'column', column: { table: 'customers', column: 'id' } },
                operator: 'between',
                range: ['10', '20'],
              },
            ],
          },
        ],
      }),
    );
  });

  it('builds aggregates with grouping, HAVING, sorting and paging', async () => {
    const user = await renderQueryBuilder();
    await user.selectOptions(within(steps()).getByLabelText('Add table'), 'customers');
    await user.click(screen.getByRole('checkbox', { name: 'customers.country' }));

    const summarize = screen.getByRole('region', { name: 'Summarize' });
    await user.click(within(summarize).getByRole('button', { name: 'Add aggregate' }));
    await user.type(within(summarize).getByLabelText('Output name for COUNT(*)'), 'customers');

    // Selecting a plain column next to an aggregate needs GROUP BY; the builder offers it.
    await user.click(
      await within(summarize).findByRole('button', { name: 'Group by selected columns' }),
    );
    expect(
      within(within(summarize).getByRole('list', { name: 'Grouping columns' })).getByText(
        'customers.country',
      ),
    ).toBeInTheDocument();

    await user.click(within(summarize).getByRole('button', { name: 'Add group filter' }));
    await user.selectOptions(within(summarize).getByLabelText('Condition column'), 'COUNT(*)');
    await user.selectOptions(within(summarize).getByLabelText('Condition operator'), 'gte');
    await user.type(within(summarize).getByLabelText('Condition value'), '2');

    const sort = screen.getByRole('region', { name: 'Sort and limit' });
    await user.click(within(sort).getByRole('button', { name: 'Add sort' }));
    await user.selectOptions(within(sort).getByLabelText('Sort column'), 'COUNT(*)');
    await user.selectOptions(within(sort).getByLabelText('Sort direction'), 'desc');
    await user.clear(within(sort).getByLabelText('Limit'));
    await user.type(within(sort).getByLabelText('Limit'), '2');

    const count = { fn: 'COUNT', column: null, distinct: false };
    await waitFor(() =>
      expect(lastSpec('compile')).toMatchObject({
        select: [
          { kind: 'column', column: { table: 'customers', column: 'country' } },
          { kind: 'aggregate', aggregate: count, alias: 'customers' },
        ],
        groupBy: [{ table: 'customers', column: 'country' }],
        having: {
          kind: 'group',
          op: 'and',
          items: [
            {
              kind: 'condition',
              left: { kind: 'aggregate', aggregate: count },
              operator: 'gte',
              right: { kind: 'value', value: '2' },
            },
          ],
        },
        orderBy: [{ expr: { kind: 'aggregate', aggregate: count }, direction: 'desc' }],
        limit: 2,
        offset: 0,
      }),
    );

    // A full page (2 rows with limit 2) enables paging, which re-runs at the next offset.
    await user.click(runButton());
    await user.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastSpec('execute').offset).toBe(2));
    expect(within(sort).getByLabelText('Offset')).toHaveValue('2');
  });

  it('adds tables from the sidebar explorer', async () => {
    const user = await renderQueryBuilder();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    await user.click(await within(sidebar).findByRole('button', { name: 'Add orders to query' }));
    await user.click(within(sidebar).getByRole('button', { name: 'Add customers to query' }));
    const tables = within(steps()).getByRole('list', { name: 'Tables in query' });
    expect(
      within(tables)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('orders'), expect.stringContaining('customers')]);
    await waitFor(() =>
      expect(lastSpec('compile').joins[0]!.on[0]).toMatchObject({
        left: { table: 'orders', column: 'customer_id' },
      }),
    );
  });

  it('shows query errors from MySQL', async () => {
    api.queryError = {
      status: 400,
      code: 'DB_QUERY_FAILED',
      message: "Unknown column 'x' in 'field list'",
    };
    const user = await renderQueryBuilder();
    await user.selectOptions(within(steps()).getByLabelText('Add table'), 'customers');
    await waitFor(() => expect(runButton()).toBeEnabled());
    await user.click(runButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The query failed');
    expect(alert).toHaveTextContent("Unknown column 'x' in 'field list'");
  });

  it('clears the query after confirmation', async () => {
    const user = await renderQueryBuilder();
    await user.selectOptions(within(steps()).getByLabelText('Add table'), 'customers');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear query' }),
    );
    expect(await screen.findByText('Start with a table')).toBeInTheDocument();
  });
});
