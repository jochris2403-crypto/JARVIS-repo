import { WORKSPACES } from '@jarvis/shared';
import { NavLink } from 'react-router';
import { workspacePath } from '@/app/paths';
import { WORKSPACE_ICONS } from '@/app/workspace-icons';
import { Tooltip } from '@/components/ui/tooltip';
import { altKeyLabel, cn } from '@/lib/utils';

/** The workspace switcher shown above the main working area. */
export function WorkspaceTabs() {
  return (
    <nav
      aria-label="Workspaces"
      className="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border bg-surface px-2 [scrollbar-width:none]"
    >
      {WORKSPACES.map((workspace) => {
        const Icon = WORKSPACE_ICONS[workspace.id];
        return (
          <Tooltip
            key={workspace.id}
            content={workspace.description}
            shortcut={[altKeyLabel, workspace.shortcut]}
          >
            <NavLink
              to={workspacePath(workspace.id)}
              // Static classes keyed on aria-current: the tooltip's Slot merges className as a
              // string, so NavLink's function form cannot be used here.
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-transparent after:transition-colors',
                'aria-[current=page]:text-fg aria-[current=page]:after:bg-accent aria-[current=page]:[&_svg]:text-accent',
              )}
            >
              <Icon className="size-3.5" />
              {workspace.label}
            </NavLink>
          </Tooltip>
        );
      })}
    </nav>
  );
}
