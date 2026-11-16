import { TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from './dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Runs the action. The dialog shows progress and closes when it settles. */
  onConfirm: () => Promise<unknown> | void;
  destructive?: boolean;
}

/** Explicit confirmation for destructive or irreversible actions. Cancel is the default focus. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent showClose={false} className="max-w-md" role="alertdialog">
        <DialogBody className="flex gap-3.5 pt-5">
          {destructive && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger-muted text-danger">
              <TriangleAlert className="size-4" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button autoFocus disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
