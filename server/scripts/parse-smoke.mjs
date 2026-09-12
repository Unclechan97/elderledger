// 解析层冒烟：node scripts/parse-smoke.mjs [baseUrl]
// 用 Node 原生 fetch 保证 UTF-8（Git Bash curl 在 Windows 上会把中文按 GBK 发出）
const BASE = process.argv[2] || 'http://127.0.0.1:3000'; // 别用 localhost：node24/undici 会走 IPv6+系统代理拿 502

const CASES = [
  ['今天买菜花了，15 块。', 'expense', 1500, '吃饭买菜', null],
  ['昨天儿子给我两千块', 'income', 200000, '子女给', null],
  ['打车花了十二块五', 'expense', 1250, '交通出行', null],
  ['水电费交了三百', 'expense', 30000, '水电日用', null],
  ['孙子给我一百二', 'income', 12000, '子女给', null],
  ['买了药花了五毛八', 'expense', 58, '医疗药品', null],
  ['今天天气真好', null, 0, null, null], // 无金额 → 解析失败兜底
  ['昨天去公园玩花了十块', 'expense', 1000, '休闲娱乐', null],
  ['大前天买菜花了十块', 'expense', 1000, '吃饭买菜', dateOffset(-3)],
  ['前天打车花了二十块', 'expense', 2000, '交通出行', dateOffset(-2)],
];

function dateOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let pass = 0;
for (const [text, expKind, expFen, expCat, expDate] of CASES) {
  const r = await fetch(`${BASE}/api/parse/text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then((x) => x.json());

  const okKind = expKind === null ? r.kind === null : r.kind === expKind;
  const okFen = r.amount_fen === expFen;
  const okDate = expDate === null ? true : r.occurred_on === expDate;
  const ok = okKind && okFen && okDate;
  if (ok) pass++;
  const why = ok ? '' : ` (期望 kind=${expKind} fen=${expFen}${expDate ? ` date=${expDate}` : ''})`;
  console.log(
    `${ok ? '✅' : '❌'} "${text}" → kind=${r.kind} fen=${r.amount_fen} cat_id=${r.category_id} date=${r.occurred_on} conf=${r.confidence} parser=${r.parser}${why}`,
  );
}
console.log(`\n${pass}/${CASES.length} 通过`);
process.exit(pass === CASES.length ? 0 : 1);
