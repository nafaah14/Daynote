import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RepoProvider } from './core/db/repo';
import { SettingsProvider } from './core/settings/settings';
import { EditorHost } from './core/ui/editors';
import AppShell from './core/shell/AppShell';
import { ErrorBoundary } from './core/shell/ErrorBoundary';
import Today from './home/Today';
import SettingsPage from './settings/Settings';
import { allRoutes } from './registry';
import { ModuleEditors } from './registry-editors';

export default function App() {
  return (
    <SettingsProvider>
      <RepoProvider>
        <BrowserRouter>
          <EditorHost>
            {/* Each module registers its record editor here, so Today and the
                module screens can all open the same editor by record without
                importing one another. */}
            <ModuleEditors />
            <AppShell>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Today />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {allRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </AppShell>
          </EditorHost>
        </BrowserRouter>
      </RepoProvider>
    </SettingsProvider>
  );
}
