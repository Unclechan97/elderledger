// GLM-4-Flash 文本解析（免费 API）。失败/超时由调用方兜底到正则层。
import { config } from '../config';

const CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const SYSTEM_PROMPT = `你是记账助手。从老人的口语账目描述中提取结构化信息，只输出 JSON，不要输出其他内容。
字段：
- kind: "expense"(支出) 或 "income"(收入)
- amount_fen: 金额（整数，单位分）。"十五块五"=1550，"两块五"=250，"三百"=30000
- category: 从以下选一个最贴近的：吃饭买菜/医疗药品/水电日用/交通出行/人情往来/穿衣打扮/休闲娱乐/其他支出/退休金/子女给/其他收入
- occurred_on_offset: 0=今天，-1=昨天，-2=前天（没提日期就是0）
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

export function llmAvailable(): boolean {
  return config.LLM_PROVIDER === 'zhipu' && !!config.ZHIPU_API_KEY && !config.ZHIPU_API_KEY.includes('在此粘贴');
}

export async function llmParseText(text: string): Promise<LlmParsed> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ZHIPU_API_KEY}`,
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
