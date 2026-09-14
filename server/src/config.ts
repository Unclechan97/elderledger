import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || './data',
  /** Docker 内用服务名 ws://asr:10095；宿主机直跑用 ws://127.0.0.1:10095 */
  asrHost: process.env.ASR_HOST || 'ws://127.0.0.1:10095',
  /** 语音识别实现：funasr（本地 Docker）| tencent（腾讯云一句话识别，5000 次/月免费） */
  asrProvider: process.env.ASR_PROVIDER || 'funasr',
  /** 腾讯云 ASR 密钥（ASR_PROVIDER=tencent 时必填） */
  tencentSecretId: process.env.TENCENT_SECRET_ID || '',
  tencentSecretKey: process.env.TENCENT_SECRET_KEY || '',
  tencentAsrRegion: process.env.TENCENT_ASR_REGION || 'ap-guangzhou',
  /** 语音播报实现：tencent（腾讯云基础音色，与 ASR 同密钥） */
  ttsProvider: process.env.TTS_PROVIDER || 'tencent',
  zhipuApiKey: process.env.ZHIPU_API_KEY || '',
  llmProvider: process.env.LLM_PROVIDER || 'zhipu',
  /** MySQL：云端填云托管内网地址；本地填 compose 服务名 mysql */
  mysqlHost: process.env.MYSQL_HOST || '127.0.0.1',
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlUser: process.env.MYSQL_USER || 'root',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: process.env.MYSQL_DATABASE || 'elderledger',
};
