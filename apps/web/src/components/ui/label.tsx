import type { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-fg', className)} {...props} />;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  /** Validation message; also marks the field invalid for assistive tech via `aria-describedby`. */
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error, laid out consistently across every form. */
export function Field({ label, htmlFor, error, hint, optional, className, children }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-fg-subtle">Optional</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-2xs text-fg-subtle">{hint}</p>
      )}
    </div>
  );
}
