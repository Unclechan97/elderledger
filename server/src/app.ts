import express from 'express';
import { config } from './config';
import { categoriesRouter } from './routes/categories';
import { asrRouter } from './routes/asr';
import { ttsRouter } from './routes/tts';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/categories', categoriesRouter);
app.use('/api/asr', asrRouter);
app.use('/api/tts', ttsRouter);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[elderledger] listening on :${config.port}`);
});
