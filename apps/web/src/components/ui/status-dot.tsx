import { cn } from '@/lib/utils';

export type StatusTone = 'online' | 'offline' | 'pending' | 'idle';

const TONE_CLASS: Record<StatusTone, string> = {
  online: 'bg-success shadow-[0_0_0_3px_var(--success-muted)]',
  offline: 'bg-danger shadow-[0_0_0_3px_var(--danger-muted)]',
  pending: 'bg-warning animate-[jarvis-pulse_1.4s_ease-in-out_infinite]',
  idle: 'bg-fg-subtle',
};

export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 shrink-0 rounded-full', TONE_CLASS[tone], className)}
    />
  );
}
