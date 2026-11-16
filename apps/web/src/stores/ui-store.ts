import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light' | 'system';
/** Interface scale options. 1 is the original design size; the default is much denser. */
export const UI_SCALES = [0.6, 0.7, 0.85, 1] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const DEFAULT_UI_SCALE: UiScale = 0.7;

export type SidebarSectionId = 'connections' | 'explorer' | 'saved' | 'recent';

interface UiState {
  theme: ThemePreference;
  reducedMotion: boolean;
  /** Multiplier applied to every size in the interface. */
  uiScale: UiScale;
  sidebarCollapsed: boolean;
  /** Expanded state of each collapsible sidebar section. */
  sidebarSections: Record<SidebarSectionId, boolean>;
  /** Transient — not persisted. */
  commandPaletteOpen: boolean;

  setTheme: (theme: ThemePreference) => void;
  setReducedMotion: (value: boolean) => void;
  setUiScale: (scale: UiScale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebarSection: (id: SidebarSectionId) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const DEFAULT_SIDEBAR_SECTIONS: Record<SidebarSectionId, boolean> = {
  connections: true,
  explorer: true,
  saved: false,
  recent: false,
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      reducedMotion: false,
      uiScale: DEFAULT_UI_SCALE,
      sidebarCollapsed: false,
      sidebarSections: DEFAULT_SIDEBAR_SECTIONS,
      commandPaletteOpen: false,

      setTheme: (theme) => set({ theme }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setUiScale: (uiScale) => set({ uiScale }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarSection: (id) =>
        set((s) => ({ sidebarSections: { ...s.sidebarSections, [id]: !s.sidebarSections[id] } })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: 'jarvis.ui',
      version: 2,
      // v2 made the interface denser: saved scales from v1 are replaced by the new default.
      migrate: (persisted, version) => {
        const state = persisted as Partial<UiState>;
        return version < 2 ? { ...state, uiScale: DEFAULT_UI_SCALE } : state;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, reducedMotion, uiScale, sidebarCollapsed, sidebarSections }) => ({
        theme,
        reducedMotion,
        uiScale,
        sidebarCollapsed,
        sidebarSections,
      }),
    },
  ),
);
