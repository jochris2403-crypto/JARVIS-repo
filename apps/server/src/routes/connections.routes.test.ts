import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connectionProfileSchema,
  databaseSchemaSchema,
  type ConnectionCreateInput,
  type DatabaseSchema,
} from '@jarvis/shared';
import { createTestApp, testMysql, type TestApp } from '../test/test-app.js';

const SECRET = 'correct horse battery staple';

function input(overrides: Partial<ConnectionCreateInput> = {}): ConnectionCreateInput {
  return {
    name: 'Local',
    host: '127.0.0.1',
    port: 3306,
    user: 'app',
    password: SECRET,
    ssl: { enabled: false, rejectUnauthorized: true },
    connectTimeoutMs: 5000,
    readOnly: false,
    ...overrides,
  };
}

let ctx: TestApp;
beforeEach(() => {
  ctx = createTestApp();
});
afterEach(() => ctx.cleanup());

describe('connection profiles', () => {
  it('creates, lists, updates and deletes a connection', async () => {
    const created = await request(ctx.app).post('/api/connections').send(input()).expect(201);
    const profile = connectionProfileSchema.parse(created.body);
    expect(profile).toMatchObject({ name: 'Local', hasPassword: true, connected: false });

    const list = await request(ctx.app).get('/api/connections').expect(200);
    expect(list.body.connections).toHaveLength(1);

    const { password: _password, ...withoutPassword } = input({ name: 'Renamed', readOnly: true });
    const updated = await request(ctx.app)
      .put(`/api/connections/${profile.id}`)
      .send(withoutPassword)
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Renamed', readOnly: true, hasPassword: true });

    await request(ctx.app).delete(`/api/connections/${profile.id}`).expect(200, { deleted: true });
    const after = await request(ctx.app).get('/api/connections');
    expect(after.body.connections).toEqual([]);
  });

  it('never returns the password and never stores it in plain text', async () => {
    const created = await request(ctx.app).post('/api/connections').send(input()).expect(201);
    const list = await request(ctx.app).get('/api/connections');
    expect(JSON.stringify(created.body)).not.toContain(SECRET);
    expect(JSON.stringify(list.body)).not.toContain(SECRET);
    expect(created.body).not.toHaveProperty('password');
    expect(created.body).not.toHaveProperty('secret');

    const file = path.join(ctx.dataDir, 'connections.json');
    expect(fs.readFileSync(file, 'utf8')).not.toContain(SECRET);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('keeps the stored password when an update omits it, and clears it when blank', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(input());
    const { password: _password, ...rest } = input();
    const kept = await request(ctx.app).put(`/api/connections/${profile.id}`).send(rest);
    expect(kept.body.hasPassword).toBe(true);
    const cleared = await request(ctx.app)
      .put(`/api/connections/${profile.id}`)
      .send({ ...rest, password: '' });
    expect(cleared.body.hasPassword).toBe(false);
  });

  it('rejects invalid input with field-level issues and without echoing values', async () => {
    const res = await request(ctx.app)
      .post('/api/connections')
      .send(input({ host: '', port: 70000 }))
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['host', 'port']));
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('rejects duplicate names', async () => {
    await request(ctx.app).post('/api/connections').send(input()).expect(201);
    const res = await request(ctx.app)
      .post('/api/connections')
      .send(input({ name: 'local' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for unknown ids and 422 for malformed ids', async () => {
    await request(ctx.app)
      .post('/api/connections/7b0c6a52-3a0b-4c58-9d0e-6f6f3c1f2a11/connect')
      .expect(404);
    await request(ctx.app).post('/api/connections/not-a-uuid/connect').expect(422);
  });

  it('refuses schema requests on a connection that is not open', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(input());
    const res = await request(ctx.app).get(`/api/connections/${profile.id}/databases`).expect(409);
    expect(res.body.error.code).toBe('NOT_CONNECTED');
  });

  it('explains an unreachable server', async () => {
    // Port 1 on loopback is closed, so this fails fast without touching a network.
    const res = await request(ctx.app)
      .post('/api/connections/test')
      .send(input({ port: 1 }))
      .expect(502);
    expect(res.body.error.code).toBe('DB_CONNECTION_FAILED');
    expect(res.body.error.message).toMatch(/Connection refused at 127\.0\.0\.1:1/);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });
});

const mysql = testMysql();

describe.skipIf(!mysql)('with a live MySQL server', () => {
  const live = () =>
    input({
      name: 'Dev',
      host: mysql!.host,
      port: mysql!.port,
      user: mysql!.user,
      password: mysql!.password,
    });

  it('tests unsaved settings', async () => {
    const res = await request(ctx.app).post('/api/connections/test').send(live()).expect(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body.serverVersion).toMatch(/^\d+\.\d+/);
    expect(res.body.authenticatedAs).toContain(mysql!.user);
  });

  it('reports wrong credentials clearly', async () => {
    const res = await request(ctx.app)
      .post('/api/connections/test')
      .send({ ...live(), password: 'definitely-wrong' })
      .expect(502);
    expect(res.body.error.message).toMatch(/Access denied/);
    expect(res.body.error.details.mysqlCode).toBe('ER_ACCESS_DENIED_ERROR');
  });

  it('tests a saved connection with its stored password', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
    const { password: _password, ...rest } = live();
    await request(ctx.app)
      .post('/api/connections/test')
      .send({ ...rest, id: profile.id })
      .expect(200);
  });

  it('connects, lists databases, and disconnects', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
    const connected = await request(ctx.app)
      .post(`/api/connections/${profile.id}/connect`)
      .expect(200);
    expect(connected.body).toMatchObject({ connected: true });
    expect(connected.body.serverVersion).toMatch(/^\d+\.\d+/);
    expect(connected.body.lastConnectedAt).not.toBeNull();

    const dbs = await request(ctx.app).get(`/api/connections/${profile.id}/databases`).expect(200);
    const names = dbs.body.databases.map((d: { name: string }) => d.name);
    expect(names).toContain(mysql!.database);
    expect(
      dbs.body.databases.find((d: { name: string }) => d.name === 'information_schema'),
    ).toMatchObject({
      system: true,
    });

    const off = await request(ctx.app)
      .post(`/api/connections/${profile.id}/disconnect`)
      .expect(200);
    expect(off.body.connected).toBe(false);
    await request(ctx.app).get(`/api/connections/${profile.id}/databases`).expect(409);
  });

  it('closes the session when connection settings change', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
    await request(ctx.app).post(`/api/connections/${profile.id}/connect`).expect(200);
    const { password: _password, ...rest } = live();

    const renamed = await request(ctx.app)
      .put(`/api/connections/${profile.id}`)
      .send({ ...rest, name: 'Dev 2' });
    expect(renamed.body.connected).toBe(true);

    const changed = await request(ctx.app)
      .put(`/api/connections/${profile.id}`)
      .send({ ...rest, name: 'Dev 2', connectTimeoutMs: 7000 });
    expect(changed.body.connected).toBe(false);
  });

  describe('schema introspection', () => {
    let schema: DatabaseSchema;
    const tableNamed = (name: string) => {
      const found = schema.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!found) throw new Error(`table ${name} missing`);
      return found;
    };

    beforeEach(async () => {
      const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
      await request(ctx.app).post(`/api/connections/${profile.id}/connect`).expect(200);
      const res = await request(ctx.app)
        .get(`/api/connections/${profile.id}/databases/${mysql!.database}/schema`)
        .expect(200);
      schema = databaseSchemaSchema.parse(res.body);
    });

    it('reads tables and views', () => {
      expect(schema.tables.filter((t) => t.type === 'table')).toHaveLength(10);
      expect(tableNamed('ActiveContacts')).toMatchObject({ type: 'view', rowEstimate: null });
      expect(tableNamed('ContactDetails')).toMatchObject({ engine: 'InnoDB', comment: 'People' });
    });

    it('reads columns with types, nullability, defaults and flags', () => {
      const contact = tableNamed('ContactDetails');
      expect(contact.columns.map((c) => c.name)).toEqual([
        'contact_id',
        'first_name',
        'last_name',
        'email',
        'status',
        'created_at',
      ]);
      expect(contact.columns[0]).toMatchObject({
        columnType: 'int unsigned',
        nullable: false,
        isPrimaryKey: true,
        autoIncrement: true,
      });
      expect(contact.columns[4]).toMatchObject({ dataType: 'enum', defaultValue: 'ACTIVE' });
      expect(tableNamed('ContactProfiles').columns[1]).toMatchObject({
        name: 'bio',
        nullable: true,
      });
      const lineTotal = tableNamed('OrderItems').columns.find((c) => c.name === 'line_total');
      expect(lineTotal).toMatchObject({ generated: true, numericPrecision: 12, numericScale: 2 });
    });

    it('reads primary keys in key order, including composite keys', () => {
      expect(tableNamed('ContactDetails').primaryKey).toEqual(['contact_id']);
      expect(tableNamed('Orders').primaryKey).toEqual(['order_id', 'region_code']);
      expect(tableNamed('ContactTags').primaryKey).toEqual(['contact_id', 'tag_id']);
    });

    it('reads indexes', () => {
      const indexes = tableNamed('ContactDetails').indexes;
      expect(indexes.find((i) => i.name === 'uq_contact_email')).toMatchObject({
        unique: true,
        primary: false,
      });
      expect(indexes.find((i) => i.name === 'idx_contact_name')).toMatchObject({
        unique: false,
        columns: [
          { name: 'last_name', subPart: null },
          { name: 'first_name', subPart: null },
        ],
      });
    });

    it('reads foreign keys, including composite ones and their rules', () => {
      expect(tableNamed('ContactPhones').foreignKeys).toEqual([
        expect.objectContaining({
          name: 'fk_phone_contact',
          columns: ['contact_id'],
          referencedColumns: ['contact_id'],
          onDelete: 'CASCADE',
        }),
      ]);
      expect(tableNamed('OrderItems').foreignKeys[0]).toMatchObject({
        columns: ['order_id', 'region_code'],
        referencedColumns: ['order_id', 'region_code'],
        onUpdate: 'CASCADE',
      });
      expect(tableNamed('Orders').foreignKeys[0]).toMatchObject({ onDelete: 'SET NULL' });
      expect(tableNamed('AuditLog').foreignKeys).toEqual([]);
    });

    it('derives relationships with cardinality from real constraints only', () => {
      expect(schema.relationships).toHaveLength(7);
      expect(schema.relationships.every((r) => r.source === 'foreign-key')).toBe(true);
      const byConstraint = (name: string) =>
        schema.relationships.find((r) => r.constraintName === name);
      expect(byConstraint('fk_phone_contact')).toMatchObject({ cardinality: 'many-to-one' });
      expect(byConstraint('fk_profile_contact')).toMatchObject({ cardinality: 'one-to-one' });
      // Part of a composite primary key is not unique by itself.
      expect(byConstraint('fk_ct_contact')).toMatchObject({ cardinality: 'many-to-one' });
    });

    it('reads routines and triggers', () => {
      expect(schema.routines).toEqual([{ name: 'full_name', type: 'function' }]);
      expect(schema.triggers).toEqual([
        expect.objectContaining({ name: 'trg_contact_audit', timing: 'AFTER', event: 'INSERT' }),
      ]);
    });
  });

  it('returns 404 for a database that does not exist', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
    await request(ctx.app).post(`/api/connections/${profile.id}/connect`).expect(200);
    await request(ctx.app)
      .get(`/api/connections/${profile.id}/databases/jarvis_no_such_db/schema`)
      .expect(404);
  });

  it('treats a hostile database name as data, not SQL', async () => {
    const { body: profile } = await request(ctx.app).post('/api/connections').send(live());
    await request(ctx.app).post(`/api/connections/${profile.id}/connect`).expect(200);
    const hostile = encodeURIComponent("x' OR '1'='1");
    await request(ctx.app)
      .get(`/api/connections/${profile.id}/databases/${hostile}/schema`)
      .expect(404);
  });
});
