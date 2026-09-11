// ASR 冒烟脚本：把一段 wav 发给 FunASR 容器，打印转写结果
// 用法：node scripts/asr-smoke.js <wav路径> [ws地址]
//   容器内：docker compose exec app node scripts/asr-smoke.js data/test.wav
//   宿主机：cd server && node scripts/asr-smoke.js data/test.wav ws://127.0.0.1:10095
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const file = process.argv[2] || 'data/test.wav';
const url = process.argv[3] || process.env.ASR_HOST || 'ws://127.0.0.1:10095';
const wav = fs.readFileSync(path.resolve(file));

console.log(`[smoke] file=${file} (${wav.length} bytes) -> ${url}`);

const ws = new WebSocket(url);
let text = '';
let settled = false;
const finish = (code, msg) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.log(msg);
  process.exit(code);
};
const timer = setTimeout(() => finish(1, '[smoke] 超时（15s），asr 容器可能仍在加载模型'), 15000);

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      mode: 'offline',
      wav_name: 'smoke',
      wav_format: 'wav',
      audio_fs: 16000,
      itn: true,
      is_speaking: true,
    }),
  );
  ws.send(wav);
  ws.send(JSON.stringify({ is_speaking: false }));
});
ws.on('message', (d, isBinary) => {
  if (isBinary) return;
  try {
    const m = JSON.parse(d.toString());
    if (typeof m.text === 'string') text += m.text;
    if (m.is_final) finish(text.trim() ? 0 : 2, `[smoke] 识别结果: ${JSON.stringify(text)}`);
  } catch {
    /* 忽略非 JSON 帧 */
  }
});
ws.on('error', (e) => finish(1, `[smoke] WS 错误: ${e.message}`));
ws.on('close', () => {
  if (text.trim()) finish(0, `[smoke] 识别结果(连接关闭): ${JSON.stringify(text)}`);
  finish(2, '[smoke] 连接关闭且无识别结果');
});
