import { BASE_URL, API_MODE, CLOUD_ENV, CLOUD_SERVICE } from '../utils/config';
import { identityHeaders } from '../utils/identity';

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: 'expense' | 'income';
  sort: number;
}

export interface Categories {
  expense: Category[];
  income: Category[];
}

export interface TxnItem {
  id: number;
  kind: 'expense' | 'income';
  amount_fen: number;
  occurred_on: string;
  note: string;
  source: string;
  category_name: string;
  category_icon: string;
  category_color: string;
}

export interface TxnListResp {
  items: TxnItem[];
  total: number;
  page: number;
  pageSize: number;
  expense_fen: number;
  income_fen: number;
}

export interface SummaryResp {
  month: string;
  total_fen: number;
  prev_total_fen: number;
  diff_last_month_fen: number;
  income_total_fen: number;
  by_expense_category: Array<{ category_id: number; name: string; icon: string; color: string; total_fen: number; cnt: number }>;
  by_income_category: Array<{ category_id: number; name: string; icon: string; color: string; total_fen: number; cnt: number }>;
}

function httpError(data: unknown, statusCode: number): Error {
  const d = data as { error?: string; detail?: string } | undefined;
  const msg = [d?.error, d?.detail].filter(Boolean).join('｜');
  return new Error(msg || `HTTP ${statusCode}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const GATEWAY_FAIL_RE = /-606\d{3}|system ?error/i;

/**
 * 云托管网关偶发 -606001（请求未到容器即被拒，实测一次突发可持续数秒~十几秒）。
 * 客户端 2s/4s 自动重试（最多 3 次尝试），老人无感；写操作靠 client_token 幂等兜底防重复入库
 */
async function gatewayRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e ?? '');
      if (i >= 2 || API_MODE !== 'cloud' || !GATEWAY_FAIL_RE.test(msg)) throw e;
      console.warn(`[api] 网关瞬时失败，${(i + 1) * 2}s 后重试:`, msg.slice(0, 80));
      await sleep((i + 1) * 2000);
    }
  }
}

/** 云托管通道：callContainer（免域名免备案，自动注入 x-wx-openid 身份） */
function cloudRequest<T>(method: string, path: string, data?: unknown, header?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path,
      method: method as 'GET',
      header: { 'X-WX-SERVICE': CLOUD_SERVICE, ...(header || {}) },
      data,
      success: (r) => {
        if (r.statusCode < 400) resolve(r.data as T);
        else reject(httpError(r.data, r.statusCode));
      },
      fail: (e) => reject(new Error(e.errMsg || '云调用失败，请检查网络')),
    });
  });
}

function request<T>(method: 'GET' | 'POST' | 'DELETE', url: string, data?: Record<string, unknown>): Promise<T> {
  const header = identityHeaders();
  if (API_MODE === 'cloud') return gatewayRetry(() => cloudRequest<T>(method, url, data, header));
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header,
      success: (r) => {
        if (r.statusCode < 400) resolve(r.data as T);
        else reject(httpError(r.data, r.statusCode));
      },
      fail: (e) => reject(new Error(e.errMsg || '网络错误')),
    });
  });
}

export function getCategories(): Promise<Categories> {
  return request<Categories>('GET', '/api/categories');
}

export function createTransaction(p: {
  kind: 'expense' | 'income';
  amount_fen: number;
  category_id: number;
  occurred_on: string;
  note?: string;
  source?: string;
  confidence?: number;
  client_token?: string; // 幂等键：网关重试/双击防重复入库
}): Promise<{ id: number }> {
  return request<{ id: number }>('POST', '/api/transactions', p);
}

export function getTransactions(range: 'today' | 'month', page = 1, pageSize = 20): Promise<TxnListResp> {
  return request<TxnListResp>('GET', `/api/transactions?range=${range}&page=${page}&pageSize=${pageSize}`);
}

export function deleteTransaction(id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('DELETE', `/api/transactions/${id}`);
}

export function getSummary(): Promise<SummaryResp> {
  return request<SummaryResp>('GET', '/api/summary?period=month');
}

export interface ParseResult {
  kind: 'expense' | 'income' | null;
  amount_fen: number;
  category_id: number | null;
  occurred_on: string;
  note: string;
  confidence: number;
  parser: string;
  message?: string;
}

export function parseText(text: string): Promise<ParseResult> {
  return request<ParseResult>('POST', '/api/parse/text', { text });
}

/** 录音文件上传转写（multipart，字段名 audio） */
export function uploadAsr(filePath: string): Promise<{ text: string }> {
  return uploadFileAs<{ text: string }>(filePath, 'audio', '/api/asr');
}

/** 图片上传解析（multipart，字段名 image）→ GLM-4V 结构化记账信息 */
export function parseImage(filePath: string): Promise<ParseResult> {
  return uploadFileAs<ParseResult>(filePath, 'image', '/api/parse/image');
}

// ── M5 家人协同 ────────────────────────────────────────────

export interface MeResp {
  id: number;
  nickname: string;
  role: 'elder' | 'family';
  family_of: number | null;
  invite_code: string | null;
  elder: { id: number; nickname: string } | null;
}

export function getMe(): Promise<MeResp> {
  return request<MeResp>('GET', '/api/family/me');
}

export function createInvite(): Promise<{ invite_code: string }> {
  return request<{ invite_code: string }>('POST', '/api/family/invite', {});
}

export function bindFamily(code: string): Promise<{ family_user_id: number; elder: { id: number; nickname: string } }> {
  return request<{ family_user_id: number; elder: { id: number; nickname: string } }>('POST', '/api/family/bind', { code });
}

export interface ElderSummary {
  id: number;
  nickname: string;
  expense_fen: number;
  income_fen: number;
  month_count: number;
}

export function getElders(): Promise<{ elders: ElderSummary[] }> {
  return request<{ elders: ElderSummary[] }>('GET', '/api/family/elders');
}

/** CSV 导出 → 返回本地文件路径（local: downloadFile；cloud: 文本响应写临时文件） */
export async function getExportCsv(month: string): Promise<string> {
  if (API_MODE === 'local') {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: `${BASE_URL}/api/export/csv?month=${month}`,
        header: identityHeaders(),
        success: (r) => {
          if (r.statusCode < 400) resolve(r.tempFilePath);
          else reject(new Error(`HTTP ${r.statusCode}`));
        },
        fail: (e) => reject(new Error(e.errMsg || '下载失败')),
      });
    });
  }
  const csv = await request<string>('GET', `/api/export/csv?month=${month}`);
  const filePath = `${wx.env.USER_DATA_PATH}/bill-${month}.csv`;
  await new Promise<void>((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: csv,
      encoding: 'utf8',
      success: () => resolve(),
      fail: (e) => reject(new Error(e.errMsg || '写文件失败')),
    });
  });
  return filePath;
}

/** 家人解除绑定（角色回老人；也用于云端调试切回身份） */
export function unbindFamily(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('POST', '/api/family/unbind', {});
}

/** 语音播报音频（base64，两条通道同一形状） */
export function getTtsAudio(text: string): Promise<{ audio_base64: string }> {
  return request<{ audio_base64: string }>('POST', '/api/tts', { text });
}

function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(String(r.data)),
      fail: (e) => reject(new Error(e.errMsg || '读文件失败')),
    });
  });
}

function guessMime(name: string, filePath: string): string {
  const p = filePath.toLowerCase();
  if (name === 'audio') return p.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
  return p.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/**
 * 文件上传：local 走 wx.uploadFile（multipart）；cloud 走 callContainer JSON base64
 * （callContainer 不支持 multipart，服务端两条通道都收）
 */
async function uploadFileAs<T>(filePath: string, name: string, url: string): Promise<T> {
  if (API_MODE === 'local') {
    return new Promise<T>((resolve, reject) => {
      wx.uploadFile({
        url: `${BASE_URL}${url}`,
        filePath,
        name,
        header: identityHeaders(),
        success: (r) => {
          try {
            const data = JSON.parse(r.data) as T & { error?: string; detail?: string };
            if (r.statusCode < 400) resolve(data);
            else reject(new Error([data.error, data.detail].filter(Boolean).join('｜') || `HTTP ${r.statusCode}`));
          } catch {
            reject(new Error(`响应不是 JSON（HTTP ${r.statusCode}）`));
          }
        },
        fail: (e) => reject(new Error(e.errMsg || '上传失败')),
      });
    });
  }
  const b64 = await readFileBase64(filePath);
  return request<T>('POST', url, { [`${name}_base64`]: b64, mime: guessMime(name, filePath) });
}
