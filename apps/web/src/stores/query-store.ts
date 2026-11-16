import type { CompiledQuery, QueryResult } from '@jarvis/shared';
import { create } from 'zustand';
import { ApiClientError } from '@/api/client';
import * as api from '@/api/query';
import {
  emptyState,
  toSpec,
  validate,
  type BuilderIssue,
  type BuilderState,
} from '@/features/query/model';
import { errorCode, errorMessage } from '@/lib/errors';
import { useConnectionStore } from './connection-store';

const COMPILE_DEBOUNCE_MS = 200;

export type CompileStatus = 'idle' | 'loading' | 'ready' | 'error';

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; executionId: string; startedAt: number; cancelling: boolean }
  | { status: 'success'; result: QueryResult }
  | { status: 'cancelled' }
  | { status: 'error'; message: string; code: string | null; mysqlCode: string | null };

interface QueryState {
  /** `connectionId:database` the current draft belongs to. */
  contextKey: string | null;
  builder: BuilderState;
  /** Problems that stop the draft from being compiled. Recomputed on every change. */
  issues: BuilderIssue[];
  compiled: CompiledQuery | null;
  compileStatus: CompileStatus;
  compileError: string | null;
  run: RunState;

  /** Starts a fresh draft when the active connection or database changes. */
  ensureContext: (key: string) => void;
  update: (fn: (builder: BuilderState) => BuilderState) => void;
  /** Re-checks the draft, e.g. after the schema was reloaded. */
  revalidate: () => void;
  clear: () => void;
  execute: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Moves the result window by one page and runs again. */
  page: (direction: 1 | -1) => Promise<void>;
}

let compileTimer: ReturnType<typeof setTimeout> | undefined;
let compileAbort: AbortController | undefined;

function session() {
  const { activeId, activeDatabase, schema } = useConnectionStore.getState();
  return activeId && activeDatabase && schema ? { activeId, activeDatabase, schema } : null;
}

export const useQueryStore = create<QueryState>()((set, get) => {
  /** Validates now (so the UI reacts immediately) and compiles after a short pause. */
  const refresh = () => {
    clearTimeout(compileTimer);
    compileAbort?.abort();
    const current = session();
    const { builder } = get();
    if (!current || builder.tables.length === 0) {
      set({ issues: [], compiled: null, compileStatus: 'idle', compileError: null });
      return;
    }
    const issues = validate(builder, current.schema);
    set({ issues });
    if (issues.length > 0) {
      // Keep the last good SQL on screen while the user finishes the step.
      set({ compileStatus: 'idle', compileError: null });
      return;
    }
    set({ compileStatus: 'loading' });
    compileTimer = setTimeout(() => void compile(), COMPILE_DEBOUNCE_MS);
  };

  const compile = async () => {
    const current = session();
    if (!current) return;
    const controller = new AbortController();
    compileAbort = controller;
    try {
      const compiled = await api.compileQuery(
        current.activeId,
        current.activeDatabase,
        toSpec(get().builder),
        controller.signal,
      );
      if (!controller.signal.aborted) set({ compiled, compileStatus: 'ready', compileError: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      set({ compileStatus: 'error', compileError: errorMessage(error) });
    }
  };

  const reset = (contextKey: string | null) => {
    clearTimeout(compileTimer);
    compileAbort?.abort();
    set({
      contextKey,
      builder: emptyState(),
      issues: [],
      compiled: null,
      compileStatus: 'idle',
      compileError: null,
      run: { status: 'idle' },
    });
  };

  return {
    contextKey: null,
    builder: emptyState(),
    issues: [],
    compiled: null,
    compileStatus: 'idle',
    compileError: null,
    run: { status: 'idle' },

    ensureContext: (key) => {
      if (get().contextKey !== key) reset(key);
    },
    update: (fn) => {
      set((s) => ({ builder: fn(s.builder) }));
      refresh();
    },
    revalidate: refresh,
    clear: () => reset(get().contextKey),

    execute: async () => {
      const current = session();
      const { builder, run } = get();
      if (!current || run.status === 'running' || builder.tables.length === 0) return;
      if (validate(builder, current.schema).length > 0) return;

      const executionId = crypto.randomUUID();
      set({ run: { status: 'running', executionId, startedAt: Date.now(), cancelling: false } });
      const isCurrent = () => {
        const now = get().run;
        return now.status === 'running' && now.executionId === executionId;
      };
      try {
        const result = await api.executeQuery(
          current.activeId,
          current.activeDatabase,
          toSpec(builder),
          executionId,
        );
        if (isCurrent()) set({ run: { status: 'success', result } });
      } catch (error) {
        if (!isCurrent()) return;
        const code = errorCode(error);
        if (code === 'QUERY_CANCELLED') {
          set({ run: { status: 'cancelled' } });
          return;
        }
        const details =
          error instanceof ApiClientError
            ? (error.details as { mysqlCode?: string } | undefined)
            : undefined;
        set({
          run: {
            status: 'error',
            message: errorMessage(error),
            code,
            mysqlCode: details?.mysqlCode ?? null,
          },
        });
      }
    },

    cancel: async () => {
      const { run } = get();
      if (run.status !== 'running' || run.cancelling) return;
      set({ run: { ...run, cancelling: true } });
      // The pending execute request settles with QUERY_CANCELLED once MySQL stops the statement.
      await api.cancelQuery(run.executionId).catch(() => undefined);
    },

    page: async (direction) => {
      const { builder } = get();
      const limit = Number(builder.limit);
      const offset = Math.max(0, Number(builder.offset) + direction * limit);
      get().update((b) => ({ ...b, offset: String(offset) }));
      await get().execute();
    },
  };
});
