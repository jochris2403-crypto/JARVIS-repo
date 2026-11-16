import type { WorkspaceId } from '@jarvis/shared';
import {
  Blocks,
  Gauge,
  ListTree,
  Network,
  ServerCog,
  Table2,
  TableProperties,
  type LucideIcon,
} from 'lucide-react';

export const WORKSPACE_ICONS: Record<WorkspaceId, LucideIcon> = {
  overview: Gauge,
  schema: ListTree,
  relationships: Network,
  query: Blocks,
  data: Table2,
  structure: TableProperties,
  manage: ServerCog,
};
