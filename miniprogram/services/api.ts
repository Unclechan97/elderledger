import { BASE_URL } from '../utils/config';

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
