const pad = (n: number) => String(n).padStart(2, '0');

export function hm(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mdhm(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${hm(ts)}`;
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "08:42" when on the same calendar day as `ref`, otherwise "10/7 23:50". */
export function timeRelativeTo(ts: number, ref: number): string {
  return sameDay(ts, ref) ? hm(ts) : mdhm(ts);
}

export function duration(from: number, to: number): string {
  const mins = Math.max(0, Math.round((to - from) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分`;
}

export function daysAgo(ts: number, now: number = Date.now()): string {
  const d = Math.floor((now - ts) / 86400000);
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  return `${d} 天前`;
}
