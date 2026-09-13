// 腾讯云语音合成（基础音色）：文本 → mp3 Buffer
// 与 ASR 同一套密钥/地域；基础音色有每月免费额度，短语播报用量九牛一毛
import { tts } from 'tencentcloud-sdk-nodejs-tts';
import { config } from '../../config';

const TtsClient = tts.v20190823.Client;
const VOICE_TYPE = 101001; // 智瑜（基础女声，吐字清晰，适合老人）

const client = new TtsClient({
  credential: { secretId: config.tencentSecretId, secretKey: config.tencentSecretKey },
  region: config.tencentAsrRegion, // ASR/TTS 同地域
  profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com', reqTimeout: 8 } },
});

export async function synthesize(text: string): Promise<Buffer> {
  if (!config.tencentSecretId || !config.tencentSecretKey) {
    throw new Error('腾讯云密钥未配置（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）');
  }
  const resp = await client.TextToVoice({
    Text: text,
    SessionId: `elderledger-${Date.now()}`,
    ModelType: 1, // 基础音色（免费额度内；大模型音色按量计费）
    VoiceType: VOICE_TYPE,
    Volume: 0,
    Speed: 0,
    Codec: 'mp3',
  });
  const audio = (resp as { Audio?: string }).Audio;
  if (!audio) throw new Error('TTS 返回为空');
  return Buffer.from(audio, 'base64');
}
