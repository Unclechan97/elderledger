import express from 'express';
import { config } from './config';
import { initDb } from './db/db';
import { categoriesRouter } from './routes/categories';
import { transactionsRouter } from './routes/transactions';
import { summaryRouter } from './routes/summary';
import { asrRouter } from './routes/asr';
import { parseRouter } from './routes/parse';
import { ttsRouter } from './routes/tts';
import { familyRouter } from './routes/family';
import { exportRouter } from './routes/export';
import { openApiGuard } from './utils/openApiGuard';

const app = express();
// 3mb：云端 callContainer 不支持 multipart，音频/图片以 base64 JSON 上行（60s 录音 ≈1MB）
app.use(express.json({ limit: '3mb' }));
// 开放端点（asr/tts/parse）共享密钥校验：公网直连通道防蹭配额，callContainer 通道客户端同样带此头
app.use(openApiGuard);

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/categories', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/asr', asrRouter);
app.use('/api/parse', parseRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/family', familyRouter);
app.use('/api/export', exportRouter);

// 先建库建表再听端口（云端 MySQL 可能在唤醒，initDb 内带重试）
initDb()
  .then(() => {
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[elderledger] listening on :${config.port}`);
    });
  })
  .catch((e) => {
    console.error('[elderledger] 数据库初始化失败，进程退出等重启:', (e as Error).message);
    process.exit(1);
  });
