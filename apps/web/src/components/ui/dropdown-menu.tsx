import { DropdownMenu as Menu } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuSub = Menu.Sub;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

const contentClass =
  'z-50 min-w-48 overflow-hidden rounded-lg border border-border-strong bg-surface-overlay p-1 text-fg shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

const itemClass =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-muted';

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn(contentClass, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        itemClass,
        destructive && 'text-danger data-[highlighted]:bg-danger-muted [&_svg]:text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, 'pr-7', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2 flex items-center">
        <Check className="!text-accent" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger
      className={cn(itemClass, 'data-[state=open]:bg-surface-hover', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent className={cn(contentClass, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn(
        'px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-fg-subtle uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto pl-4 text-2xs tracking-wider text-fg-subtle', className)}
      {...props}
    />
  );
}
