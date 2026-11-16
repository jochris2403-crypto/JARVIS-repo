import {
  Bell,
  BellOff,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  selectUnreadCount,
  useNotificationStore,
  type NotificationLevel,
} from '@/stores/notification-store';

const LEVEL_ICON: Record<NotificationLevel, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-accent' },
  success: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: CircleAlert, className: 'text-danger' },
};

/** Bell button + popover listing this session's notifications. */
export function NotificationCenter() {
  const items = useNotificationStore((s) => s.items);
  const unread = useNotificationStore(selectUnreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const clear = useNotificationStore((s) => s.clear);

  return (
    // Unread markers stay visible while the panel is open and clear when it closes.
    <Popover onOpenChange={(open) => !open && markAllRead()}>
      <Tooltip content="Notifications">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
          >
            <Bell />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-1.5 rounded-full bg-accent ring-2 ring-surface"
              />
            )}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-85" aria-label="Notifications">
        <div className="flex h-10 items-center justify-between border-b border-border pr-2 pl-3.5">
          <span className="text-xs font-semibold">Notifications</span>
          {items.length > 0 && (
            <Button variant="ghost" size="xs" onClick={clear}>
              Clear all
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={BellOff}
            title="You're all caught up"
            description="Connection events, query results and errors appear here."
            className="py-8"
          />
        ) : (
          <ul className="max-h-80 overflow-y-auto p-1">
            {items.map((item) => {
              const { icon: Icon, className } = LEVEL_ICON[item.level];
              return (
                <li
                  key={item.id}
                  className={cn(
                    'group flex gap-2.5 rounded-md px-2.5 py-2',
                    !item.read && 'bg-accent-muted/60',
                  )}
                >
                  <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-fg">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-2xs text-fg-muted">{item.description}</p>
                    )}
                    <p className="mt-0.5 text-2xs text-fg-subtle">
                      {formatRelativeTime(item.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Dismiss: ${item.title}`}
                    onClick={() => dismiss(item.id)}
                    className="h-fit rounded-sm p-0.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
