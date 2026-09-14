// 语音记账全链路压测：asr → parse → tts → 记账 → summary，循环 N 轮
// 目的：复现"第一笔成功、随后连续报错十多秒"的实例崩溃/不健康
// 用法：node scripts/voice-path-stress.mjs [轮数，默认12]
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const N = Number(process.argv[2] || 12);
const wav = path.resolve('data/test.wav');

const H = { 'Content-Type': 'application/json', 'X-User-Id': 'stress-test' };

async function call(method, p, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}${p}`, {
      method,
      headers: H,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, ms: Date.now() - t0, j };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: String(e?.message || e) };
  }
}

const audioB64 = fs.existsSync(wav) ? fs.readFileSync(wav).toString('base64') : null;
if (!audioB64) {
  console.error('缺少 data/test.wav，先造一个测试音频');
  process.exit(1);
}

let failCnt = 0;
for (let i = 1; i <= N; i++) {
  const text = `第${i}次测试，买菜花了${i + 5}块`;
  const asr = await call('POST', '/api/asr', { audio_base64: audioB64, mime: 'audio/wav' });
  const txt = asr.ok ? String(asr.j?.text || '').trim() : `(asr失败:${asr.err || asr.j?.error})`;
  const parse = await call('POST', '/api/parse/text', { text: txt.startsWith('(asr失败') ? text : txt });
  const tts = await call('POST', '/api/tts', { text: '记好了' });
  const txn = await call('POST', '/api/transactions', {
    kind: parse.j?.kind === 'income' ? 'income' : 'expense',
    amount_fen: parse.j?.amount_fen > 0 ? parse.j.amount_fen : 500,
    category_id: parse.j?.category_id || 1,
    occurred_on: parse.j?.occurred_on || '2026-09-14',
    note: `stress-${i}`,
    source: 'voice',
  });
  const sum = await call('GET', '/api/summary?period=month');
  const bad = [asr, parse, tts, txn, sum].filter((x) => !x.ok);
  if (bad.length) failCnt++;
  console.log(
    `#${String(i).padStart(2)} asr=${asr.ms}ms parse=${parse.ms}ms tts=${tts.ms}ms txn=${txn.ms}ms sum=${sum.ms}ms ` +
      (bad.length ? `❌ ${bad.map((b) => b.err || `HTTP${JSON.stringify(b.j)}`).join(' / ')}` : '✅'),
  );
  // 健康探针：如果进程崩了，这里会连不上
  const h = await call('GET', '/health');
  if (!h.ok) console.log(`  ⚠️ health 失败: ${h.err}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`\n完成：${N - failCnt}/${N} 轮全绿`);
