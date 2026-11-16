import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOrCreateKey, parseKey, SecretBox } from './secret-box.js';

const dirs: string[] = [];
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-key-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('SecretBox', () => {
  const box = new SecretBox(randomBytes(32));

  it('round-trips a secret', () => {
    const secret = box.encrypt('p@ss wörd ✓', 'conn-1');
    expect(secret.data).not.toContain('p@ss');
    expect(box.decrypt(secret, 'conn-1')).toBe('p@ss wörd ✓');
  });

  it('uses a fresh IV for every encryption', () => {
    expect(box.encrypt('same', 'c').data).not.toBe(box.encrypt('same', 'c').data);
  });

  it('rejects a different context, key or tampered ciphertext', () => {
    const secret = box.encrypt('hunter2', 'conn-1');
    expect(() => box.decrypt(secret, 'conn-2')).toThrow();
    expect(() => new SecretBox(randomBytes(32)).decrypt(secret, 'conn-1')).toThrow();
    const tampered = { ...secret, data: Buffer.from('AAAAAAA').toString('base64') };
    expect(() => box.decrypt(tampered, 'conn-1')).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(() => new SecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });
});

describe('key loading', () => {
  it('parses hex and base64 keys and rejects wrong sizes', () => {
    const key = randomBytes(32);
    expect(parseKey(key.toString('hex'))).toEqual(key);
    expect(parseKey(key.toString('base64'))).toEqual(key);
    expect(() => parseKey('too-short')).toThrow(/32 bytes/);
  });

  it('generates a private key file once and reuses it', () => {
    const dir = tmpDir();
    const first = loadOrCreateKey(dir);
    const file = path.join(dir, 'secret.key');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(loadOrCreateKey(dir)).toEqual(first);
  });

  it('prefers the environment key', () => {
    const dir = tmpDir();
    const key = randomBytes(32);
    expect(loadOrCreateKey(dir, key.toString('hex'))).toEqual(key);
    expect(fs.existsSync(path.join(dir, 'secret.key'))).toBe(false);
  });
});
