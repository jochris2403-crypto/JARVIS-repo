import { AppError } from '../errors/app-error.js';

/** MySQL identifiers are at most 64 characters. */
const MAX_IDENTIFIER_LENGTH = 64;

/**
 * Quotes a MySQL identifier (database, table, column or alias).
 *
 * Inside backticks the only special character is the backtick itself, which is
 * escaped by doubling. NUL is rejected because MySQL does not permit it in
 * identifiers. This is the single place identifiers enter SQL text.
 */
export function quoteIdentifier(name: string): string {
  if (name.length === 0 || name.length > MAX_IDENTIFIER_LENGTH || name.includes('\0')) {
    throw new AppError('VALIDATION_FAILED', 'Invalid identifier');
  }
  return `\`${name.replaceAll('`', '``')}\``;
}
