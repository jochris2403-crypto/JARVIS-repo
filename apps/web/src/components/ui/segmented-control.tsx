import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  'aria-label': string;
  className?: string;
}

/** Accessible single-choice toggle group (radio semantics). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn(
        'inline-flex rounded-md border border-border-strong bg-surface p-0.5',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const index = options.findIndex((o) => o.value === value);
        const next =
          options[(index + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
        if (next) onChange(next.value);
      }}
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(optionValue)}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected ? 'bg-surface-active text-fg shadow-raised' : 'text-fg-muted hover:text-fg',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
