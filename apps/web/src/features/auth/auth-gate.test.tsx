import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/app-routes';
import { useAuthStore } from '@/stores/auth-store';
import { useConnectionStore } from '@/stores/connection-store';
import { installFakeApi } from '@/test/fake-api';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'checking', authRequired: false, username: null, error: null });
  useConnectionStore.getState().reset();
});

describe('sign-in', () => {
  it('goes straight to the app when the server has no password', async () => {
    installFakeApi();
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('asks for credentials, rejects a wrong password, then signs in', async () => {
    const api = installFakeApi({ auth: { required: true } });
    const user = userEvent.setup();
    renderApp();

    const username = await screen.findByLabelText('Username');
    // The workspace and its data stay hidden until signed in.
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
    expect(api.requests.some((r) => r.path === '/connections')).toBe(false);

    await user.type(username, 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password');
    expect(screen.getByLabelText('Password')).toHaveValue('');

    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });

  it('returns to the sign-in screen when the session expires', async () => {
    const api = installFakeApi({ auth: { required: true, signedIn: true } });
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();

    api.auth.signedIn = false;
    await useConnectionStore.getState().loadProfiles();
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
  });
});
