import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Styled native `<select>`. Native is deliberate: it is fully accessible,
 * handles very long option lists (hundreds of columns) and needs no portal.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className={cn('relative inline-flex min-w-0', className)}>
      <select
        ref={ref}
        className={cn(
          'h-7 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border border-border-strong bg-surface-raised py-0 pr-7 pl-2 text-xs text-fg shadow-raised transition-[border-color,box-shadow]',
          'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
          // An unset select (empty value) reads as a placeholder.
          'data-[empty=true]:text-fg-subtle',
        )}
        data-empty={props.value === '' || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-fg-subtle"
      />
    </span>
  ),
);
Select.displayName = 'Select';
