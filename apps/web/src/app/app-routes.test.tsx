import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from '@/stores/connection-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useSystemStore } from '@/stores/system-store';
import { DEFAULT_SIDEBAR_SECTIONS, useUiStore } from '@/stores/ui-store';
import { installFakeApi } from '@/test/fake-api';
import { AppRoutes } from './app-routes';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({
    theme: 'dark',
    reducedMotion: false,
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
  installFakeApi();
});

describe('application shell', () => {
  it('opens on the Overview workspace', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Workspaces' });
    expect(within(tabs).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('switches workspace from the tab bar', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const tabs = screen.getByRole('navigation', { name: 'Workspaces' });
    await user.click(within(tabs).getByRole('link', { name: 'Query Builder' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Query Builder' })).toBeInTheDocument();
  });

  it('switches workspace with Alt+digit', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.keyboard('{Alt>}[Digit3]{/Alt}');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Relationship Designer' }),
    ).toBeInTheDocument();
  });

  it('reports live server status from /api/health', async () => {
    renderApp('/overview');
    expect(await screen.findByText('Server online')).toBeInTheDocument();
    expect(screen.getByText('Node 24.0.0')).toBeInTheDocument();
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });

  it('shows an offline state and notifies when the server is unreachable', async () => {
    installFakeApi({ online: false });
    renderApp('/overview');
    expect(await screen.findByText('Server offline')).toBeInTheDocument();
    expect(screen.getByText('The web app cannot reach the JARVIS API.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications (1 unread)' })).toBeInTheDocument();
  });

  it('collapses and expands the sidebar', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveAttribute(
      'data-collapsed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Saved queries' }));
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveAttribute(
      'data-collapsed',
      'false',
    );
    expect(screen.getByText('No saved queries')).toBeInTheDocument();
  });

  it('runs commands from the command palette', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText('Search workspaces and commands…');
    await user.type(input, 'theme light');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(
      screen.queryByPlaceholderText('Search workspaces and commands…'),
    ).not.toBeInTheDocument();
  });

  it('changes preferences on the settings page', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await user.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'System' }));
    expect(useUiStore.getState().theme).toBe('system');
  });

  it('renders a not-found page for unknown routes', () => {
    renderApp('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toHaveAttribute(
      'href',
      '/overview',
    );
  });
});
