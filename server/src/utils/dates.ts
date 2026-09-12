/** 容器内已设 TZ=Asia/Shanghai，此处即按东八区取本地日期 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 上一个月份前缀 YYYY-MM */
export function prevMonthPrefix(prefix: string): string {
  const [y, m] = prefix.split('-').map(Number);
  const ny = m === 1 ? y - 1 : y;
  const nm = m === 1 ? 12 : m - 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
