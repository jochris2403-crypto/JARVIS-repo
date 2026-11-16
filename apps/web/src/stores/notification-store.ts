import { create } from 'zustand';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  description?: string;
  createdAt: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

interface NotificationState {
  items: AppNotification[];
  push: (input: {
    level: NotificationLevel;
    title: string;
    description?: string;
  }) => AppNotification;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

/**
 * In-session notification log. Every toast is also recorded here so users can
 * review what happened from the notification centre in the top bar.
 */
export const useNotificationStore = create<NotificationState>()((set) => ({
  items: [],
  push: (input) => {
    const notification: AppNotification = {
      ...input,
      id: `n${Date.now().toString(36)}${(counter++).toString(36)}`,
      createdAt: Date.now(),
      read: false,
    };
    set((s) => ({ items: [notification, ...s.items].slice(0, MAX_NOTIFICATIONS) }));
    return notification;
  },
  markAllRead: () =>
    set((s) => ({ items: s.items.map((n) => (n.read ? n : { ...n, read: true })) })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clear: () => set({ items: [] }),
}));

export const selectUnreadCount = (s: NotificationState) => s.items.filter((n) => !n.read).length;
