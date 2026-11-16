import { toast } from 'sonner';
import { useNotificationStore, type NotificationLevel } from '@/stores/notification-store';

interface NotifyOptions {
  description?: string;
  /** Record in the notification centre without showing a toast. */
  silent?: boolean;
}

/** Shows a toast and records it in the notification centre. */
export function notify(level: NotificationLevel, title: string, options: NotifyOptions = {}): void {
  useNotificationStore.getState().push({ level, title, description: options.description });
  if (options.silent) return;
  const toastOptions = options.description ? { description: options.description } : undefined;
  switch (level) {
    case 'success':
      toast.success(title, toastOptions);
      break;
    case 'warning':
      toast.warning(title, toastOptions);
      break;
    case 'error':
      toast.error(title, toastOptions);
      break;
    default:
      toast.info(title, toastOptions);
  }
}
