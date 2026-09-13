// TTS 全链路冒烟：POST /api/tts → { audio_base64 } → 解码落盘检查
// 用法：node scripts/tts-api-smoke.mjs [http://127.0.0.1:3000]
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const text = '记好了，本月已花一百二十三元';

const t0 = Date.now();
const r = await fetch(`${BASE}/api/tts`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text }),
});
console.log('HTTP', r.status, `${Date.now() - t0}ms`);
if (!r.ok) {
  console.log(await r.text());
  process.exit(1);
}
const { audio_base64 } = await r.json();
const buf = Buffer.from(audio_base64, 'base64');
fs.writeFileSync('data/tts-smoke-last.mp3', buf);
const head = buf.subarray(0, 3);
console.log(`audio bytes=${buf.length} head=${head.toString('hex')}(${head.toString('latin1')})`);

// 缓存命中：同短语第二次应显著更快
const t1 = Date.now();
const r2 = await fetch(`${BASE}/api/tts`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text }),
});
await r2.json();
console.log(`cache-hit HTTP ${r2.status} ${Date.now() - t1}ms`);
console.log('TTS-SMOKE-OK');
