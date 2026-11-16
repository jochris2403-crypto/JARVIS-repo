import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { DEFAULT_WORKSPACE, workspacePath } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description={
          <>
            Nothing lives at <code className="font-mono text-fg">{pathname}</code>.
          </>
        }
        actions={
          <Button variant="primary" asChild>
            <Link to={workspacePath(DEFAULT_WORKSPACE)}>Go to Overview</Link>
          </Button>
        }
      />
    </div>
  );
}
