import {
  Bookmark,
  ChevronRight,
  Database,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { SETTINGS_PATH } from '@/app/paths';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip } from '@/components/ui/tooltip';
import { ConnectionList } from '@/features/connections/connection-list';
import { ExplorerList } from '@/features/explorer/explorer-list';
import { cn, modKeyLabel } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useSystemStore } from '@/stores/system-store';
import { useUiStore, type SidebarSectionId } from '@/stores/ui-store';

interface SidebarSection {
  id: SidebarSectionId;
  label: string;
  icon: LucideIcon;
  render: () => ReactNode;
  /** Optional control shown at the right of the section header. */
  action?: () => ReactNode;
}

function NewConnectionButton() {
  const openDialog = useConnectionStore((s) => s.openDialog);
  return (
    <Tooltip content="New connection" side="right">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New connection"
        onClick={() => openDialog({ mode: 'create' })}
      >
        <Plus />
      </Button>
    </Tooltip>
  );
}

/**
 * Sidebar sections (PROMPT.md §4). A section whose feature is not built yet
 * shows an honest empty state, never fake data.
 */
const SECTIONS: readonly SidebarSection[] = [
  {
    id: 'connections',
    label: 'Connections',
    icon: Plug,
    render: () => <ConnectionList />,
    action: () => <NewConnectionButton />,
  },
  {
    id: 'explorer',
    label: 'Explorer',
    icon: Database,
    render: () => <ExplorerList />,
  },
  {
    id: 'saved',
    label: 'Saved queries',
    icon: Bookmark,
    render: () => (
      <EmptyState
        size="sm"
        icon={Bookmark}
        title="No saved queries"
        description="Queries you save from the Query Builder are kept here."
      />
    ),
  },
  {
    id: 'recent',
    label: 'Recent activity',
    icon: History,
    render: () => (
      <EmptyState
        size="sm"
        icon={History}
        title="No activity yet"
        description="Queries you run appear here with their status and duration."
      />
    ),
  },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <aside
      aria-label="Sidebar"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-12' : 'w-64',
      )}
    >
      {collapsed ? <CollapsedRail /> : <ExpandedSidebar />}
    </aside>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  const checking = useSystemStore((s) => s.apiStatus === 'checking');
  return (
    <NavLink
      to="/"
      aria-label="JARVIS home"
      className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <LogoMark active={checking} />
      {!compact && <Wordmark />}
    </NavLink>
  );
}

function ExpandedSidebar() {
  const sections = useUiStore((s) => s.sidebarSections);
  const toggleSection = useUiStore((s) => s.toggleSidebarSection);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border pr-2 pl-3">
        <Brand />
        <Tooltip content="Collapse sidebar" shortcut={[modKeyLabel, 'B']} side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse sidebar"
            onClick={toggleSidebar}
          >
            <PanelLeftClose />
          </Button>
        </Tooltip>
      </div>

      <nav aria-label="Sidebar sections" className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {SECTIONS.map((section) => {
          const open = sections[section.id];
          const panelId = `sidebar-section-${section.id}`;
          return (
            <section key={section.id} className="px-1.5">
              <div className="flex h-7 items-center gap-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleSection(section.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-2xs font-medium tracking-wide text-fg-subtle uppercase transition-colors hover:bg-surface-hover hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronRight
                    className={cn('size-3 transition-transform duration-150', open && 'rotate-90')}
                  />
                  {section.label}
                </button>
                {section.action?.()}
              </div>
              {open && (
                <div id={panelId} className="pb-1.5">
                  {section.render()}
                </div>
              )}
            </section>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-1.5">
        <NavLink
          to={SETTINGS_PATH}
          className={({ isActive }) =>
            cn(
              'flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive
                ? 'bg-surface-active text-fg'
                : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
            )
          }
        >
          <Settings className="size-4" />
          Settings
        </NavLink>
      </div>
    </>
  );
}

function CollapsedRail() {
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const sections = useUiStore((s) => s.sidebarSections);
  const toggleSection = useUiStore((s) => s.toggleSidebarSection);

  const openSection = (id: SidebarSectionId) => {
    if (!sections[id]) toggleSection(id);
    setCollapsed(false);
  };

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-center border-b border-border">
        <Brand compact />
      </div>
      <nav
        aria-label="Sidebar sections"
        className="flex min-h-0 flex-1 flex-col items-center gap-1 py-2"
      >
        <Tooltip content="Expand sidebar" shortcut={[modKeyLabel, 'B']} side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen />
          </Button>
        </Tooltip>
        <span aria-hidden className="my-1 h-px w-5 bg-border" />
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id} content={label} side="right">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              onClick={() => openSection(id)}
            >
              <Icon />
            </Button>
          </Tooltip>
        ))}
      </nav>
      <div className="flex shrink-0 justify-center border-t border-border py-2">
        <Tooltip content="Settings" shortcut={[modKeyLabel, ',']} side="right">
          <Button variant="ghost" size="icon-sm" asChild>
            <NavLink to={SETTINGS_PATH} aria-label="Settings">
              <Settings />
            </NavLink>
          </Button>
        </Tooltip>
      </div>
    </>
  );
}
