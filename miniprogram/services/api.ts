import { BASE_URL } from '../utils/config';
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
  by_category: Array<{ category_id: number; name: string; icon: string; color: string; total_fen: number; cnt: number }>;
}

function request<T>(method: 'GET' | 'POST' | 'DELETE', url: string, data?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: identityHeaders(),
      success: (r) => {
        if (r.statusCode < 400) resolve(r.data as T);
        else reject(new Error((r.data as { error?: string })?.error || `HTTP ${r.statusCode}`));
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

/** CSV 导出下载地址（wx.downloadFile 用，header 单独传 identityHeaders()） */
export function exportCsvUrl(month: string): string {
  return `${BASE_URL}/api/export/csv?month=${month}`;
}

function uploadFileAs<T>(filePath: string, name: string, url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}${url}`,
      filePath,
      name,
      header: identityHeaders(),
      success: (r) => {
        try {
          const data = JSON.parse(r.data) as T & { error?: string };
          if (r.statusCode < 400) resolve(data);
          else reject(new Error(data.error || `HTTP ${r.statusCode}`));
        } catch {
          reject(new Error(`响应不是 JSON（HTTP ${r.statusCode}）`));
        }
      },
      fail: (e) => reject(new Error(e.errMsg || '上传失败')),
    });
  });
}
