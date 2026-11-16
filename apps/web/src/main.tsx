import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from '@/app/app-routes';
import { useUiStore } from '@/stores/ui-store';
import '@/styles/index.css';

// Apply the saved interface scale before first paint so the UI does not visibly resize.
document.documentElement.style.setProperty('--ui-scale', String(useUiStore.getState().uiScale));

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);
