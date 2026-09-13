// ASR API 冒烟：走 /api/asr 全链路（经过 ASR_PROVIDER 分发），打印识别结果与耗时
// 用法：node scripts/asr-api-smoke.mjs <wav路径>
// A/B 对比：.env 改 ASR_PROVIDER=funasr|tencent 后 docker compose up -d --build app，各跑一次
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || 'data/test.wav';
const wav = fs.readFileSync(path.resolve(file));
const t0 = Date.now();

const fd = new FormData();
fd.append('audio', new Blob([wav], { type: 'audio/wav' }), path.basename(file));

try {
  const res = await fetch('http://127.0.0.1:3000/api/asr', { method: 'POST', body: fd });
  const j = await res.json();
  const ms = Date.now() - t0;
  console.log(`HTTP ${res.status}  ${ms}ms  file=${file} (${wav.length}B)`);
  console.log('识别结果:', JSON.stringify(j.text ?? j));
} catch (e) {
  console.error('FAIL', e.message);
  process.exit(1);
}
