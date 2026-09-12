/** 分 → "38.50"（金额一律以"分"存储与传输，杜绝浮点尾差） */
export function fenToYuanText(fen: number): string {
  const sign = fen < 0 ? '-' : '';
  const abs = Math.abs(Math.round(fen));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 键盘输入的元字符串（如 "38.5"）→ 分。纯字符串/整数运算，不走浮点 */
export function yuanStrToFen(s: string): number {
  if (!/^\d{0,7}(\.\d{0,2})?$/.test(s) || s === '' || s === '.') return 0;
  const [i = '0', f = ''] = s.split('.');
  const ff = (f + '00').slice(0, 2);
  return Number(i || '0') * 100 + Number(ff);
}
