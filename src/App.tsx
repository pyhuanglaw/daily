import { useEffect } from 'react';
import { ClockIcon, GearIcon, ListIcon, XIcon } from './components/icons';
import { RecordDetailPage, RecordsPage } from './components/RecordsPage';
import { SettingsPage } from './components/SettingsPage';
import { TodayPage } from './components/TodayPage';
import { routeHref, ToastProvider, useAppState, useRoute, useStore, useToast, type Route, type Toast } from './state';

const TABS: { route: Route; label: string; Icon: typeof ListIcon }[] = [
  { route: { name: 'today' }, label: '今日', Icon: ListIcon },
  { route: { name: 'records' }, label: '紀錄', Icon: ClockIcon },
  { route: { name: 'settings' }, label: '設定', Icon: GearIcon },
];

function TabBar({ route }: { route: Route }) {
  const active = route.name === 'record' ? 'records' : route.name;
  return (
    <nav className="tabbar" aria-label="主選單">
      {TABS.map(({ route: r, label, Icon }) => (
        <a key={r.name} href={routeHref(r)} className={`tab${active === r.name ? ' on' : ''}`} aria-current={active === r.name ? 'page' : undefined}>
          <Icon width={24} height={24} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.kind === 'error' ? ' error' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SaveErrorBanner({ text }: { text: string }) {
  const store = useStore();
  return (
    <div className="save-error" role="alert">
      <span>{text}</span>
      <button type="button" className="icon-btn" aria-label="關閉" onClick={() => store.dismissSaveError()}>
        <XIcon width={18} height={18} />
      </button>
    </div>
  );
}

/** Hide the bottom tab bar while typing so it never floats above the iPhone keyboard. */
function useKeyboardClass() {
  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) document.documentElement.classList.add('typing');
    };
    const onOut = () => {
      window.setTimeout(() => {
        if (!isField(document.activeElement)) document.documentElement.classList.remove('typing');
      }, 50);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
}

function useUpdateNotice() {
  const toast = useToast();
  useEffect(() => {
    const on = () =>
      toast.show('網站已更新', { action: { label: '重新載入', run: () => location.reload() }, duration: 0 });
    window.addEventListener('app-updated', on);
    return () => window.removeEventListener('app-updated', on);
  }, [toast]);
}

function useResync() {
  const store = useStore();
  useEffect(() => {
    // Another tab (or the home-screen app sharing storage) may have changed data while hidden.
    const on = () => {
      if (document.visibilityState === 'visible') void store.reload();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [store]);
}

function Main() {
  const state = useAppState();
  const route = useRoute();
  useKeyboardClass();
  useUpdateNotice();
  useResync();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, route.name === 'record' ? route.id : '']);

  if (state.status === 'loading') {
    return <div className="boot" aria-busy="true" />;
  }
  if (state.status === 'error') {
    return (
      <div className="page boot-error">
        <h1 className="page-title">無法載入資料</h1>
        <p>{state.error}</p>
        <p>資料沒有被修改。請關閉其他 Daily Routine 分頁後重新開啟；若使用私密瀏覽模式，請改用一般模式。</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          重新載入
        </button>
      </div>
    );
  }

  return (
    <>
      {state.saveError && <SaveErrorBanner text={state.saveError} />}
      <main>
        {route.name === 'today' && <TodayPage onOpenSettings={() => (location.hash = routeHref({ name: 'settings' }))} />}
        {route.name === 'records' && <RecordsPage />}
        {route.name === 'record' && <RecordDetailPage id={route.id} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      <TabBar route={route} />
    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      {(toasts, dismiss) => (
        <>
          <Main />
          <Toasts toasts={toasts} dismiss={dismiss} />
        </>
      )}
    </ToastProvider>
  );
}
