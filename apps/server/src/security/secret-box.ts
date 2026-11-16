import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_FILE = 'secret.key';

/** An AES-256-GCM ciphertext. All fields are base64. */
export interface EncryptedSecret {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

/**
 * Authenticated encryption for secrets at rest (connection passwords).
 *
 * `context` is bound into the ciphertext as additional authenticated data, so a
 * secret encrypted for one connection cannot be decrypted as another's — moving
 * ciphertext between records in the store file fails authentication.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error(`Encryption key must be ${KEY_BYTES} bytes`);
    this.key = key;
  }

  encrypt(plaintext: string, context: string): EncryptedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }

  /** Throws if the ciphertext was tampered with, or the key or context differ. */
  decrypt(secret: EncryptedSecret, context: string): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(secret.iv, 'base64'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** Parses a key given as 64 hex characters or base64 of 32 bytes. */
export function parseKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('JARVIS_SECRET_KEY must be 32 bytes, as 64 hex characters or base64');
  }
  return key;
}

/**
 * Resolves the encryption key: `JARVIS_SECRET_KEY` when set, otherwise a key
 * file in the data directory, generated on first use and readable only by the
 * current user (0600).
 */
export function loadOrCreateKey(dataDir: string, envKey?: string): Buffer {
  if (envKey) return parseKey(envKey);

  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, KEY_FILE);
  try {
    return parseKey(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const key = randomBytes(KEY_BYTES);
  // `wx` fails if another process created the file in the meantime.
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600, flag: 'wx' });
  return key;
}
