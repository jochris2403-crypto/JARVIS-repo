import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface-active p-px transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 rounded-full bg-fg shadow-raised transition-transform data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-accent-fg" />
    </SwitchPrimitive.Root>
  );
}
