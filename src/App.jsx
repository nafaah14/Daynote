import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RepoProvider } from './core/db/repo';
import { SettingsProvider } from './core/settings/settings';
import { EditorHost } from './core/ui/editors';
import AppShell from './core/shell/AppShell';
import { ErrorBoundary } from './core/shell/ErrorBoundary';
import SplashScreen from './core/splash/SplashScreen';
import Today from './home/Today';
import SettingsPage from './settings/Settings';
import { allRoutes } from './registry';
import { ModuleEditors } from './registry-editors';
import AssistantLauncher from './modules/assistant/Assistant';
import UpdatePrompt from './core/pwa/UpdatePrompt';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <UpdatePrompt />
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
              {/* Fixed-positioned over the tab bar rather than a child of it —
                  see the comment on AssistantLauncher for why it lives here
                  instead of inside AppShell (core/shell never imports
                  modules; this button needs actions.js's module knowledge). */}
              <AssistantLauncher />
            </EditorHost>
          </BrowserRouter>
        </RepoProvider>
      </SettingsProvider>
    </>
  );
}
