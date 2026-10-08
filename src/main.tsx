import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppStore } from './lib/store';
import { StoreProvider } from './state';
import './styles.css';

// The home-screen app always opens on the main list, even if it was added from another page.
const standalone =
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
if (standalone && location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search);

const store = new AppStore();
// <html data-saving> while a write is in flight (used by tests; harmless otherwise).
store.onSavingChange = (saving) => document.documentElement.toggleAttribute('data-saving', saving);
void store.init().then(() => {
  // Ask the browser not to evict our data under storage pressure (best effort).
  navigator.storage?.persist?.().catch(() => {});
});

// Warn before closing while a write is still in flight (rare: writes take milliseconds).
window.addEventListener('beforeunload', (e) => {
  if (store.hasPendingWrites) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A newer version took over; the next launch uses it. Offer a reload now.
      if (hadController) window.dispatchEvent(new Event('app-updated'));
    });
  });
}
