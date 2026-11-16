import { ApiClientError } from '@/api/client';

/** A message suitable for showing to the user, whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiClientError ? error.code : null;
}
