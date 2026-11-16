import { z } from 'zod';

export const CONNECT_TIMEOUT_MIN_MS = 1_000;
export const CONNECT_TIMEOUT_MAX_MS = 120_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_MYSQL_PORT = 3306;

export const sslConfigSchema = z.object({
  enabled: z.boolean(),
  /** Verify the server certificate against trusted CAs (or `ca` when given). */
  rejectUnauthorized: z.boolean(),
  /** Optional PEM-encoded CA certificate. */
  ca: z.string().max(65_536).optional(),
});
export type SslConfig = z.infer<typeof sslConfigSchema>;

/** Connection settings that are safe to send back to the browser. */
const connectionSettingsShape = {
  name: z.string().trim().min(1, 'Name is required').max(80),
  host: z.string().trim().min(1, 'Host is required').max(255),
  port: z.number().int().min(1).max(65_535),
  user: z.string().min(1, 'Username is required').max(128),
  /** Default database to open after connecting. */
  database: z.string().trim().min(1).max(64).optional(),
  ssl: sslConfigSchema,
  connectTimeoutMs: z.number().int().min(CONNECT_TIMEOUT_MIN_MS).max(CONNECT_TIMEOUT_MAX_MS),
  /** When true, JARVIS refuses every write operation on this connection. */
  readOnly: z.boolean(),
};

const passwordSchema = z.string().max(1024);

export const connectionCreateSchema = z.object({
  ...connectionSettingsShape,
  password: passwordSchema,
});
export type ConnectionCreateInput = z.infer<typeof connectionCreateSchema>;

/** On update, an omitted password keeps the stored one. */
export const connectionUpdateSchema = z.object({
  ...connectionSettingsShape,
  password: passwordSchema.optional(),
});
export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>;

/**
 * Tests settings without saving them. When editing a saved connection the
 * password may be omitted; `id` then tells the server to use the stored one.
 */
export const connectionTestSchema = z.object({
  ...connectionSettingsShape,
  password: passwordSchema.optional(),
  id: z.uuid().optional(),
});
export type ConnectionTestInput = z.infer<typeof connectionTestSchema>;

/** A saved connection as the browser sees it. Never contains the password. */
export const connectionProfileSchema = z.object({
  id: z.uuid(),
  ...connectionSettingsShape,
  hasPassword: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastConnectedAt: z.string().nullable(),
  /** Whether the server currently holds an open pool for this connection. */
  connected: z.boolean(),
  serverVersion: z.string().nullable(),
});
export type ConnectionProfile = z.infer<typeof connectionProfileSchema>;

export const connectionListResponseSchema = z.object({
  connections: z.array(connectionProfileSchema),
});

export const connectionTestResultSchema = z.object({
  ok: z.literal(true),
  serverVersion: z.string(),
  /** The account MySQL authenticated, e.g. `app@localhost`. */
  authenticatedAs: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;

export const connectionDeleteResponseSchema = z.object({ deleted: z.literal(true) });
