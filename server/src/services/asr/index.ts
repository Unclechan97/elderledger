// ASR 分发：按 ASR_PROVIDER 选择语音识别实现（接缝 = 音频 Buffer → 文本）
// 现有：funasr（本地 Docker，离线）；tencent（云 API，5000 次/月免费）。
// 再接新实现：本目录加 <provider>.ts，导出同签名 transcribe，switch 加一个分支。
import { config } from '../../config';
import { transcribe as funasrTranscribe } from './funasr';
import { transcribe as tencentTranscribe } from './tencent';

export function transcribeAudio(audio: Buffer, mime: string, timeoutMs = 15000): Promise<string> {
  switch (config.asrProvider) {
    case 'funasr':
      return funasrTranscribe(audio, timeoutMs);
    case 'tencent':
      return tencentTranscribe(audio, mime, timeoutMs);
    default:
      return Promise.reject(new Error(`ASR_PROVIDER=${config.asrProvider} 未实现（当前可用：funasr | tencent）`));
  }
}
