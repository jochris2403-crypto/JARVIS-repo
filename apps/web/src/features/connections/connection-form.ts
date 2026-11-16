import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MYSQL_PORT,
  connectionCreateSchema,
  connectionUpdateSchema,
  type ConnectionCreateInput,
  type ConnectionProfile,
  type ConnectionUpdateInput,
} from '@jarvis/shared';

/** Raw form values. Numbers stay strings while the user is typing. */
export interface ConnectionFormValues {
  name: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslEnabled: boolean;
  sslVerify: boolean;
  sslCa: string;
  timeoutSeconds: string;
  readOnly: boolean;
}

export type ConnectionFormField =
  'name' | 'host' | 'port' | 'user' | 'password' | 'database' | 'timeoutSeconds' | 'sslCa';
export type ConnectionFormErrors = Partial<Record<ConnectionFormField, string>>;

export function initialValues(profile?: ConnectionProfile): ConnectionFormValues {
  return {
    name: profile?.name ?? '',
    host: profile?.host ?? '127.0.0.1',
    port: String(profile?.port ?? DEFAULT_MYSQL_PORT),
    user: profile?.user ?? '',
    password: '',
    database: profile?.database ?? '',
    sslEnabled: profile?.ssl.enabled ?? false,
    sslVerify: profile?.ssl.rejectUnauthorized ?? true,
    sslCa: profile?.ssl.ca ?? '',
    timeoutSeconds: String((profile?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS) / 1000),
    readOnly: profile?.readOnly ?? false,
  };
}

/** Maps a schema path to the form field that owns it and a message written for people. */
const FIELD_FOR_PATH: Record<string, { field: ConnectionFormField; message?: string }> = {
  name: { field: 'name', message: 'Enter a name for this connection.' },
  host: { field: 'host', message: 'Enter a host name or IP address.' },
  port: { field: 'port', message: 'Enter a port between 1 and 65535.' },
  user: { field: 'user', message: 'Enter a username.' },
  password: { field: 'password' },
  database: { field: 'database', message: 'Database names are at most 64 characters.' },
  connectTimeoutMs: {
    field: 'timeoutSeconds',
    message: 'Enter a timeout between 1 and 120 seconds.',
  },
  ssl: { field: 'sslCa', message: 'The CA certificate is too large.' },
};

type ParseResult<T> = { ok: true; input: T } | { ok: false; errors: ConnectionFormErrors };

/**
 * Converts form values into an API payload and validates it with the shared
 * schema — the same one the server enforces.
 *
 * @param keepStoredPassword Edit mode with the password field untouched: the
 *   password is omitted so the server keeps the one it has.
 */
export function parseForm(
  values: ConnectionFormValues,
  keepStoredPassword: boolean,
): ParseResult<ConnectionCreateInput | ConnectionUpdateInput> {
  const candidate = {
    name: values.name,
    host: values.host,
    port: Number(values.port),
    user: values.user,
    ...(keepStoredPassword ? {} : { password: values.password }),
    ...(values.database.trim() ? { database: values.database } : {}),
    ssl: {
      enabled: values.sslEnabled,
      rejectUnauthorized: values.sslVerify,
      ...(values.sslEnabled && values.sslCa.trim() ? { ca: values.sslCa.trim() } : {}),
    },
    connectTimeoutMs: Math.round(Number(values.timeoutSeconds) * 1000),
    readOnly: values.readOnly,
  };

  const schema = keepStoredPassword ? connectionUpdateSchema : connectionCreateSchema;
  const result = schema.safeParse(candidate);
  if (result.success) return { ok: true, input: result.data };

  const errors: ConnectionFormErrors = {};
  for (const issue of result.error.issues) {
    const mapping = FIELD_FOR_PATH[String(issue.path[0])];
    if (mapping && !errors[mapping.field]) errors[mapping.field] = mapping.message ?? issue.message;
  }
  return { ok: false, errors };
}
