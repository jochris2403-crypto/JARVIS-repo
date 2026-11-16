import { Toaster as Sonner } from 'sonner';
import { useResolvedTheme } from '@/hooks/use-theme';

/** Theme-aware toast host styled with JARVIS tokens. */
export function Toaster() {
  const theme = useResolvedTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={36}
      gap={8}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border-strong !bg-surface-overlay !text-fg !shadow-overlay !font-sans !text-sm !gap-2.5 !py-3 !px-3.5',
          description: '!text-fg-muted !text-xs',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          warning: '[&_[data-icon]]:!text-warning',
          info: '[&_[data-icon]]:!text-accent',
        },
      }}
    />
  );
}
