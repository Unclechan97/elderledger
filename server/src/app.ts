import express from 'express';
import { config } from './config';
import { categoriesRouter } from './routes/categories';
import { transactionsRouter } from './routes/transactions';
import { summaryRouter } from './routes/summary';
import { asrRouter } from './routes/asr';
import { parseRouter } from './routes/parse';
import { ttsRouter } from './routes/tts';
import { familyRouter } from './routes/family';
import { exportRouter } from './routes/export';

const app = express();
app.use(express.json({ limit: '1mb' }));

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

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[elderledger] listening on :${config.port}`);
});
