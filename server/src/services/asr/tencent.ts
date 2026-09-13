// 腾讯云一句话识别（SentenceRecognition）：≤60s 短音频同步识别，REST + SDK 封装 TC3 签名
// 免费额度 5000 次/月（长期）；文档 cloud.tencent.com/document/product/1093/35642
// 官方限制：音频 base64 后 ≤3MB（60s 的 wav ≈2.6MB 可过，但贴上限）；超限明确报错，不做静默截断。
import { config } from '../../config';
import { asr } from 'tencentcloud-sdk-nodejs-asr';

const AsrClient = asr.v20190614.Client;

function mimeToFormat(mime: string): 'wav' | 'mp3' | 'pcm' {
  const m = mime.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('pcm')) return 'pcm';
  return 'wav'; // 前端 RecorderManager 录的就是 wav 16k 单声道
}

export async function transcribe(audio: Buffer, mime: string, timeoutMs = 15000): Promise<string> {
  if (!config.tencentSecretId || !config.tencentSecretKey) {
    throw new Error('腾讯云密钥未配置（.env 里填 TENCENT_SECRET_ID / TENCENT_SECRET_KEY）');
  }
  const b64 = audio.toString('base64');
  if (b64.length > 3_000_000) {
    throw new Error('音频过大（录音太长），请缩短后重试或手动输入');
  }

  const client = new AsrClient({
    credential: { secretId: config.tencentSecretId, secretKey: config.tencentSecretKey },
    region: config.tencentAsrRegion,
    profile: { httpProfile: { endpoint: 'asr.tencentcloudapi.com', reqTimeout: Math.ceil(timeoutMs / 1000) } },
  });

  const resp = await client.SentenceRecognition({
    EngSerViceType: '16k_zh', // 中文普通话 16k；老人口音实测后可考虑 16k_zh_dialect（23 种方言）
    SourceType: 1, // 1 = 音频正文 base64 直传
    VoiceFormat: mimeToFormat(mime),
    Data: b64,
    DataLen: audio.length,
  });
  return ((resp as { Result?: string }).Result ?? '').trim();
}
