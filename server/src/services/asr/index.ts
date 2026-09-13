// ASR 分发：按 ASR_PROVIDER 选择语音识别实现（接缝 = 音频 Buffer → 文本）
// 现有：funasr（本地 Docker，离线）；tencent（云 API，5000 次/月免费）。
// 再接新实现：本目录加 <provider>.ts，导出同签名 transcribe，switch 加一个分支。
// 所有 provider 统一吃归一化后的 16k 单声道 wav（normalizeWav16k），格式差异在这里终结。
import { spawn } from 'node:child_process';
import { config } from '../../config';
import { transcribe as funasrTranscribe } from './funasr';
import { transcribe as tencentTranscribe } from './tencent';

/** 任意输入音频（mp3/wav/aac/…）→ 16k 单声道 wav。模拟器录不了标准 wav、真机格式也参差，统一在这里归一 */
function normalizeWav16k(audio: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'], {
      timeout: 10000,
    });
    const chunks: Buffer[] = [];
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.stdin.on('error', () => { /* ffmpeg 提前退出时忽略 EPIPE */ });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`音频归一化失败（ffmpeg exit ${code}）`));
    });
    p.stdin.end(audio);
  });
}

export async function transcribeAudio(audio: Buffer, mime: string, timeoutMs = 15000): Promise<string> {
  let wav: Buffer;
  try {
    wav = await normalizeWav16k(audio);
  } catch (e) {
    // 归一化失败原样透传，让 provider 给出更具指向性的错误（日志里能看到两者）
    console.warn('[asr] 归一化失败，原样透传:', (e as Error).message);
    wav = audio;
  }
  switch (config.asrProvider) {
    case 'funasr':
      return funasrTranscribe(wav, timeoutMs);
    case 'tencent':
      return tencentTranscribe(wav, 'audio/wav', timeoutMs);
    default:
      return Promise.reject(new Error(`ASR_PROVIDER=${config.asrProvider} 未实现（当前可用：funasr | tencent）`));
  }
}
