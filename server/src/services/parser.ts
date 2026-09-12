// 正则解析兜底层：不依赖外部 LLM，老人口语先过这里
// 设计目标：金额 + 日期 + 分类三要素，全离线、零成本、毫秒级

export interface ParsedTxn {
  kind: 'expense' | 'income';
  amount_fen: number;
  category_name: string; // 由路由层映射到 category_id
  occurred_on: string;
  note: string;
  confidence: number;
  parser: 'regex' | 'llm';
}

const CN_DIGIT: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

/**
 * 中文数字 → 数值。支持口语省略：
 *   十五=15  一百二=120  一千五=1500  两百=200  三千零五=3005  一万二=12000
 * 纯阿拉伯数字串原样返回。解析失败返回 -1。
 */
export function parseCnNumber(s: string): number {
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  let total = 0; // 万位以上累计
  let section = 0; // 当前万以内段
  let num = 0;
  for (const ch of s) {
    if (CN_DIGIT[ch] !== undefined) {
      num = CN_DIGIT[ch];
    } else if (ch in CN_UNIT) {
      const u = CN_UNIT[ch];
      if (u === 10000) {
        total = (section + (num || 1)) * 10000;
        section = 0;
      } else {
        // 口语省略："一百二"的"二"其实表示 20、"一千五"的"五"表示 500
        section += (num || 1) * u;
        num = 0;
      }
    } else {
      return -1;
    }
  }
  // 尾部裸数字接在百/千后：乘 unit/10（一百二 → 2*10；一千五 → 5*100）
  let result = total + section + num;
  if (num > 0 && section > 0) {
    const lastUnitMatch = s.match(/[百千](?=[一二两三四五六七八九]$)/);
    if (lastUnitMatch) result = total + section + num * (lastUnitMatch[0] === '百' ? 10 : 100);
  }
  return result > 0 ? result : -1;
}

/** 中文金额短语 → 分；失败返回 -1 */
function cnAmountToFen(intPart: string, jiao: string, fenDigit: string): number {
  const yuan = parseCnNumber(intPart);
  if (yuan < 0) return -1;
  const j = jiao ? CN_DIGIT[jiao] ?? 0 : 0;
  const f = fenDigit ? CN_DIGIT[fenDigit] ?? 0 : 0;
  return Math.round(yuan * 100 + j * 10 + f);
}

/**
 * 从语音文本提取金额（分）。找不到返回 -1。
 * 覆盖：15块 / 15.5元 / 十五块五 / 两块五毛 / 一块零五分 / 五毛八
 * 注意：FunASR ITN 输出数字与单位间常带空格（"15 块"），各处 \s* 容错
 */
export function extractAmountFen(text: string): number {
  // 1) 阿拉伯数字 + 块/元
  let m = text.match(/(\d+(?:\.\d+)?)\s*(?:块钱|块|元)/);
  if (m) return Math.round(parseFloat(m[1]) * 100);
  // 2) 中文数字 + 块/元（口语"十二块五"的"五"= 5毛，毛/角/分字均可省略）
  m = text.match(/([零一二两三四五六七八九十百千]+)\s*(?:块钱|块|元)\s*(?:零?([一二三四五六七八九])\s*[毛角]?)?(?:零?([一二三四五六七八九])\s*分?)?/);
  if (m) return cnAmountToFen(m[1], m[2], m[3]);
  // 3) 纯毛/角/分（五毛、三毛八、五毛八分）
  m = text.match(/([一二三四五六七八九两\d])\s*[毛角]\s*(?:零?([一二三四五六七八九])\s*分?)?/);
  if (m) {
    const j = CN_DIGIT[m[1]] ?? (Number.isNaN(Number(m[1])) ? -1 : Number(m[1]));
    if (j >= 0) return j * 10 + (m[2] ? CN_DIGIT[m[2]] ?? 0 : 0);
  }
  // 4) 动词 + 裸数字（"交了三百"省略单位、"花了 15"、"给我一百二"）
  m = text.match(/(?:花了?|交了?|付了?|用[了去]?|收了?|给[了我]|消费|支付)\s*了?\s*(\d+(?:\.\d+)?|[零一二两三四五六七八九十百千]+)/);
  if (m) {
    const v = parseCnNumber(m[1]);
    if (v >= 0) return Math.round(v * 100);
  }
  return -1;
}

/** 分类同义词表（与 DB 种子分类对应，路由层负责 name→id） */
const CATEGORY_SYNONYMS: Array<{ name: string; kind: 'expense' | 'income'; re: RegExp }> = [
  { name: '吃饭买菜', kind: 'expense', re: /吃饭|买菜|买[菜面肉鱼米油]|菜|早饭|午饭|晚饭|早餐|午餐|晚餐|餐|水果|超市|市场|外卖|面条|鸡蛋|牛奶|面包/ },
  { name: '医疗药品', kind: 'expense', re: /药|医院|看病|挂号|医生|门诊|住院|体检|血压|血糖|打针|输液|检查/ },
  { name: '水电日用', kind: 'expense', re: /水电|电费|水费|燃气|煤气|天然气|物业|话费|充值|网费|宽带|日用|纸巾|洗衣粉/ },
  { name: '交通出行', kind: 'expense', re: /公交|地铁|打车|出租|乘车|坐车|车费|加油|停车|过路|火车|高铁|机票|骑车/ },
  { name: '人情往来', kind: 'expense', re: /红包|人情|随礼|份子|送礼|礼物|压岁|婚礼|丧事|探望/ },
  { name: '穿衣打扮', kind: 'expense', re: /衣服|衣裳|鞋|裤子|帽|袜|外套|棉袄|裙子|打扮|理发|剪头发/ },
  { name: '休闲娱乐', kind: 'expense', re: /玩|旅游|麻将|扑克|下棋|唱歌|跳舞|戏曲|电视|电影|公园|钓鱼|健身/ },
  { name: '退休金', kind: 'income', re: /退休金|养老金|工资|补贴|补助|社保|发钱/ },
  { name: '子女给', kind: 'income', re: /儿子|女儿|孩子|子女|孙子|孙女|外孙|闺女|小伙[子儿].{0,4}给|给[了的]\s*\d*块钱/ },
];

/** 日期词 → 相对日期描述（路由层换算成具体日期）。注意"大前天"要先于"前天"判断 */
export function extractDateOffset(text: string): number {
  if (/今天|今日/.test(text)) return 0;
  if (/昨天|昨日/.test(text)) return -1;
  if (/大前天|大前日/.test(text)) return -3;
  if (/前天|前日/.test(text)) return -2;
  return 0; // 默认今天
}

/** 分类匹配：返回第一个命中的分类；都不中返回 null（路由层落到"其他"） */
export function matchCategory(text: string): { name: string; kind: 'expense' | 'income' } | null {
  for (const c of CATEGORY_SYNONYMS) {
    if (c.re.test(text)) return { name: c.name, kind: c.kind };
  }
  return null;
}

/** 正则解析主入口 */
export function regexParse(text: string, today: string): ParsedTxn | null {
  const amountFen = extractAmountFen(text);
  if (amountFen <= 0) return null; // 没金额就没法记账

  const cat = matchCategory(text);
  let amountConf = 0.6;
  // "十五块五"这类带角分的口语 → 命中规则更精确
  if (/块|元/.test(text)) amountConf = 0.75;

  const offset = extractDateOffset(text);
  const occurred_on = offsetDate(today, offset);

  return {
    kind: cat?.kind ?? 'expense',
    amount_fen: amountFen,
    category_name: cat?.name ?? (cat ? cat.name : '其他支出'),
    occurred_on,
    note: text.slice(0, 50),
    confidence: amountConf + (cat ? 0.1 : 0),
    parser: 'regex',
  };
}

function offsetDate(today: string, offset: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
