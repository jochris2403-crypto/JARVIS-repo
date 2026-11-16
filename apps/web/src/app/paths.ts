import type { WorkspaceId } from '@jarvis/shared';

export const SETTINGS_PATH = '/settings';
export const DEFAULT_WORKSPACE: WorkspaceId = 'overview';

export function workspacePath(id: WorkspaceId): string {
  return `/${id}`;
}
