import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './core/ui/tokens.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);

// PWA: register the service worker for install + notifications.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
