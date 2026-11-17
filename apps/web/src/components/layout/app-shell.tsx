import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useHealthMonitor } from '@/hooks/use-health-monitor';
import { ConnectionDialog } from '@/features/connections/connection-dialog';
import { useConnectionStore } from '@/stores/connection-store';
import { useSystemStore } from '@/stores/system-store';
import { useUiStore } from '@/stores/ui-store';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { StatusBar } from './status-bar';
import { TopBar } from './top-bar';
import { WorkspaceTabs } from './workspace-tabs';

const NARROW_QUERY = '(max-width: 860px)';

/** Collapses the sidebar when the window becomes narrow; desktop is the primary target. */
function useAutoCollapseSidebar() {
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const apply = () => {
      if (mql.matches) useUiStore.getState().setSidebarCollapsed(true);
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
}

/**
 * Loads saved connections whenever the API becomes reachable — at startup and
 * again after an outage, since a restarted server no longer holds open sessions.
 */
function useSyncConnections() {
  const online = useSystemStore((s) => s.apiStatus === 'online');
  useEffect(() => {
    if (online) void useConnectionStore.getState().loadProfiles();
  }, [online]);
}

/** The application frame: sidebar, top bar, workspace tabs, routed content, status bar. */
export function AppShell() {
  useHealthMonitor();
  useGlobalShortcuts();
  useAutoCollapseSidebar();
  useSyncConnections();

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={150}>
      {/* Fixed to the viewport so nothing (focus, scroll-into-view) can ever shift the frame. */}
      <div className="fixed inset-0 flex overflow-hidden bg-bg text-fg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <WorkspaceTabs />
          <main className="min-h-0 flex-1 overflow-auto bg-grid">
            <Outlet />
          </main>
          <StatusBar />
        </div>
      </div>
      <CommandPalette />
      <ConnectionDialog />
      <Toaster />
    </TooltipProvider>
  );
}
