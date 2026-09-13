import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { synthesizeText } from '../services/tts';

export const ttsRouter = Router();

// 常用短语内存缓存（"记好了"/"对吗"等会反复播）；实例重启丢缓存可接受，合成很便宜
// 响应统一 base64 JSON：callContainer 对二进制响应支持不稳，两条通道（本地/云端）同一形状
const cache = new Map<string, string>(); // md5 → audio base64
const MAX_CACHE = 100;

async function handle(text: string, res: Response) {
  if (!text) return res.status(400).json({ error: 'text 必填' });
  if (text.length > 300) return res.status(400).json({ error: 'text 过长' });

  const key = createHash('md5').update(text).digest('hex');
  const hit = cache.get(key);
  if (hit) {
    res.json({ audio_base64: hit });
    return;
  }

  try {
    const buf = await synthesizeText(text);
    const b64 = buf.toString('base64');
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, b64);
    res.json({ audio_base64: b64 });
  } catch (e) {
    console.error('[tts] 合成失败:', (e as Error).message);
    res.status(502).json({ error: '播报服务暂时不可用', detail: String((e as Error).message) });
  }
}

/** POST /api/tts { text } → { audio_base64 } */
ttsRouter.post('/', (req: Request, res: Response) => {
  return handle(String(req.body?.text || '').trim(), res);
});

/** GET /api/tts?text=... —— 兼容旧调用 */
ttsRouter.get('/', (req: Request, res: Response) => {
  return handle(String(req.query.text || '').trim(), res);
});
