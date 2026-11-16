import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { WORKSPACES } from '@jarvis/shared';
import { workspacePath } from '@/app/paths';
import { useUiStore } from '@/stores/ui-store';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Application-wide keyboard shortcuts:
 * - Mod+K         command palette
 * - Mod+B         toggle sidebar
 * - Alt+1 … Alt+7 switch workspace (Cmd/Ctrl+digit is reserved by browsers for tabs)
 * - Mod+,         settings
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const ui = useUiStore.getState();

      if (mod && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
        return;
      }
      if (mod && !event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        ui.toggleSidebar();
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        void navigate('/settings');
        return;
      }
      if (event.altKey && !mod && !isEditableTarget(event.target)) {
        // Use `code` — on macOS, Option+digit produces a symbol in `key`.
        const match = /^Digit([1-9])$/.exec(event.code);
        const workspace = match ? WORKSPACES.find((w) => w.shortcut === match[1]) : undefined;
        if (workspace) {
          event.preventDefault();
          void navigate(workspacePath(workspace.id));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
