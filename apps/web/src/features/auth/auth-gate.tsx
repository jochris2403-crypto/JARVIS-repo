import { APP_TAGLINE } from '@jarvis/shared';
import { CircleAlert, LogIn } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useApplyAppearance } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';
import { useSystemStore } from '@/stores/system-store';

/**
 * Renders the application only once the server confirms a session. When the
 * server runs without a password (local use) it lets everyone straight through.
 */
export function AuthGate() {
  useApplyAppearance();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    void useAuthStore.getState().checkSession();
  }, []);

  // If the server was down when the page loaded, ask again once the health monitor sees it.
  const apiOnline = useSystemStore((s) => s.apiStatus === 'online');
  useEffect(() => {
    if (apiOnline && useAuthStore.getState().status === 'unreachable') {
      void useAuthStore.getState().checkSession();
    }
  }, [apiOnline]);

  // While the server is unreachable the shell shows its own offline state and keeps retrying.
  if (status === 'signed-in' || status === 'unreachable') return <Outlet />;
  if (status === 'signed-out') return <LoginScreen />;
  return (
    <Centered>
      <LogoMark active className="size-10" />
      <span className="sr-only">Connecting to the JARVIS server…</span>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 overflow-auto bg-bg bg-grid p-4 text-fg">
      {children}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <LogoMark className="size-11" />
      <div className="flex flex-col items-center gap-1">
        <Wordmark />
        <p className="text-2xs text-fg-subtle">{APP_TAGLINE}</p>
      </div>
    </div>
  );
}

function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <main className="flex w-full max-w-sm flex-col gap-6">
        <Brand />
        <form
          onSubmit={(e) => void submit(e)}
          aria-labelledby="login-title"
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-raised"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <h1 id="login-title" className="text-base font-semibold">
              Sign in
            </h1>
            <p className="text-xs text-fg-muted">Use the account set on the JARVIS server.</p>
          </div>

          <Field label="Username" htmlFor="login-username">
            <Input
              id="login-username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <Input
              ref={passwordRef}
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </Field>

          {error && (
            <p
              id="login-error"
              role="alert"
              className="flex items-start gap-1.5 text-xs text-danger"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            {!busy && <LogIn />} Sign in
          </Button>
        </form>
      </main>
    </Centered>
  );
}
