import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Parses untrusted input with a Zod schema. On failure throws VALIDATION_FAILED
 * with field-level issues (paths and messages only — never the rejected values,
 * which could include a password).
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: FieldIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw AppError.validation({ issues });
}
