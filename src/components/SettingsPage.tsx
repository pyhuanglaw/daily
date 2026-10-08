import { useEffect, useRef, useState } from 'react';
import { backupFileName, buildBackup, parseBackup } from '../lib/backup';
import { daysAgo, mdhm } from '../lib/time';
import { SCHEMA_VERSION, type FullData } from '../lib/types';
import { useData, useStore, useToast } from '../state';
import { ConfirmDialog } from './Modal';

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

interface PendingImport {
  data: FullData;
  exportedAt: string | null;
  fileName: string;
}

export function SettingsPage() {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const standalone = isStandalone();

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const exportBackup = async () => {
    const now = Date.now();
    const json = JSON.stringify(buildBackup(data, now), null, 2);
    const file = new File([json], backupFileName(now), { type: 'application/json' });
    const markExported = () => store.dispatch({ type: 'patchMeta', patch: { lastExportAt: now } });
    // The iPhone share sheet lets you "儲存到檔案" or AirDrop; fall back to a normal download elsewhere.
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Daily Routine 備份' });
        markExported();
        toast.show('備份已匯出');
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    download(file);
    markExported();
    toast.show('備份檔已下載');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.show('無法讀取這個檔案。', { kind: 'error' });
      return;
    }
    const res = parseBackup(text);
    if (!res.ok) {
      toast.show(`無法匯入：${res.error} 目前資料沒有任何變更。`, { kind: 'error', duration: 8000 });
      return;
    }
    setPending({ data: res.data, exportedAt: res.exportedAt, fileName: file.name });
  };

  const confirmImport = async () => {
    if (!pending || importing) return;
    setImporting(true);
    try {
      await store.importData(pending.data);
      toast.show('已從備份還原');
      setPending(null);
    } catch {
      setPending(null);
    } finally {
      setImporting(false);
    }
  };

  const requestPersist = async () => {
    try {
      const ok = await navigator.storage?.persist?.();
      setPersisted(!!ok);
      toast.show(ok ? '已啟用持久儲存' : '瀏覽器沒有同意持久儲存，請定期匯出備份');
    } catch {
      toast.show('此瀏覽器不支援持久儲存設定');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">設定</h1>
      </header>

      <h2 className="section-label">備份</h2>
      <section className="card settings-card">
        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={exportBackup}>
            匯出備份
          </button>
          <button type="button" className="btn btn-soft" onClick={() => fileInput.current?.click()}>
            匯入備份
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <p className="settings-meta">
          上次匯出：{data.meta.lastExportAt ? `${mdhm(data.meta.lastExportAt)}（${daysAgo(data.meta.lastExportAt)}）` : '尚未匯出'}
        </p>
        <div className="note">
          <p>
            <strong>資料只存在這支裝置的瀏覽器裡。</strong>
            GitHub Pages 只負責提供網頁，<strong>不會同步或備份你的私人資料</strong>。清除 Safari 網站資料、手機故障或換手機時，資料可能遺失。
          </p>
          <p>建議每週匯出一次備份，存到「檔案」App 或 iCloud Drive。換手機時，在新手機開啟網站後「匯入備份」即可還原。</p>
        </div>
      </section>

      <h2 className="section-label">加入 iPhone 主畫面</h2>
      <section className="card settings-card">
        <ol className="steps">
          <li>用 Safari 開啟這個網站。</li>
          <li>點下方的「分享」按鈕（方框加向上箭頭）。</li>
          <li>往下滑，選「加入主畫面」，再點「新增」。</li>
          <li>之後從主畫面的 Daily Routine 圖示開啟。</li>
        </ol>
        <div className="note">
          <p>
            <strong>注意：</strong>Safari 分頁和主畫面 App 的資料<strong>可能不共用</strong>。請固定只用其中一個（建議用主畫面 App）。
          </p>
          <p>如果已經在 Safari 裡使用了一段時間：先在 Safari 版「匯出備份」，再從主畫面 App 開啟並「匯入備份」。</p>
        </div>
        <p className="settings-meta">目前開啟方式：{standalone ? '主畫面 App' : '瀏覽器分頁'}</p>
      </section>

      <h2 className="section-label">資料</h2>
      <section className="card settings-card">
        <dl className="info-list">
          <div>
            <dt>儲存位置</dt>
            <dd>本機 IndexedDB</dd>
          </div>
          <div>
            <dt>持久儲存</dt>
            <dd>
              {persisted === null ? (
                '不支援'
              ) : persisted ? (
                '已啟用'
              ) : (
                <button type="button" className="text-btn" onClick={requestPersist}>
                  未啟用 · 申請
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt>任務數</dt>
            <dd>{data.tasks.length} 項</dd>
          </div>
          <div>
            <dt>歷史紀錄</dt>
            <dd>{data.history.length} 輪</dd>
          </div>
          <div>
            <dt>資料格式版本</dt>
            <dd>{SCHEMA_VERSION}</dd>
          </div>
        </dl>
      </section>

      {pending && (
        <ConfirmDialog
          title="用備份覆蓋目前資料？"
          message={
            <>
              <p>
                {pending.exportedAt && Number.isFinite(Date.parse(pending.exportedAt))
                  ? `備份時間：${mdhm(Date.parse(pending.exportedAt))}`
                  : pending.fileName}
                <br />
                任務 {pending.data.tasks.length} 項、歷史紀錄 {pending.data.history.length} 輪
              </p>
              <p>目前的任務清單、本輪勾選及歷史紀錄都會被取代，無法復原。</p>
            </>
          }
          confirmLabel="覆蓋並匯入"
          destructive
          busy={importing}
          onCancel={() => setPending(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}
