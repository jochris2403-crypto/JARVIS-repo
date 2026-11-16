import { AppError } from '../errors/app-error.js';

interface MysqlLikeError {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
}

const TLS_CERT_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const CONNECTION_LOST_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'EPIPE',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ER_SERVER_SHUTDOWN',
]);

function asMysqlError(error: unknown): MysqlLikeError {
  return typeof error === 'object' && error !== null ? (error as MysqlLikeError) : {};
}

/** Safe, structured detail for the client: MySQL's own code, never a stack trace. */
function details(error: MysqlLikeError) {
  return { mysqlCode: error.code ?? null, errno: error.errno ?? null };
}

/**
 * Translates a failure to connect into a message a user can act on. The target
 * is described by host and port only — credentials are never echoed.
 */
export function toConnectionError(
  error: unknown,
  target: { host: string; port: number },
): AppError {
  const e = asMysqlError(error);
  const where = `${target.host}:${target.port}`;
  let message: string;

  switch (e.code) {
    case 'ECONNREFUSED':
      message = `Connection refused at ${where}. Check that MySQL is running and the host and port are correct.`;
      break;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      message = `Host "${target.host}" could not be resolved.`;
      break;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      message = `Timed out reaching ${where}. The server may be down or blocked by a firewall.`;
      break;
    case 'ER_ACCESS_DENIED_ERROR':
      message = 'Access denied. Check the username and password.';
      break;
    case 'ER_DBACCESS_DENIED_ERROR':
      message = 'This account is not allowed to use the selected database.';
      break;
    case 'ER_BAD_DB_ERROR':
      message = 'The default database does not exist on this server.';
      break;
    case 'HANDSHAKE_NO_SSL_SUPPORT':
      message = 'The server does not support SSL connections. Disable SSL for this connection.';
      break;
    case 'ER_CON_COUNT_ERROR':
      message = 'The server has too many open connections.';
      break;
    default:
      if (e.code && TLS_CERT_CODES.has(e.code)) {
        message =
          'The server’s TLS certificate could not be verified. Provide the CA certificate, or turn off certificate verification if you trust this server.';
      } else if (e.sqlMessage) {
        message = `MySQL rejected the connection: ${e.sqlMessage}`;
      } else {
        message = `Could not connect to ${where}${e.code ? ` (${e.code})` : ''}.`;
      }
  }
  return new AppError('DB_CONNECTION_FAILED', message, { details: details(e), cause: error });
}

/** Translates a failed statement on an established connection. */
export function toQueryError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = asMysqlError(error);
  if (e.code && CONNECTION_LOST_CODES.has(e.code)) {
    return new AppError('DB_CONNECTION_FAILED', 'The connection to MySQL was lost.', {
      details: details(e),
      cause: error,
    });
  }
  const message = e.sqlMessage ?? 'The database rejected the request.';
  return new AppError('DB_QUERY_FAILED', message, { details: details(e), cause: error });
}
