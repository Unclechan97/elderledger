// 解析层冒烟：node scripts/parse-smoke.mjs [baseUrl]
// 用 Node 原生 fetch 保证 UTF-8（Git Bash curl 在 Windows 上会把中文按 GBK 发出）
const BASE = process.argv[2] || 'http://127.0.0.1:3000'; // 别用 localhost：node24/undici 会走 IPv6+系统代理拿 502

const CASES = [
  ['今天买菜花了，15 块。', 'expense', 1500, '吃饭买菜'],
  ['昨天儿子给我两千块', 'income', 200000, '子女给'],
  ['打车花了十二块五', 'expense', 1250, '交通出行'],
  ['水电费交了三百', 'expense', 30000, '水电日用'],
  ['孙子给我一百二', 'income', 12000, '子女给'],
  ['买了药花了五毛八', 'expense', 58, '医疗药品'],
  ['今天天气真好', null, 0, null], // 无金额 → 解析失败兜底
  ['昨天去公园玩花了十块', 'expense', 1000, '休闲娱乐'],
];

let pass = 0;
for (const [text, expKind, expFen, expCat] of CASES) {
  const r = await fetch(`${BASE}/api/parse/text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then((x) => x.json());

  const okKind = expKind === null ? r.kind === null : r.kind === expKind;
  const okFen = r.amount_fen === expFen;
  // 分类 id 不便断言，打印出来人工核对
  const ok = okKind && okFen;
  if (ok) pass++;
  console.log(
    `${ok ? '✅' : '❌'} "${text}" → kind=${r.kind} fen=${r.amount_fen} cat_id=${r.category_id} conf=${r.confidence} parser=${r.parser}${ok ? '' : ` (期望 kind=${expKind} fen=${expFen})`}`,
  );
}
console.log(`\n${pass}/${CASES.length} 通过`);
process.exit(pass === CASES.length ? 0 : 1);
