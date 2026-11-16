import { cn } from '@/lib/utils';

interface LogoMarkProps {
  className?: string;
  /** Rotates the outer arc, e.g. while the app is establishing its server link. */
  active?: boolean;
}

/**
 * The JARVIS mark: a ring around a three-node relation graph — one parent
 * (accent) linked to two children.
 */
export function LogoMark({ className, active = false }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-6', className)}>
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="var(--accent)"
        strokeOpacity="0.22"
        strokeWidth="1.25"
      />
      <g
        style={{ transformOrigin: '16px 16px' }}
        className={active ? 'animate-[jarvis-spin_1.6s_linear_infinite]' : undefined}
      >
        <path
          d="M16 3a13 13 0 0 1 13 13"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M16 11 11.25 19.5h9.5Z"
        stroke="var(--fg)"
        strokeOpacity="0.45"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="11" r="2.1" fill="var(--accent)" />
      <circle cx="11.25" cy="19.5" r="2.1" fill="var(--fg)" />
      <circle cx="20.75" cy="19.5" r="2.1" fill="var(--fg)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-mono text-sm font-semibold tracking-[0.28em] text-fg', className)}>
      JARVIS
    </span>
  );
}
