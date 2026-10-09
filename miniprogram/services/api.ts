import { BASE_URL, API_MODE, CLOUD_ENV, CLOUD_SERVICE, DIRECT_BASE, APP_SHARED_KEY } from '../utils/config';
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

function httpError(data: unknown, statusCode: number): Error & { statusCode?: number } {
  const d = data as { error?: string; detail?: string } | undefined;
  const msg = [d?.error, d?.detail].filter(Boolean).join('｜') || `HTTP ${statusCode}`;
  const e = new Error(msg) as Error & { statusCode?: number };
  e.statusCode = statusCode; // openRequest 靠它区分"服务端拒绝（不回退）"与"网络失败（回退）"
  return e;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const GATEWAY_FAIL_RE = /-606\d{3}|system ?error/i;

/**
 * 云托管网关偶发 -606001（请求未到容器即被拒，实测一次突发可持续数秒~十几秒）。
 * 客户端 2s/4s 自动重试（最多 3 次尝试），老人无感；写操作靠 client_token 幂等兜底防重复入库
 */
async function gatewayRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [2000, 6000, 12000]; // 频控窗口实测可达 1 分钟，梯度拉长；配合每笔账 2 次调用降低触发
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e ?? '');
      if (i >= delays.length || API_MODE !== 'cloud' || !GATEWAY_FAIL_RE.test(msg)) throw e;
      console.warn(`[api] 网关瞬时失败，${delays[i] / 1000}s 后重试:`, msg.slice(0, 80));
      await sleep(delays[i]);
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
  // x-app-key 全通道必带：直连失败回落 callContainer 时，开放端点同样要过服务端 openApiGuard
  const header = { 'x-app-key': APP_SHARED_KEY, ...identityHeaders() };
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

/** 开放端点请求头：直连/网关通道都带共享密钥（服务端 openApiGuard 校验） */
function openHeader(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-app-key': APP_SHARED_KEY };
}

/** 公网直连请求（开放端点 JSON 用；绕开 callContainer 网关，无 -606001） */
function directRequest<T>(method: string, path: string, data?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${DIRECT_BASE}${path}`,
      method: method as 'GET',
      data,
      header: openHeader(),
      success: (r) => {
        if (r.statusCode < 400) resolve(r.data as T);
        else reject(httpError(r.data, r.statusCode));
      },
      fail: (e) => reject(new Error(e.errMsg || '直连请求失败')),
    });
  });
}

/**
 * 开放端点（asr/tts/parse，无用户数据）统一入口：直连优先，
 * 网络级失败/5xx 回退 callContainer（自带 gatewayRetry）；服务端 4xx 说明通道是通的，直接抛
 */
async function openRequest<T>(method: 'GET' | 'POST', url: string, data?: Record<string, unknown>): Promise<T> {
  if (API_MODE === 'cloud' && DIRECT_BASE) {
    try {
      return await directRequest<T>(method, url, data);
    } catch (e) {
      const status = (e as Error & { statusCode?: number }).statusCode;
      if (status && status < 500) throw e;
      console.warn('[api] 直连失败，回退 callContainer:', String((e as Error).message).slice(0, 80));
    }
  }
  return request<T>(method, url, data);
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
}): Promise<{ id: number; month_total_fen?: number }> {
  return request<{ id: number; month_total_fen?: number }>('POST', '/api/transactions', p);
}

export function getTransactions(range: 'today' | 'month' | 'all', page = 1, pageSize = 20): Promise<TxnListResp> {
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
  return openRequest<ParseResult>('POST', '/api/parse/text', { text });
}

/** 录音文件上传转写（multipart，字段名 audio）；响应捎带 parse（服务端合并解析，省一次网关调用） */
export function uploadAsr(filePath: string): Promise<{ text: string; parse?: ParseResult }> {
  return uploadFileAs<{ text: string; parse?: ParseResult }>(filePath, 'audio', '/api/asr');
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
  return openRequest<{ audio_base64: string }>('POST', '/api/tts', { text });
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

/** wx.uploadFile（multipart）：本地通道 + 云端公网直连通道共用（体积比 base64 JSON 小 1/3） */
function multipartUpload<T>(base: string, filePath: string, name: string, url: string, header: Record<string, string>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.uploadFile({
      url: `${base}${url}`,
      filePath,
      name,
      header,
      success: (r) => {
        try {
          const data = JSON.parse(r.data) as T & { error?: string; detail?: string };
          if (r.statusCode < 400) resolve(data);
          else reject(httpError(data, r.statusCode));
        } catch {
          reject(new Error(`响应不是 JSON（HTTP ${r.statusCode}）`));
        }
      },
      fail: (e) => reject(new Error(e.errMsg || '上传失败')),
    });
  });
}

/**
 * 文件上传三通道：公网直连 multipart 优先（绕开 callContainer 网关 -606001，网络级失败/5xx 回退），
 * local 走 wx.uploadFile multipart；兜底 callContainer JSON base64（其不支持 multipart）
 */
async function uploadFileAs<T>(filePath: string, name: string, url: string): Promise<T> {
  if (API_MODE === 'cloud' && DIRECT_BASE) {
    try {
      return await multipartUpload<T>(DIRECT_BASE, filePath, name, url, { 'x-app-key': APP_SHARED_KEY });
    } catch (e) {
      const status = (e as Error & { statusCode?: number }).statusCode;
      if (status && status < 500) throw e; // 服务端明确拒绝（密钥/参数问题），通道是通的，不回退
      console.warn('[api] 直连上传失败，回退 callContainer:', String((e as Error).message).slice(0, 80));
    }
  }
  if (API_MODE === 'local') {
    return multipartUpload<T>(BASE_URL, filePath, name, url, { 'x-app-key': APP_SHARED_KEY, ...identityHeaders() });
  }
  const b64 = await readFileBase64(filePath);
  return request<T>('POST', url, { [`${name}_base64`]: b64, mime: guessMime(name, filePath) });
}
