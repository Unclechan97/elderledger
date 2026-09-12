// ASR 分发：按 ASR_PROVIDER 选择语音识别实现（接缝 = 音频 Buffer → 文本）
// 现有：funasr（FunASR runtime，本地 Docker，WS）。
// 将来接云 API（讯飞/百度/阿里）或 sherpa-onnx 时：在本目录加 <provider>.ts，
// 导出同签名 transcribe 函数，switch 加一个分支即可；/api/asr 与前端契约（{text}）不变。
import { config } from '../../config';
import { transcribe as funasrTranscribe } from './funasr';

export function transcribeAudio(audio: Buffer, mime: string, timeoutMs = 15000): Promise<string> {
  switch (config.asrProvider) {
    case 'funasr':
      return funasrTranscribe(audio, timeoutMs);
    default:
      return Promise.reject(new Error(`ASR_PROVIDER=${config.asrProvider} 未实现（当前可用：funasr）`));
  }
}
