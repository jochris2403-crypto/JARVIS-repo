import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/app-routes';
import { useConnectionStore } from '@/stores/connection-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useSystemStore } from '@/stores/system-store';
import { DEFAULT_SIDEBAR_SECTIONS, useUiStore } from '@/stores/ui-store';
import { installFakeApi, type FakeApi } from '@/test/fake-api';

let api: FakeApi;

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <AppRoutes />
    </MemoryRouter>,
  );
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
  api = installFakeApi();
});

const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });
const main = () => screen.getByRole('main');

async function openNewConnectionDialog(user: ReturnType<typeof userEvent.setup>) {
  await within(sidebar()).findByText('No connections');
  await user.click(within(sidebar()).getAllByRole('button', { name: 'New connection' })[0]!);
  return screen.findByRole('form', { name: 'New connection' });
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 's3cret') {
  await user.type(screen.getByLabelText('Connection name'), 'Shop DB');
  await user.type(screen.getByLabelText('Username'), 'app');
  if (password) await user.type(screen.getByLabelText('Password'), password);
}

describe('connection management', () => {
  it('validates the form before sending anything', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '99999');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a name for this connection.')).toBeInTheDocument();
    expect(screen.getByText('Enter a username.')).toBeInTheDocument();
    expect(screen.getByText('Enter a port between 1 and 65535.')).toBeInTheDocument();
    expect(screen.getByLabelText('Connection name')).toHaveAttribute('aria-invalid', 'true');
    expect(api.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('tests a connection and reports success and failure', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user, 'wrong');
    await user.click(within(form).getByRole('button', { name: 'Test connection' }));
    expect(
      await within(form).findByText('Access denied. Check the username and password.'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Password'));
    // Editing a field clears the now-stale result.
    expect(within(form).queryByText(/Access denied/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 's3cret');
    await user.click(within(form).getByRole('button', { name: 'Test connection' }));
    expect(await within(form).findByText(/Connection successful/)).toBeInTheDocument();
    expect(within(form).getByText(/MySQL 8\.0\.45 · app@localhost · 7 ms/)).toBeInTheDocument();
    expect(api.profiles).toHaveLength(0);
  });

  it('saves, connects, picks a database and shows the real schema', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save & connect' }));

    // Connected, but no default database: the user is asked to choose one.
    expect(
      await within(main()).findByRole('heading', { name: 'Select a database' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active connection: Shop DB' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'Shop DB — Active' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Select a database' })[0]!);
    await user.click(await screen.findByRole('menuitemradio', { name: 'shop' }));

    const totals = await screen.findByLabelText('Schema totals');
    expect(within(totals).getByText('Tables').nextElementSibling).toHaveTextContent('2');
    expect(within(totals).getByText('Views').nextElementSibling).toHaveTextContent('1');
    expect(within(totals).getByText('Relationships').nextElementSibling).toHaveTextContent('1');
    const tables = within(sidebar()).getByRole('list', { name: 'Tables' });
    expect(within(tables).getByText('customers')).toBeInTheDocument();
    expect(within(sidebar()).getByRole('list', { name: 'Views' })).toHaveTextContent(
      'recent_orders',
    );

    // The password went to the server once and is not held anywhere in the client.
    expect(
      api.requests.filter((r) => JSON.stringify(r.body ?? '').includes('s3cret')),
    ).toHaveLength(1);
    expect(JSON.stringify(useConnectionStore.getState())).not.toContain('s3cret');
    expect(JSON.stringify({ ...localStorage })).not.toContain('s3cret');
  });

  it('reports a failed connect and stays disconnected', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user, 'wrong');
    await user.click(within(form).getByRole('button', { name: 'Save & connect' }));

    expect(
      await within(sidebar()).findByRole('button', { name: 'Shop DB — Not connected' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(useNotificationStore.getState().items[0]).toMatchObject({
        level: 'error',
        title: 'Could not connect to Shop DB',
      }),
    );
    expect(screen.getByRole('button', { name: 'No connection' })).toBeInTheDocument();
  });

  it('edits a connection without resending the password', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await user.click(await within(sidebar()).findByRole('button', { name: 'Actions for Shop DB' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit…' }));
    const edit = await screen.findByRole('form', { name: 'Edit connection' });
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(within(edit).getByText('Leave blank to keep the saved password.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Connection name'));
    await user.type(screen.getByLabelText('Connection name'), 'Shop (prod)');
    await user.click(screen.getByRole('switch', { name: 'Read-only' }));
    await user.click(within(edit).getByRole('button', { name: 'Save' }));

    expect(
      await within(sidebar()).findByRole('button', { name: 'Shop (prod) — Not connected' }),
    ).toBeInTheDocument();
    const put = api.requests.find((r) => r.method === 'PUT');
    expect(put?.body).toMatchObject({ name: 'Shop (prod)', readOnly: true });
    expect(put?.body).not.toHaveProperty('password');
    expect(api.profiles[0]).toMatchObject({ hasPassword: true });
  });

  it('shows a duplicate-name error on the name field', async () => {
    const user = userEvent.setup();
    renderApp();
    let form = await openNewConnectionDialog(user);
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await within(sidebar()).findByRole('button', { name: 'Shop DB — Not connected' });

    await user.click(within(sidebar()).getAllByRole('button', { name: 'New connection' })[0]!);
    form = await screen.findByRole('form', { name: 'New connection' });
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(
      await within(form).findByText('A connection named "Shop DB" already exists'),
    ).toBeInTheDocument();
  });

  it('deletes a connection only after explicit confirmation', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const openDeleteDialog = async () => {
      await user.click(
        await within(sidebar()).findByRole('button', { name: 'Actions for Shop DB' }),
      );
      await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
      return screen.findByRole('alertdialog');
    };

    let dialog = await openDeleteDialog();
    expect(dialog).toHaveTextContent('Nothing on the MySQL server is changed.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.profiles).toHaveLength(1);

    dialog = await openDeleteDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Delete connection' }));
    expect(await within(sidebar()).findByText('No connections')).toBeInTheDocument();
    expect(api.profiles).toHaveLength(0);
  });

  it('disconnects and returns to the no-connection state', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = await openNewConnectionDialog(user);
    await fillForm(user);
    await user.click(within(form).getByRole('button', { name: 'Save & connect' }));
    await within(main()).findByRole('heading', { name: 'Select a database' });

    await user.click(screen.getByRole('button', { name: 'Active connection: Shop DB' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Disconnect from Shop DB' }));
    expect(
      await screen.findByRole('heading', { name: 'No active MySQL connection' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar()).getByRole('button', { name: 'Shop DB — Not connected' }),
    ).toBeInTheDocument();
  });
});
