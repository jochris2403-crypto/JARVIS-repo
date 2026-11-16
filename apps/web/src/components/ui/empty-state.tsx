import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Primary/secondary actions. Only pass actions that actually work. */
  actions?: ReactNode;
  children?: ReactNode;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * The standard "nothing here yet" presentation. Used for empty lists, missing
 * connections and features awaiting prerequisites.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  children,
  size = 'lg',
  className,
}: EmptyStateProps) {
  const large = size === 'lg';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        large ? 'gap-4 px-6 py-16' : 'gap-2 px-3 py-5',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center rounded-lg border border-border-strong bg-surface-raised text-fg-muted shadow-raised',
          large ? 'size-12' : 'size-8',
        )}
      >
        {large && (
          <span
            aria-hidden
            className="absolute -inset-2 rounded-xl border border-dashed border-border opacity-70"
          />
        )}
        <Icon className={large ? 'size-5' : 'size-4'} strokeWidth={1.6} />
      </div>
      <div className={cn('flex max-w-sm flex-col', large ? 'gap-1.5' : 'gap-0.5')}>
        <h3 className={cn('font-semibold text-fg', large ? 'text-sm' : 'text-xs')}>{title}</h3>
        {description && (
          <p
            className={cn(
              'text-balance text-fg-muted',
              large ? 'text-sm leading-relaxed' : 'text-2xs leading-4',
            )}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
