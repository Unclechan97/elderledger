// 直连云托管公网域名压测 ASR（绕过 callContainer 网关，定位 -606001 归因）
// 用法: node scripts/direct-asr-stress.mjs [轮数=10]
const APP_KEY = '6e0e224e91e18969cfe2e3a92fe79798a8a868924f9676be'; // 与 miniprogram/utils/config.ts 同源
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://elderledger-app-313318-10-1323623511.sh.run.tcloudbase.com';
const N = Number(process.argv[2] || 10);

const here = path.dirname(fileURLToPath(import.meta.url));
const wavPath = path.join(here, '..', 'data', 'test.wav');
const b64 = readFileSync(wavPath).toString('base64');

let ok = 0, fail = 0;
const latencies = [];

for (let i = 1; i <= N; i++) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/asr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-key': APP_KEY },
      body: JSON.stringify({ audio_base64: b64, mime: 'audio/wav' }),
      signal: AbortSignal.timeout(60000),
    });
    const ms = Date.now() - t0;
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      ok++;
      latencies.push(ms);
      console.log(`#${i} ✅ ${ms}ms  text="${(body.text || '').slice(0, 20)}"  parse.kind=${body.parse?.kind ?? '-'}`);
    } else {
      fail++;
      console.log(`#${i} ❌ HTTP ${r.status} ${ms}ms  ${JSON.stringify(body).slice(0, 120)}`);
    }
  } catch (e) {
    fail++;
    const ms = Date.now() - t0;
    console.log(`#${i} ❌ ${ms}ms  ${String(e?.message || e).slice(0, 120)}`);
  }
  await new Promise((r) => setTimeout(r, 500));
}

latencies.sort((a, b) => a - b);
console.log(`\n结果: ${ok}/${N} 成功, 失败 ${fail}`);
if (latencies.length) {
  console.log(`延迟: 中位 ${latencies[Math.floor(latencies.length / 2)]}ms  最大 ${latencies[latencies.length - 1]}ms`);
}
process.exit(fail > 0 ? 1 : 0);
