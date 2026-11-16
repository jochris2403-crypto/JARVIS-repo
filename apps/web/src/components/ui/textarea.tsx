import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-16 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm text-fg shadow-raised transition-[border-color,box-shadow] placeholder:text-fg-subtle',
      'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
