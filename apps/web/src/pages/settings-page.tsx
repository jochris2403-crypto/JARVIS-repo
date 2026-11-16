import { APP_NAME, APP_TAGLINE, WORKSPACES } from '@jarvis/shared';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { Kbd } from '@/components/ui/kbd';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { SystemStatusPanel } from '@/features/system/system-status-panel';
import { altKeyLabel, modKeyLabel } from '@/lib/utils';
import { UI_SCALES, useUiStore, type ThemePreference, type UiScale } from '@/stores/ui-store';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies readonly { value: ThemePreference; label: string; icon: typeof Moon }[];

const SCALE_OPTIONS = UI_SCALES.map((scale) => ({
  value: String(scale),
  label: `${Math.round(scale * 100)}%`,
}));

const SHORTCUTS: readonly { label: string; keys: string[] }[] = [
  { label: 'Open command palette', keys: [modKeyLabel, 'K'] },
  { label: 'Toggle sidebar', keys: [modKeyLabel, 'B'] },
  { label: 'Open settings', keys: [modKeyLabel, ','] },
  ...WORKSPACES.map((w) => ({ label: `Go to ${w.label}`, keys: [altKeyLabel, w.shortcut] })),
];

export function SettingsPage() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const uiScale = useUiStore((s) => s.uiScale);
  const setUiScale = useUiStore((s) => s.setUiScale);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-base font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-xs text-fg-muted">Preferences are stored in this browser.</p>
      </header>

      <SettingsGroup title="Appearance">
        <SettingRow
          label="Theme"
          description="JARVIS is designed dark-first. System follows your OS setting."
        >
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onChange={setTheme}
            options={THEME_OPTIONS}
          />
        </SettingRow>
        <SettingRow
          label="Interface scale"
          description="Size of text, controls and spacing across the whole app."
        >
          <SegmentedControl
            aria-label="Interface scale"
            value={String(uiScale)}
            onChange={(value) => setUiScale(Number(value) as UiScale)}
            options={SCALE_OPTIONS}
          />
        </SettingRow>
        <SettingRow
          label="Reduce motion"
          description="Disable interface animations and transitions."
          htmlFor="reduce-motion"
        >
          <Switch id="reduce-motion" checked={reducedMotion} onCheckedChange={setReducedMotion} />
        </SettingRow>
      </SettingsGroup>

      <SystemStatusPanel />

      <SettingsGroup title="Keyboard shortcuts">
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {SHORTCUTS.map(({ label, keys }) => (
            <li key={label} className="flex h-8 items-center justify-between text-xs text-fg-muted">
              {label}
              <span className="flex gap-0.5">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SettingsGroup>

      <footer className="flex items-center gap-3 border-t border-border pt-4 text-xs text-fg-subtle">
        <LogoMark className="size-5" />
        <span>
          <span className="font-medium text-fg-muted">{APP_NAME}</span> — {APP_TAGLINE}
        </span>
      </footer>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-raised">
      <h2 className="flex h-10 items-center border-b border-border px-4 text-xs font-semibold">
        {title}
      </h2>
      <div className="divide-y divide-border px-4 py-1">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
        <p className="text-xs text-fg-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
