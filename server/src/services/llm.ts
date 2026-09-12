// GLM-4-Flash 文本解析（免费 API）。失败/超时由调用方兜底到正则层。
import { config } from '../config';

const CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const SYSTEM_PROMPT = `你是记账助手。从老人的口语账目描述中提取结构化信息，只输出 JSON，不要输出其他内容。
字段：
- kind: "expense"(支出) 或 "income"(收入)
- amount_fen: 金额（整数，单位分）。"十五块五"=1550，"两块五"=250，"三百"=30000
- category: 从以下选一个最贴近的：吃饭买菜/医疗药品/水电日用/交通出行/人情往来/穿衣打扮/休闲娱乐/其他支出/退休金/子女给/其他收入
- occurred_on_offset: 0=今天，-1=昨天，-2=前天，-3=大前天（没提日期就是0）
- note: 原文摘要（不超过20字）
例子：
"今天买菜花了十五块五" → {"kind":"expense","amount_fen":1550,"category":"吃饭买菜","occurred_on_offset":0,"note":"买菜"}
"昨天儿子给我两千块" → {"kind":"income","amount_fen":200000,"category":"子女给","occurred_on_offset":-1,"note":"儿子给钱"}`;

export interface LlmParsed {
  kind: 'expense' | 'income';
  amount_fen: number;
  category: string;
  occurred_on_offset: number;
  note: string;
}

const VISION_PROMPT = `你是记账助手。这张图可能是支付成功截图、账单截图或购物小票照片。提取记账信息，只输出 JSON，不要输出其他内容。
字段：
- found: 图片中是否找到明确的交易金额（true/false）
- kind: "expense"(付款/支出) 或 "income"(收款/到账/退款)
- amount_fen: 金额（整数，单位分）。"¥15.50"=1550，"1,200元"=120000。取最主要的一笔
- category: 最贴近的一个：吃饭买菜/医疗药品/水电日用/交通出行/人情往来/穿衣打扮/休闲娱乐/其他支出/退休金/子女给/其他收入
- note: 商家名或内容摘要（不超过12字）
没有找到金额就输出 {"found": false}，其他字段省略。`;

function stripJsonFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

/** GLM-4V-Flash 图片解析（支付截图/小票 → 记账信息）。失败抛错，调用方兜底。 */
export async function llmParseImage(imageBase64: string, mime: string): Promise<LlmParsed & { found: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000); // 视觉模型比文本慢
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.zhipuApiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4v-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
              { type: 'text', text: VISION_PROMPT },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`zhipu http ${resp.status}`);
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(stripJsonFence(content)) as LlmParsed & { found: boolean };
    if (!parsed.found) return { ...parsed, found: false };
    if (!['expense', 'income'].includes(parsed.kind)) throw new Error('bad kind');
    if (!Number.isInteger(parsed.amount_fen) || parsed.amount_fen <= 0) throw new Error('bad amount');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export function llmAvailable(): boolean {
  return config.llmProvider === 'zhipu' && !!config.zhipuApiKey && !config.zhipuApiKey.includes('在此粘贴');
}

export async function llmParseText(text: string): Promise<LlmParsed> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.zhipuApiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`zhipu http ${resp.status}`);
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as LlmParsed;
    // 基本合法性校验，脏数据直接当失败
    if (!['expense', 'income'].includes(parsed.kind)) throw new Error('bad kind');
    if (!Number.isInteger(parsed.amount_fen) || parsed.amount_fen <= 0) throw new Error('bad amount');
    if (!Number.isFinite(parsed.occurred_on_offset)) parsed.occurred_on_offset = 0;
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
