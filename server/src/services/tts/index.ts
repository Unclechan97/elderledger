// TTS 分发接缝（与 ASR 同构）：文本 → 音频 Buffer
// 现有：tencent（腾讯云基础音色，本地/云端同一实现，按月免费额度内）。
// 再接新实现：本目录加 <provider>.ts，导出同签名 synthesize，switch 加一个分支。
import { config } from '../../config';
import { synthesize as tencentSynthesize } from './tencent';

export function synthesizeText(text: string): Promise<Buffer> {
  switch (config.ttsProvider) {
    case 'tencent':
      return tencentSynthesize(text);
    default:
      return Promise.reject(new Error(`TTS_PROVIDER=${config.ttsProvider} 未实现（当前可用：tencent）`));
  }
}
