/**
 * The JARVIS workspaces (PROMPT.md §4). Each workspace is a top-level working area
 * reachable from the workspace bar, the sidebar and the command palette.
 */
export const WORKSPACES = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Database health, size and relationship summary.',
    shortcut: '1',
    requiresConnection: true,
  },
  {
    id: 'schema',
    label: 'Schema Explorer',
    description: 'Browse tables, views, columns, indexes and constraints.',
    shortcut: '2',
    requiresConnection: true,
  },
  {
    id: 'relationships',
    label: 'Relationship Designer',
    description: 'Interactive entity-relationship diagram.',
    shortcut: '3',
    requiresConnection: true,
  },
  {
    id: 'query',
    label: 'Query Builder',
    description: 'Build joins, filters and aggregations visually.',
    shortcut: '4',
    requiresConnection: true,
  },
  {
    id: 'data',
    label: 'Data Explorer',
    description: 'Browse, filter, edit and export table data.',
    shortcut: '5',
    requiresConnection: true,
  },
  {
    id: 'structure',
    label: 'Table Structure',
    description: 'Inspect and modify columns, keys and indexes.',
    shortcut: '6',
    requiresConnection: true,
  },
  {
    id: 'manage',
    label: 'Database Management',
    description: 'Create, rename and drop database objects.',
    shortcut: '7',
    requiresConnection: true,
  },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]['id'];
export type WorkspaceDefinition = (typeof WORKSPACES)[number];

export const WORKSPACE_IDS = WORKSPACES.map((w) => w.id) as readonly WorkspaceId[];

export function isWorkspaceId(value: string): value is WorkspaceId {
  return (WORKSPACE_IDS as readonly string[]).includes(value);
}

export function getWorkspace(id: WorkspaceId): WorkspaceDefinition {
  const workspace = WORKSPACES.find((w) => w.id === id);
  if (!workspace) throw new Error(`Unknown workspace: ${id}`);
  return workspace;
}
