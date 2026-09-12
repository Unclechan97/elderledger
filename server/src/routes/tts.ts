import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { config } from '../config';

export const ttsRouter = Router();

// 常用短语内存缓存（"记好了"/"对吗"等会反复播）
const cache = new Map<string, Buffer>();
const MAX_CACHE = 100;

async function handle(text: string, res: Response) {
  if (!text) return res.status(400).json({ error: 'text 必填' });
  if (text.length > 300) return res.status(400).json({ error: 'text 过长' });

  const key = createHash('md5').update(text).digest('hex');
  const hit = cache.get(key);
  if (hit) {
    res.type('audio/mpeg').send(hit);
    return;
  }

  try {
    const r = await fetch(`${config.ttsUrl}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`tts 容器返回 ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, buf);
    res.type('audio/mpeg').send(buf);
  } catch (e) {
    res.status(502).json({ error: 'TTS 服务不可用（检查 tts 容器）', detail: String((e as Error).message) });
  }
}

/** POST /api/tts { text } → audio/mpeg */
ttsRouter.post('/', (req: Request, res: Response) => {
  return handle(String(req.body?.text || '').trim(), res);
});

/** GET /api/tts?text=... —— 供小程序 wx.downloadFile（只支持 GET） */
ttsRouter.get('/', (req: Request, res: Response) => {
  return handle(String(req.query.text || '').trim(), res);
});
