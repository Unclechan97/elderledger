import WebSocket from 'ws';
import { config } from '../../config';

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

    // offline 模式实测：整段音频处理完只回一帧 {"text":"...","is_final":false}，
    // is_final 恒为 false，不能等它。策略：收到非空 text 帧后留 500ms 宽限收尾帧，
    // 期间没有新帧就认为转写完成；显式 is_final:true 立即完成。
    let graceTimer: NodeJS.Timeout | null = null;
    const complete = () => {
      if (graceTimer) clearTimeout(graceTimer);
      finish(() => resolve(text.trim()));
    };

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString()) as { text?: string; is_final?: boolean };
        if (typeof msg.text === 'string' && msg.text) text += msg.text;
        if (msg.is_final) complete();
        else if (text) {
          if (graceTimer) clearTimeout(graceTimer);
          graceTimer = setTimeout(complete, 500);
        }
      } catch {
        /* 忽略非 JSON 帧 */
      }
    });

    ws.on('error', (err: Error) => finish(() => reject(err)));
    ws.on('close', () => finish(() => resolve(text.trim())));
  });
}
