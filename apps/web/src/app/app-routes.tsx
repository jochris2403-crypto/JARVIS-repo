import { WORKSPACES } from '@jarvis/shared';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { NotFoundPage } from '@/pages/not-found-page';
import { SettingsPage } from '@/pages/settings-page';
import { WorkspacePage } from '@/pages/workspace-page';
import { DEFAULT_WORKSPACE, SETTINGS_PATH, workspacePath } from './paths';

/** Route table. Rendered inside a router by `App` (browser) or tests (memory). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={workspacePath(DEFAULT_WORKSPACE)} replace />} />
        {WORKSPACES.map(({ id }) => (
          <Route key={id} path={workspacePath(id)} element={<WorkspacePage id={id} />} />
        ))}
        <Route path={SETTINGS_PATH} element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
