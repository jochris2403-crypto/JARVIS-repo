import type {
  ConnectionCreateInput,
  ConnectionProfile,
  ConnectionUpdateInput,
  DatabaseInfo,
  DatabaseSchema,
} from '@jarvis/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as api from '@/api/connections';
import { errorCode, errorMessage } from '@/lib/errors';
import { notify } from '@/lib/notify';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ConnectionDialogState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

/** Everything that belongs to the active connection's session. */
interface SessionState {
  databases: DatabaseInfo[];
  databasesStatus: LoadStatus;
  databasesError: string | null;
  activeDatabase: string | null;
  schema: DatabaseSchema | null;
  schemaStatus: LoadStatus;
  schemaError: string | null;
}

const EMPTY_SESSION: SessionState = {
  databases: [],
  databasesStatus: 'idle',
  databasesError: null,
  activeDatabase: null,
  schema: null,
  schemaStatus: 'idle',
  schemaError: null,
};

interface ConnectionState extends SessionState {
  profiles: ConnectionProfile[];
  profilesStatus: LoadStatus;
  profilesError: string | null;
  /** The connection the workspaces operate on. Several may be open; one is active. */
  activeId: string | null;
  /** Last database opened per connection, restored on reconnect. Persisted. */
  lastDatabase: Record<string, string>;
  /** Connections with a connect/disconnect request in flight. */
  busy: Record<string, 'connecting' | 'disconnecting'>;
  dialog: ConnectionDialogState;

  openDialog: (dialog: NonNullable<ConnectionDialogState>) => void;
  closeDialog: () => void;
  loadProfiles: () => Promise<void>;
  save: (
    input: ConnectionCreateInput | ConnectionUpdateInput,
    id?: string,
  ) => Promise<ConnectionProfile>;
  remove: (id: string) => Promise<boolean>;
  connect: (id: string) => Promise<boolean>;
  disconnect: (id: string) => Promise<void>;
  /** Makes an already-open connection the active one. */
  activate: (id: string) => Promise<void>;
  selectDatabase: (name: string) => Promise<void>;
  refreshSchema: () => Promise<void>;
  reset: () => void;
}

/** Errors that mean the server no longer holds this session. */
const SESSION_LOST_CODES = new Set(['NOT_CONNECTED', 'DB_CONNECTION_FAILED']);

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => {
      const replaceProfile = (profile: ConnectionProfile) =>
        set((s) => ({
          profiles: s.profiles.some((p) => p.id === profile.id)
            ? s.profiles.map((p) => (p.id === profile.id ? profile : p))
            : [...s.profiles, profile],
        }));

      const setBusy = (id: string, state?: 'connecting' | 'disconnecting') =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.busy;
          return { busy: state ? { ...rest, [id]: state } : rest };
        });

      /** If `error` shows the session is gone, reflect that locally. Returns true when handled. */
      const handleSessionLost = (id: string, error: unknown): boolean => {
        const code = errorCode(error);
        if (!code || !SESSION_LOST_CODES.has(code)) return false;
        const profile = get().profiles.find((p) => p.id === id);
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, connected: false, serverVersion: null } : p,
          ),
          ...(s.activeId === id ? { activeId: null, ...EMPTY_SESSION } : {}),
        }));
        notify('error', `Connection to ${profile?.name ?? 'the server'} was lost`, {
          description: errorMessage(error),
        });
        return true;
      };

      const loadDatabases = async () => {
        const id = get().activeId;
        if (!id) return;
        set({ databasesStatus: 'loading', databasesError: null });
        try {
          const databases = await api.listDatabases(id);
          if (get().activeId !== id) return;
          set({ databases, databasesStatus: 'ready' });

          const names = new Set(databases.map((d) => d.name));
          const profile = get().profiles.find((p) => p.id === id);
          const preferred = [get().lastDatabase[id], profile?.database].find(
            (name): name is string => name !== undefined && names.has(name),
          );
          if (preferred) await get().selectDatabase(preferred);
        } catch (error) {
          if (get().activeId !== id || handleSessionLost(id, error)) return;
          set({ databasesStatus: 'error', databasesError: errorMessage(error) });
        }
      };

      const loadSchema = async () => {
        const { activeId: id, activeDatabase: database } = get();
        if (!id || !database) return;
        const isCurrent = () => get().activeId === id && get().activeDatabase === database;
        set({ schemaStatus: 'loading', schemaError: null });
        try {
          const schema = await api.fetchSchema(id, database);
          if (isCurrent()) set({ schema, schemaStatus: 'ready' });
        } catch (error) {
          if (!isCurrent() || handleSessionLost(id, error)) return;
          set({ schema: null, schemaStatus: 'error', schemaError: errorMessage(error) });
        }
      };

      return {
        profiles: [],
        profilesStatus: 'idle',
        profilesError: null,
        activeId: null,
        lastDatabase: {},
        busy: {},
        dialog: null,
        ...EMPTY_SESSION,

        openDialog: (dialog) => set({ dialog }),
        closeDialog: () => set({ dialog: null }),

        loadProfiles: async () => {
          if (get().profilesStatus !== 'ready') set({ profilesStatus: 'loading' });
          try {
            const profiles = await api.listConnections();
            set({ profiles, profilesStatus: 'ready', profilesError: null });
          } catch (error) {
            set({ profilesStatus: 'error', profilesError: errorMessage(error) });
            return;
          }
          // Reconcile the remembered active connection with what the server actually holds
          // (it forgets sessions when it restarts).
          const { activeId, databasesStatus, profiles } = get();
          if (!activeId) return;
          if (!profiles.find((p) => p.id === activeId)?.connected) {
            set({ activeId: null, ...EMPTY_SESSION });
          } else if (databasesStatus === 'idle') {
            await get().activate(activeId);
          }
        },

        save: async (input, id) => {
          const profile = id
            ? await api.updateConnection(id, input)
            : await api.createConnection(input as ConnectionCreateInput);
          replaceProfile(profile);
          // The server closes a session whose settings changed.
          if (get().activeId === profile.id && !profile.connected) {
            set({ activeId: null, ...EMPTY_SESSION });
          }
          return profile;
        },

        remove: async (id) => {
          const profile = get().profiles.find((p) => p.id === id);
          try {
            await api.deleteConnection(id);
          } catch (error) {
            notify('error', 'Could not delete the connection', {
              description: errorMessage(error),
            });
            return false;
          }
          set((s) => {
            const { [id]: _removed, ...lastDatabase } = s.lastDatabase;
            return {
              profiles: s.profiles.filter((p) => p.id !== id),
              lastDatabase,
              ...(s.activeId === id ? { activeId: null, ...EMPTY_SESSION } : {}),
            };
          });
          notify('success', `Deleted connection ${profile?.name ?? ''}`.trim());
          return true;
        },

        connect: async (id) => {
          const name = get().profiles.find((p) => p.id === id)?.name ?? 'server';
          setBusy(id, 'connecting');
          try {
            const profile = await api.openConnection(id);
            replaceProfile(profile);
            notify('success', `Connected to ${profile.name}`, {
              description: profile.serverVersion ? `MySQL ${profile.serverVersion}` : undefined,
            });
          } catch (error) {
            notify('error', `Could not connect to ${name}`, { description: errorMessage(error) });
            return false;
          } finally {
            setBusy(id);
          }
          await get().activate(id);
          return true;
        },

        disconnect: async (id) => {
          setBusy(id, 'disconnecting');
          try {
            const profile = await api.closeConnection(id);
            replaceProfile(profile);
            if (get().activeId === id) set({ activeId: null, ...EMPTY_SESSION });
            notify('info', `Disconnected from ${profile.name}`);
          } catch (error) {
            notify('error', 'Could not disconnect', { description: errorMessage(error) });
          } finally {
            setBusy(id);
          }
        },

        activate: async (id) => {
          set({ activeId: id, ...EMPTY_SESSION });
          await loadDatabases();
        },

        selectDatabase: async (name) => {
          const id = get().activeId;
          if (!id) return;
          set((s) => ({
            activeDatabase: name,
            schema: null,
            lastDatabase: { ...s.lastDatabase, [id]: name },
          }));
          await loadSchema();
        },

        refreshSchema: async () => {
          if (get().activeDatabase) await loadSchema();
          else await loadDatabases();
        },

        reset: () =>
          set({
            profiles: [],
            profilesStatus: 'idle',
            profilesError: null,
            activeId: null,
            lastDatabase: {},
            busy: {},
            dialog: null,
            ...EMPTY_SESSION,
          }),
      };
    },
    {
      name: 'jarvis.session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only ids and database names are remembered — never credentials or data.
      partialize: ({ activeId, lastDatabase }) => ({ activeId, lastDatabase }),
    },
  ),
);

export const selectActiveProfile = (s: ConnectionState): ConnectionProfile | null =>
  s.profiles.find((p) => p.id === s.activeId) ?? null;
