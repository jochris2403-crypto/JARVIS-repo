import { describe, expect, it } from 'vitest';
import { WORKSPACES, WORKSPACE_IDS, getWorkspace, isWorkspaceId } from './workspaces.js';

describe('workspaces', () => {
  it('has unique ids and shortcuts', () => {
    expect(new Set(WORKSPACE_IDS).size).toBe(WORKSPACES.length);
    expect(new Set(WORKSPACES.map((w) => w.shortcut)).size).toBe(WORKSPACES.length);
  });

  it('narrows workspace ids', () => {
    expect(isWorkspaceId('query')).toBe(true);
    expect(isWorkspaceId('nope')).toBe(false);
  });

  it('looks up a workspace definition', () => {
    expect(getWorkspace('relationships').label).toBe('Relationship Designer');
  });
});
