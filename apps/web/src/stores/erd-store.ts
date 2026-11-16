import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DetailLevel, Highlight, HighlightMode, Role } from '@/features/erd/graph';
import type { Point } from '@/features/erd/layout';

interface ErdState {
  // ── Preferences (persisted) ──
  /** Null follows the size-based default. */
  detail: DetailLevel | null;
  showInferred: boolean;
  mergeJunctions: boolean;
  highlightMode: HighlightMode;
  /** Table positions the user arranged, per `connectionId:database`. */
  layouts: Record<string, Record<string, Point>>;

  // ── Session state ──
  /** Hide every table that is not selected or highlighted. */
  focus: boolean;
  selected: string[];
  roles: Record<string, Role>;
  activeEdges: Highlight['edges'];
  /** Per-table expand (true) / collapse (false) overrides of the detail level. */
  expanded: Record<string, boolean>;

  setDetail: (detail: DetailLevel) => void;
  setShowInferred: (value: boolean) => void;
  setMergeJunctions: (value: boolean) => void;
  setHighlightMode: (mode: HighlightMode) => void;
  setFocus: (value: boolean) => void;
  setSelection: (selected: string[]) => void;
  setHighlight: (highlight: Highlight) => void;
  toggleExpanded: (table: string, currentlyOpen: boolean) => void;
  savePositions: (key: string, positions: Record<string, Point>) => void;
  clearLayout: (key: string) => void;
  /** Clears selection and per-table overrides, e.g. when the database changes. */
  resetSession: () => void;
}

const MAX_SAVED_LAYOUTS = 20;

export const useErdStore = create<ErdState>()(
  persist(
    (set) => ({
      detail: null,
      showInferred: false,
      mergeJunctions: false,
      highlightMode: 'direct',
      layouts: {},
      focus: false,
      selected: [],
      roles: {},
      activeEdges: {},
      expanded: {},

      setDetail: (detail) => set({ detail, expanded: {} }),
      setShowInferred: (showInferred) => set({ showInferred }),
      setMergeJunctions: (mergeJunctions) => set({ mergeJunctions }),
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setFocus: (focus) => set({ focus }),
      setSelection: (selected) =>
        set((s) => ({ selected, focus: selected.length === 0 ? false : s.focus })),
      setHighlight: ({ roles, edges }) => set({ roles, activeEdges: edges }),
      toggleExpanded: (table, currentlyOpen) =>
        set((s) => ({ expanded: { ...s.expanded, [table]: !currentlyOpen } })),
      savePositions: (key, positions) =>
        set((s) => {
          const layouts = { ...s.layouts, [key]: { ...s.layouts[key], ...positions } };
          // Keep storage bounded: drop the oldest saved diagrams.
          const keys = Object.keys(layouts);
          for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_LAYOUTS))) {
            delete layouts[stale];
          }
          return { layouts };
        }),
      clearLayout: (key) =>
        set((s) => {
          const { [key]: _removed, ...layouts } = s.layouts;
          return { layouts };
        }),
      resetSession: () =>
        set({ focus: false, selected: [], roles: {}, activeEdges: {}, expanded: {} }),
    }),
    {
      name: 'jarvis.erd',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ detail, showInferred, mergeJunctions, highlightMode, layouts }) => ({
        detail,
        showInferred,
        mergeJunctions,
        highlightMode,
        layouts,
      }),
    },
  ),
);
