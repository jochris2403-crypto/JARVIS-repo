import {
  Command,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { SETTINGS_PATH } from '@/app/paths';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { modKeyLabel } from '@/lib/utils';
import { UI_SCALES, useUiStore, type ThemePreference, type UiScale } from '@/stores/ui-store';
import { ConnectionSwitcher, DatabaseSwitcher } from '@/features/connections/connection-switcher';
import { NotificationCenter } from './notification-center';

export function TopBar() {
  const openPalette = useUiStore((s) => s.setCommandPaletteOpen);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <ConnectionContext />

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="Search and commands"
          className="flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-fg-subtle shadow-raised transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate">Search or run a command…</span>
          <span className="ml-auto flex shrink-0 gap-0.5">
            <Kbd>{modKeyLabel}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <NotificationCenter />
        <SettingsMenu />
      </div>
    </header>
  );
}

function ConnectionContext() {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <ConnectionSwitcher />
      <DatabaseSwitcher />
    </div>
  );
}

function SettingsMenu() {
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const uiScale = useUiStore((s) => s.uiScale);
  const setUiScale = useUiStore((s) => s.setUiScale);
  const openPalette = useUiStore((s) => s.setCommandPaletteOpen);

  return (
    <DropdownMenu>
      <Tooltip content="Application settings">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Application settings">
            <SlidersHorizontal />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Interface scale</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(uiScale)}
          onValueChange={(value) => setUiScale(Number(value) as UiScale)}
        >
          {UI_SCALES.map((scale) => (
            <DropdownMenuRadioItem key={scale} value={String(scale)}>
              {Math.round(scale * 100)}%
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openPalette(true)}>
          <Command /> Command palette
          <DropdownMenuShortcut>{modKeyLabel} K</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleSidebar}>
          <PanelLeft /> Toggle sidebar
          <DropdownMenuShortcut>{modKeyLabel} B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate(SETTINGS_PATH)}>
          <Settings /> Settings
          <DropdownMenuShortcut>{modKeyLabel} ,</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
