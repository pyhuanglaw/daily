import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState, AppStore } from './lib/store';
import type { FullData } from './lib/types';

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export function useAppState(): AppState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export type ReadyData = FullData & { saveError: string | null };

/** For pages rendered only once data is ready. */
export function useData(): ReadyData {
  const s = useAppState();
  if (s.status !== 'ready') throw new Error('data not ready');
  return s;
}

/* ---------- Hash router ---------- */

export type Route =
  | { name: 'today' }
  | { name: 'records' }
  | { name: 'record'; id: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [head, arg] = path.split('/');
  if (head === 'records' && arg) return { name: 'record', id: decodeURIComponent(arg) };
  if (head === 'records') return { name: 'records' };
  if (head === 'settings') return { name: 'settings' };
  return { name: 'today' };
}

export function routeHref(r: Route): string {
  switch (r.name) {
    case 'today':
      return '#/';
    case 'records':
      return '#/records';
    case 'record':
      return `#/records/${encodeURIComponent(r.id)}`;
    case 'settings':
      return '#/settings';
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/* ---------- Toasts ---------- */

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (text: string, opts?: { kind?: Toast['kind']; action?: Toast['action']; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: (toasts: Toast[], dismiss: (id: number) => void) => ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const api = useRef<ToastApi>({
    show: (text, opts) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, text, kind: opts?.kind ?? 'info', action: opts?.action }]);
      const ms = opts?.duration ?? (opts?.kind === 'error' ? 6000 : 2600);
      if (ms > 0) window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
    },
  });
  return <ToastContext.Provider value={api.current}>{children(toasts, dismiss)}</ToastContext.Provider>;
}
