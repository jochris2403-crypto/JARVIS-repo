import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ConnectionCreateInput, ConnectionUpdateInput, SslConfig } from '@jarvis/shared';
import { AppError } from '../errors/app-error.js';
import type { EncryptedSecret, SecretBox } from '../security/secret-box.js';

const FILE_NAME = 'connections.json';
const FILE_VERSION = 1;

/** A saved connection without its password. */
export interface StoredConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  database?: string;
  ssl: SslConfig;
  connectTimeoutMs: number;
  readOnly: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
}

interface ConnectionRecord extends Omit<StoredConnection, 'hasPassword'> {
  /** Encrypted password; absent when the account has no password. */
  secret?: EncryptedSecret;
}

interface StoreFile {
  version: number;
  connections: ConnectionRecord[];
}

/**
 * Persists connection profiles to `<dataDir>/connections.json`.
 *
 * Passwords are encrypted with the SecretBox before they touch disk and are
 * only ever returned by `getPassword`, which the connection manager calls.
 * The file is written atomically with 0600 permissions.
 */
export class ConnectionStore {
  private readonly file: string;
  private records: ConnectionRecord[] | undefined;

  constructor(
    private readonly dataDir: string,
    private readonly secretBox: SecretBox,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(dataDir, FILE_NAME);
  }

  list(): StoredConnection[] {
    return this.load().map(toStored);
  }

  get(id: string): StoredConnection {
    return toStored(this.find(id));
  }

  create(input: ConnectionCreateInput): StoredConnection {
    this.assertNameAvailable(input.name);
    const id = randomUUID();
    const timestamp = this.now().toISOString();
    const { password, ...settings } = input;
    const record: ConnectionRecord = {
      id,
      ...settings,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastConnectedAt: null,
      ...(password ? { secret: this.secretBox.encrypt(password, id) } : {}),
    };
    this.save([...this.load(), record]);
    return toStored(record);
  }

  update(id: string, input: ConnectionUpdateInput): StoredConnection {
    const existing = this.find(id);
    this.assertNameAvailable(input.name, id);
    const { password, ...settings } = input;

    // Rebuild rather than spread `existing`, so cleared optional fields (database) are dropped.
    const record: ConnectionRecord = {
      id,
      ...settings,
      createdAt: existing.createdAt,
      updatedAt: this.now().toISOString(),
      lastConnectedAt: existing.lastConnectedAt,
    };
    // undefined → keep the stored password; '' → remove it; otherwise replace.
    if (password === undefined) {
      if (existing.secret) record.secret = existing.secret;
    } else if (password !== '') {
      record.secret = this.secretBox.encrypt(password, id);
    }

    this.save(this.load().map((r) => (r.id === id ? record : r)));
    return toStored(record);
  }

  delete(id: string): void {
    this.find(id);
    this.save(this.load().filter((r) => r.id !== id));
  }

  /** Decrypts and returns the password. Never expose the result outside the server. */
  getPassword(id: string): string {
    const record = this.find(id);
    if (!record.secret) return '';
    try {
      return this.secretBox.decrypt(record.secret, id);
    } catch (cause) {
      throw new AppError(
        'INTERNAL_ERROR',
        'The saved password for this connection could not be decrypted. The encryption key may have changed — edit the connection and enter the password again.',
        { cause },
      );
    }
  }

  markConnected(id: string): StoredConnection {
    const record = { ...this.find(id), lastConnectedAt: this.now().toISOString() };
    this.save(this.load().map((r) => (r.id === id ? record : r)));
    return toStored(record);
  }

  private find(id: string): ConnectionRecord {
    const record = this.load().find((r) => r.id === id);
    if (!record) throw AppError.notFound('Connection not found');
    return record;
  }

  private assertNameAvailable(name: string, exceptId?: string): void {
    const wanted = name.trim().toLowerCase();
    const clash = this.load().some((r) => r.id !== exceptId && r.name.toLowerCase() === wanted);
    if (clash) throw new AppError('CONFLICT', `A connection named "${name}" already exists`);
  }

  private load(): ConnectionRecord[] {
    if (this.records) return this.records;
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return (this.records = []);
      throw error;
    }
    const parsed = JSON.parse(raw) as StoreFile;
    if (parsed.version !== FILE_VERSION || !Array.isArray(parsed.connections)) {
      throw new Error(`Unsupported connections file format in ${this.file}`);
    }
    return (this.records = parsed.connections);
  }

  private save(records: ConnectionRecord[]): void {
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    const body: StoreFile = { version: FILE_VERSION, connections: records };
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.records = records;
  }
}

function toStored({ secret, ...rest }: ConnectionRecord): StoredConnection {
  return { ...rest, hasPassword: secret !== undefined };
}
