import { cn } from '@/lib/utils';

/** Thin arc spinner, sized by `className` (defaults to 16px). */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('size-4 animate-[jarvis-spin_0.8s_linear_infinite]', className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path
        d="M8 1.75A6.25 6.25 0 0 1 14.25 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
