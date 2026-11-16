import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  name: z.string(),
  version: z.string(),
  /** Seconds since the API process started. */
  uptimeSeconds: z.number().nonnegative(),
  /** Node.js runtime version of the API process. */
  nodeVersion: z.string(),
  /** ISO-8601 server time, useful for diagnosing clock skew in history timestamps. */
  serverTime: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
