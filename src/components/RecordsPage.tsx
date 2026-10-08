import { useMemo, useState } from 'react';
import { snapshotTasks } from '../lib/domain';
import { duration, mdhm } from '../lib/time';
import type { ArchivedCycle } from '../lib/types';
import { routeHref, useData } from '../state';
import { CycleRecord, ViewSwitch, type RecordView } from './CycleRecord';
import { ChevronLeft, ChevronRight } from './icons';

function studySummary(c: ArchivedCycle): string | null {
  const subjects = c.tasks.filter((t) => t.stage === 'study' && t.subject).map((t) => t.subject as string);
  return subjects.length ? subjects.join('・') : null;
}

export function RecordsPage() {
  const data = useData();
  const [view, setView] = useState<RecordView>('time');
  const live = useMemo(() => snapshotTasks(data.tasks, data.cycle), [data.tasks, data.cycle]);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">紀錄</h1>
      </header>

      <section className="card record-card" aria-label="本輪紀錄">
        <div className="record-head">
          <span className="badge">本輪紀錄</span>
          <span className="record-range">{mdhm(data.cycle.startedAt)} 開始 · 進行中</span>
        </div>
        <ViewSwitch value={view} onChange={setView} />
        <CycleRecord tasks={live} refTime={Date.now()} view={view} />
      </section>

      <h2 className="section-label">過去紀錄</h2>
      {data.history.length === 0 ? (
        <p className="muted-note pad">還沒有過去的紀錄。按下「開始新的一天」後，上一輪會保存在這裡。</p>
      ) : (
        <ul className="card history-list">
          {data.history.map((c) => {
            const study = studySummary(c);
            return (
              <li key={c.id}>
                <a className="history-row" href={routeHref({ name: 'record', id: c.id })}>
                  <span className="history-main">
                    <span className="history-range">
                      {mdhm(c.startedAt)} → {mdhm(c.endedAt)}
                    </span>
                    <span className="history-meta">
                      {duration(c.startedAt, c.endedAt)}
                      {study && <> · 唸書：{study}</>}
                    </span>
                  </span>
                  <ChevronRight className="history-chevron" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RecordDetailPage({ id }: { id: string }) {
  const data = useData();
  const [view, setView] = useState<RecordView>('stage');
  const cycle = data.history.find((c) => c.id === id);

  return (
    <div className="page">
      <header className="page-header">
        <a className="back-link" href={routeHref({ name: 'records' })}>
          <ChevronLeft width={22} height={22} />
          紀錄
        </a>
      </header>
      {!cycle ? (
        <p className="muted-note pad">找不到這筆紀錄。</p>
      ) : (
        <>
          <h1 className="page-title detail-title">
            {mdhm(cycle.startedAt)} → {mdhm(cycle.endedAt)}
          </h1>
          <p className="detail-sub">
            {duration(cycle.startedAt, cycle.endedAt)} · 唯讀紀錄，保存當時的清單
          </p>
          <section className="card record-card">
            <ViewSwitch value={view} onChange={setView} />
            <CycleRecord tasks={cycle.tasks} refTime={cycle.startedAt} view={view} />
          </section>
        </>
      )}
    </div>
  );
}
