import {
  connectionDeleteResponseSchema,
  connectionListResponseSchema,
  connectionProfileSchema,
  connectionTestResultSchema,
  databaseListResponseSchema,
  databaseSchemaSchema,
  type ConnectionCreateInput,
  type ConnectionProfile,
  type ConnectionTestInput,
  type ConnectionTestResult,
  type ConnectionUpdateInput,
  type DatabaseInfo,
  type DatabaseSchema,
} from '@jarvis/shared';
import { apiRequest } from './client';

/** Connecting can legitimately take as long as the connection's own timeout (max 120s). */
const CONNECT_REQUEST_TIMEOUT_MS = 130_000;

export async function listConnections(): Promise<ConnectionProfile[]> {
  const { connections } = await apiRequest('/connections', {
    schema: connectionListResponseSchema,
  });
  return connections;
}

export function createConnection(input: ConnectionCreateInput): Promise<ConnectionProfile> {
  return apiRequest('/connections', {
    method: 'POST',
    body: input,
    schema: connectionProfileSchema,
  });
}

export function updateConnection(
  id: string,
  input: ConnectionUpdateInput,
): Promise<ConnectionProfile> {
  return apiRequest(`/connections/${id}`, {
    method: 'PUT',
    body: input,
    schema: connectionProfileSchema,
  });
}

export async function deleteConnection(id: string): Promise<void> {
  await apiRequest(`/connections/${id}`, {
    method: 'DELETE',
    schema: connectionDeleteResponseSchema,
  });
}

export function testConnection(
  input: ConnectionTestInput,
  signal?: AbortSignal,
): Promise<ConnectionTestResult> {
  return apiRequest('/connections/test', {
    method: 'POST',
    body: input,
    schema: connectionTestResultSchema,
    timeoutMs: CONNECT_REQUEST_TIMEOUT_MS,
    signal,
  });
}

export function openConnection(id: string): Promise<ConnectionProfile> {
  return apiRequest(`/connections/${id}/connect`, {
    method: 'POST',
    schema: connectionProfileSchema,
    timeoutMs: CONNECT_REQUEST_TIMEOUT_MS,
  });
}

export function closeConnection(id: string): Promise<ConnectionProfile> {
  return apiRequest(`/connections/${id}/disconnect`, {
    method: 'POST',
    schema: connectionProfileSchema,
  });
}

export async function listDatabases(id: string): Promise<DatabaseInfo[]> {
  const { databases } = await apiRequest(`/connections/${id}/databases`, {
    schema: databaseListResponseSchema,
  });
  return databases;
}

export function fetchSchema(id: string, database: string): Promise<DatabaseSchema> {
  return apiRequest(`/connections/${id}/databases/${encodeURIComponent(database)}/schema`, {
    schema: databaseSchemaSchema,
    timeoutMs: 60_000,
  });
}
