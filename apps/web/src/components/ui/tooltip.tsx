import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Kbd } from './kbd';

export const TooltipProvider = TooltipPrimitive.Provider;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex items-center gap-2 rounded-md border border-border-strong bg-surface-overlay px-2 py-1 text-xs text-fg shadow-overlay',
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

interface TooltipProps {
  content: ReactNode;
  /** Optional keyboard shortcut rendered as key caps, e.g. `['⌘', 'K']`. */
  shortcut?: string[];
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
  children: ReactNode;
}

/** Convenience wrapper: `<Tooltip content="Search" shortcut={['⌘','K']}>…</Tooltip>` */
export function Tooltip({ content, shortcut, side, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>
        <span>{content}</span>
        {shortcut && (
          <span className="flex gap-0.5">
            {shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        )}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
