import { WORKSPACES } from '@jarvis/shared';
import {
  Monitor,
  Moon,
  PanelLeft,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Unplug,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { SETTINGS_PATH, workspacePath } from '@/app/paths';
import { WORKSPACE_ICONS } from '@/app/workspace-icons';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { healthMonitor } from '@/lib/health-monitor';
import { altKeyLabel, modKeyLabel } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useUiStore } from '@/stores/ui-store';

/** Global command palette (Mod+K): navigation and application commands. */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const profiles = useConnectionStore((s) => s.profiles);
  const activeId = useConnectionStore((s) => s.activeId);
  const connect = useConnectionStore((s) => s.connect);
  const activate = useConnectionStore((s) => s.activate);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const openDialog = useConnectionStore((s) => s.openDialog);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="top-[14%] max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a workspace or command.
        </DialogDescription>
        <Command loop>
          <CommandInput placeholder="Search workspaces and commands…" />
          <CommandList>
            <CommandEmpty>No matching commands.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {WORKSPACES.map((workspace) => {
                const Icon = WORKSPACE_ICONS[workspace.id];
                return (
                  <CommandItem
                    key={workspace.id}
                    value={`${workspace.label} ${workspace.description}`}
                    onSelect={run(() => void navigate(workspacePath(workspace.id)))}
                  >
                    <Icon />
                    <span>{workspace.label}</span>
                    <span className="truncate text-xs text-fg-subtle">{workspace.description}</span>
                    <Shortcut keys={[altKeyLabel, workspace.shortcut]} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandGroup heading="Connections">
              <CommandItem
                value="New connection add MySQL server"
                onSelect={run(() => openDialog({ mode: 'create' }))}
              >
                <Plus /> New connection…
              </CommandItem>
              {profiles
                .filter((profile) => profile.id !== activeId)
                .map((profile) => (
                  <CommandItem
                    key={profile.id}
                    value={`${profile.connected ? 'Switch to' : 'Connect to'} ${profile.name} ${profile.host}`}
                    onSelect={run(
                      () => void (profile.connected ? activate(profile.id) : connect(profile.id)),
                    )}
                  >
                    <Plug /> {profile.connected ? 'Switch to' : 'Connect to'} {profile.name}
                    <span className="truncate font-mono text-xs text-fg-subtle">
                      {profile.host}:{profile.port}
                    </span>
                  </CommandItem>
                ))}
              {activeId && (
                <CommandItem
                  value="Disconnect active connection"
                  onSelect={run(() => void disconnect(activeId))}
                >
                  <Unplug /> Disconnect
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup heading="Appearance">
              <CommandItem value="Theme: Dark" onSelect={run(() => setTheme('dark'))}>
                <Moon /> Theme: Dark
              </CommandItem>
              <CommandItem value="Theme: Light" onSelect={run(() => setTheme('light'))}>
                <Sun /> Theme: Light
              </CommandItem>
              <CommandItem value="Theme: System" onSelect={run(() => setTheme('system'))}>
                <Monitor /> Theme: Match system
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Application">
              <CommandItem value="Toggle sidebar" onSelect={run(toggleSidebar)}>
                <PanelLeft /> Toggle sidebar
                <Shortcut keys={[modKeyLabel, 'B']} />
              </CommandItem>
              <CommandItem
                value="Open settings preferences"
                onSelect={run(() => void navigate(SETTINGS_PATH))}
              >
                <Settings /> Open settings
                <Shortcut keys={[modKeyLabel, ',']} />
              </CommandItem>
              <CommandItem
                value="Check server status health"
                onSelect={run(() => void healthMonitor.check())}
              >
                <RefreshCw /> Check server status
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Shortcut({ keys }: { keys: string[] }) {
  return (
    <span className="ml-auto flex shrink-0 gap-0.5 pl-3">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
