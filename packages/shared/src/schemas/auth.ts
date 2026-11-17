import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().min(1, 'Enter your username').max(200),
  password: z.string().min(1, 'Enter your password').max(1000),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The caller's session. When the server runs without authentication (local use
 * on 127.0.0.1) `authRequired` is false and every caller is `authenticated`.
 */
export const sessionResponseSchema = z.object({
  authRequired: z.boolean(),
  authenticated: z.boolean(),
  username: z.string().nullable(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
