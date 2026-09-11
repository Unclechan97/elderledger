import WebSocket from 'ws';
import { config } from '../config';

/**
 * FunASR runtime WebSocket 客户端（offline 模式）
 * 协议：连接后先发一段 JSON 配置 → 二进制音频 → {"is_speaking": false}
 *       服务端以 JSON 文本帧回传 {"text": "...", "is_final": true}
 * 参考：FunASR runtime/docs/SDK_advanced_guide_offline_zh.md
 */
export function transcribe(wav: Buffer, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let text = '';
    const ws = new WebSocket(config.asrHost);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    };

    const timer = setTimeout(() => {
      ws.terminate();
      finish(() => reject(new Error(`ASR timeout after ${timeoutMs}ms`)));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          mode: 'offline',
          wav_name: 'elderledger',
          wav_format: 'wav',
          audio_fs: 16000,
          itn: true,
          is_speaking: true,
        }),
      );
      ws.send(wav);
      ws.send(JSON.stringify({ is_speaking: false }));
    });

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString()) as { text?: string; is_final?: boolean };
        if (typeof msg.text === 'string') text += msg.text;
        if (msg.is_final) finish(() => resolve(text.trim()));
      } catch {
        /* 忽略非 JSON 帧 */
      }
    });

    ws.on('error', (err: Error) => finish(() => reject(err)));
    ws.on('close', () => finish(() => resolve(text.trim())));
  });
}
