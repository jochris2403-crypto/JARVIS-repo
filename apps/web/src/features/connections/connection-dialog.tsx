import type { ConnectionProfile, ConnectionTestResult } from '@jarvis/shared';
import { CircleAlert, CircleCheck, PlugZap } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiClientError } from '@/api/client';
import { testConnection } from '@/api/connections';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import {
  initialValues,
  parseForm,
  type ConnectionFormErrors,
  type ConnectionFormField,
  type ConnectionFormValues,
} from './connection-form';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; result: ConnectionTestResult }
  | { status: 'error'; message: string };

/** Create/edit connection dialog, driven by the connection store's `dialog` state. */
export function ConnectionDialog() {
  const dialog = useConnectionStore((s) => s.dialog);
  const closeDialog = useConnectionStore((s) => s.closeDialog);
  const profile = useConnectionStore((s) =>
    s.dialog?.mode === 'edit'
      ? s.profiles.find((p) => p.id === (s.dialog as { id: string }).id)
      : undefined,
  );

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="top-[8%] max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        {dialog && (
          // Keyed so every open starts from fresh state.
          <ConnectionForm
            key={dialog.mode === 'edit' ? dialog.id : 'create'}
            profile={profile}
            onDone={closeDialog}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionForm({ profile, onDone }: { profile?: ConnectionProfile; onDone: () => void }) {
  const editing = profile !== undefined;
  const save = useConnectionStore((s) => s.save);
  const connect = useConnectionStore((s) => s.connect);

  const [values, setValues] = useState<ConnectionFormValues>(() => initialValues(profile));
  const [errors, setErrors] = useState<ConnectionFormErrors>({});
  /** In edit mode the stored password is kept unless the user types a new one. */
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState<'save' | 'connect' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const testAbort = useRef<AbortController | null>(null);

  useEffect(() => () => testAbort.current?.abort(), []);

  const keepStoredPassword = editing && !passwordTouched;
  const busy = saving !== null || test.status === 'testing';

  const set = <K extends keyof ConnectionFormValues>(key: K, value: ConnectionFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSubmitError(null);
    // A test result describes the settings as they were; it is stale once they change.
    setTest({ status: 'idle' });
  };

  const validate = () => {
    const parsed = parseForm(values, keepStoredPassword);
    setErrors(parsed.ok ? {} : parsed.errors);
    return parsed;
  };

  const runTest = async () => {
    const parsed = validate();
    if (!parsed.ok) return;
    testAbort.current?.abort();
    const controller = new AbortController();
    testAbort.current = controller;
    setTest({ status: 'testing' });
    try {
      const result = await testConnection(
        { ...parsed.input, ...(editing ? { id: profile.id } : {}) },
        controller.signal,
      );
      setTest({ status: 'ok', result });
    } catch (error) {
      if (controller.signal.aborted) return;
      setTest({ status: 'error', message: errorMessage(error) });
    }
  };

  const submit = async (thenConnect: boolean) => {
    const parsed = validate();
    if (!parsed.ok) return;
    setSaving(thenConnect ? 'connect' : 'save');
    setSubmitError(null);
    try {
      const saved = await save(parsed.input, profile?.id);
      if (!thenConnect)
        notify('success', editing ? `Saved ${saved.name}` : `Added connection ${saved.name}`);
      onDone();
      if (thenConnect) void connect(saved.id);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'CONFLICT') {
        setErrors((e) => ({ ...e, name: error.message }));
      } else {
        setSubmitError(errorMessage(error));
      }
      setSaving(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(true);
  };

  const fieldProps = (field: ConnectionFormField, id: string) => ({
    id,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-error` : undefined,
    disabled: saving !== null,
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={editing ? 'Edit connection' : 'New connection'}
    >
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit connection' : 'New connection'}</DialogTitle>
        <DialogDescription>
          The password is encrypted and stored by the JARVIS server. It is never sent back to the
          browser.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto">
        <Field label="Connection name" htmlFor="conn-name" error={errors.name}>
          <Input
            {...fieldProps('name', 'conn-name')}
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Local development"
            maxLength={80}
          />
        </Field>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Host" htmlFor="conn-host" error={errors.host}>
            <Input
              {...fieldProps('host', 'conn-host')}
              value={values.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="127.0.0.1 or db.example.com"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Port" htmlFor="conn-port" error={errors.port}>
            <Input
              {...fieldProps('port', 'conn-port')}
              value={values.port}
              onChange={(e) => set('port', e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" htmlFor="conn-user" error={errors.user}>
            <Input
              {...fieldProps('user', 'conn-user')}
              value={values.user}
              onChange={(e) => set('user', e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="conn-password"
            error={errors.password}
            hint={
              editing && profile.hasPassword && !passwordTouched
                ? 'Leave blank to keep the saved password.'
                : undefined
            }
          >
            <Input
              {...fieldProps('password', 'conn-password')}
              type="password"
              value={values.password}
              onChange={(e) => {
                setPasswordTouched(true);
                set('password', e.target.value);
              }}
              placeholder={
                editing && profile.hasPassword && !passwordTouched ? '••••••••' : undefined
              }
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field
            label="Default database"
            htmlFor="conn-database"
            optional
            error={errors.database}
            hint="Opened automatically after connecting."
          >
            <Input
              {...fieldProps('database', 'conn-database')}
              value={values.database}
              onChange={(e) => set('database', e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Timeout (s)" htmlFor="conn-timeout" error={errors.timeoutSeconds}>
            <Input
              {...fieldProps('timeoutSeconds', 'conn-timeout')}
              value={values.timeoutSeconds}
              onChange={(e) => set('timeoutSeconds', e.target.value)}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          <ToggleRow
            id="conn-ssl"
            label="Use SSL/TLS"
            description="Encrypt traffic between JARVIS and the MySQL server."
            checked={values.sslEnabled}
            onChange={(v) => set('sslEnabled', v)}
            disabled={saving !== null}
          />
          {values.sslEnabled && (
            <>
              <ToggleRow
                id="conn-ssl-verify"
                label="Verify server certificate"
                description="Turn off only for servers you trust that use a self-signed certificate."
                checked={values.sslVerify}
                onChange={(v) => set('sslVerify', v)}
                disabled={saving !== null}
              />
              <div className="p-3">
                <Field
                  label="CA certificate"
                  htmlFor="conn-ssl-ca"
                  optional
                  error={errors.sslCa}
                  hint="PEM text. Needed when the server's certificate is signed by a private CA."
                >
                  <Textarea
                    {...fieldProps('sslCa', 'conn-ssl-ca')}
                    value={values.sslCa}
                    onChange={(e) => set('sslCa', e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    spellCheck={false}
                    rows={3}
                    className="font-mono text-2xs"
                  />
                </Field>
              </div>
            </>
          )}
          <ToggleRow
            id="conn-readonly"
            label="Read-only"
            description="JARVIS will refuse every operation that changes data or structure on this connection."
            checked={values.readOnly}
            onChange={(v) => set('readOnly', v)}
            disabled={saving !== null}
          />
        </div>
      </DialogBody>

      {/* Outside the scrolling body so results are always visible next to the buttons. */}
      {(test.status === 'ok' || test.status === 'error' || submitError) && (
        <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
          <TestResult state={test} />
          {submitError && (
            <p role="alert" className="rounded-md bg-danger-muted px-3 py-2 text-xs text-danger">
              {submitError}
            </p>
          )}
        </div>
      )}

      <DialogFooter className="justify-between">
        <Button
          onClick={() => void runTest()}
          loading={test.status === 'testing'}
          disabled={saving !== null}
        >
          {test.status !== 'testing' && <PlugZap />} Test connection
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onDone} disabled={saving !== null}>
            Cancel
          </Button>
          <Button onClick={() => void submit(false)} loading={saving === 'save'} disabled={busy}>
            Save
          </Button>
          <Button type="submit" variant="primary" loading={saving === 'connect'} disabled={busy}>
            Save &amp; connect
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function ToggleRow(props: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 p-3">
      <div className="min-w-0">
        <Label htmlFor={props.id}>{props.label}</Label>
        <p className="text-2xs text-fg-muted">{props.description}</p>
      </div>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onChange}
        disabled={props.disabled}
      />
    </div>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.status === 'idle' || state.status === 'testing') return null;
  const ok = state.status === 'ok';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-md px-3 py-2 text-xs',
        ok ? 'bg-success-muted text-success' : 'bg-danger-muted text-danger',
      )}
    >
      {ok ? (
        <CircleCheck className="mt-px size-3.5 shrink-0" />
      ) : (
        <CircleAlert className="mt-px size-3.5 shrink-0" />
      )}
      {ok ? (
        <span>
          Connection successful.{' '}
          <span className="font-mono text-2xs">
            MySQL {state.result.serverVersion} · {state.result.authenticatedAs} ·{' '}
            {state.result.latencyMs} ms
          </span>
        </span>
      ) : (
        <span>{state.message}</span>
      )}
    </div>
  );
}
