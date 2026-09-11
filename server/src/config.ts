import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || './data',
  /** Docker 内用服务名 ws://asr:10095；宿主机直跑用 ws://127.0.0.1:10095 */
  asrHost: process.env.ASR_HOST || 'ws://127.0.0.1:10095',
  ttsUrl: process.env.TTS_URL || 'http://127.0.0.1:55001',
  zhipuApiKey: process.env.ZHIPU_API_KEY || '',
  llmProvider: process.env.LLM_PROVIDER || 'zhipu',
};
