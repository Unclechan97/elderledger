// POST /api/parse/text —— 语音/文字记账解析：LLM 优先（配了 key 才启用），正则兜底
// POST /api/parse/image —— 拍照/截图解析（GLM-4V-Flash）
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/db';
import { localDateStr } from '../utils/dates';
import { regexParse, ParsedTxn } from '../services/parser';
import { llmParseText, llmParseImage, llmAvailable } from '../services/llm';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const parseRouter = Router();

async function categoryByName(name: string, kind: 'expense' | 'income'): Promise<{ id: number } | null> {
  return (await db.get<{ id: number }>('SELECT id FROM category WHERE name = ? AND kind = ?', [name, kind])) ?? null;
}

function offsetDate(today: string, offset: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export interface ParseTextResp {
  kind: 'expense' | 'income' | null;
  amount_fen: number;
  category_id: number | null;
  occurred_on: string;
  note: string;
  confidence: number;
  parser: string;
  message?: string;
}

/**
 * 文本 → 记账结构化 核心逻辑（/api/parse/text 与 /api/asr 共用；
 * asr 同响应捎带 parse，小程序"一次录音=一次网关调用"）。
 * 失败不抛错，返回 kind=null 的应答（调用方展示"没听清"引导）
 */
export async function parseTextCore(text: string): Promise<ParseTextResp> {
  const today = localDateStr();
  const failResp: ParseTextResp = {
    kind: null,
    amount_fen: 0,
    category_id: null,
    occurred_on: today,
    note: text.slice(0, 20),
    confidence: 0,
    parser: 'none',
    message: '没听清金额，请再说一遍或手动输入',
  };

  try {
    // 1) 正则层优先：确定性计算，金额不会错（实测 LLM 会把"五毛八"算成 5.8 元）
    const parsed: ParsedTxn | null = regexParse(text, today);
    if (parsed) {
      const cat = (await categoryByName(parsed.category_name, parsed.kind))
        ?? (await categoryByName(parsed.kind === 'expense' ? '其他支出' : '其他收入', parsed.kind));
      if (cat) {
        return {
          kind: parsed.kind,
          amount_fen: parsed.amount_fen,
          category_id: cat.id,
          occurred_on: parsed.occurred_on,
          note: parsed.note,
          confidence: Math.min(parsed.confidence, 0.85),
          parser: parsed.parser,
        };
      }
    }

    // 2) LLM 兜底：正则拿不到金额的复杂语句（配了智谱 key 才启用）
    if (llmAvailable()) {
      const r = await llmParseText(text);
      const cat = (await categoryByName(r.category, r.kind)) ?? (await categoryByName(r.kind === 'expense' ? '其他支出' : '其他收入', r.kind));
      if (cat) {
        return {
          kind: r.kind,
          amount_fen: r.amount_fen,
          category_id: cat.id,
          occurred_on: offsetDate(today, r.occurred_on_offset),
          note: r.note || text.slice(0, 20),
          confidence: 0.9, // LLM 偶有金额换算错，置信度低于正则上限
          parser: 'llm',
        };
      }
    }
  } catch (err) {
    console.warn('[parse] 解析异常:', (err as Error).message);
  }
  return failResp;
}

parseRouter.post('/text', async (req, res) => {
  const text = String((req.body as { text?: string })?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'text 不能为空' });
  res.json(await parseTextCore(text));
});

// 图片解析：multipart 收图（本地）或 JSON base64（云端 callContainer）→ GLM-4V-Flash → 结构化
parseRouter.post('/image', upload.single('image'), async (req, res) => {
  let imageB64 = '';
  let mime = 'image/jpeg';
  if (req.file) {
    imageB64 = req.file.buffer.toString('base64');
    mime = req.file.mimetype || mime;
  } else {
    const b64 = String((req.body as { image_base64?: string })?.image_base64 || '');
    if (b64) {
      imageB64 = b64;
      mime = String((req.body as { mime?: string })?.mime || mime);
    }
  }
  if (!imageB64) return res.status(400).json({ error: '缺少图片（字段名 image 或 JSON image_base64）' });

  const today = localDateStr();
  const fallback = {
    kind: null,
    amount_fen: 0,
    category_id: null,
    occurred_on: today,
    note: '',
    confidence: 0,
    parser: 'none',
    message: '没看清这张图，请拍清楚金额，或者手动输入',
  };

  if (!llmAvailable()) {
    return res.json({ ...fallback, message: '图片识别未配置（缺少 ZHIPU_API_KEY），请手动输入' });
  }

  try {
    const r = await llmParseImage(imageB64, mime);
    if (!r.found) return res.json(fallback);
    const cat = (await categoryByName(r.category, r.kind)) ?? (await categoryByName(r.kind === 'expense' ? '其他支出' : '其他收入', r.kind));
    if (!cat) return res.json(fallback);
    return res.json({
      kind: r.kind,
      amount_fen: r.amount_fen,
      category_id: cat.id,
      occurred_on: today, // 支付截图默认记当天；小票历史日期 M4 实测后再放开
      note: r.note || '',
      confidence: 0.9,
      parser: 'glm4v',
    });
  } catch (err) {
    console.warn('[parse/image] GLM-4V 失败:', (err as Error).message);
    return res.json(fallback);
  }
});
