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

export function getCategories(): Promise<Categories> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/api/categories`,
      method: 'GET',
      success: (r) => {
        if (r.statusCode === 200) resolve(r.data as Categories);
        else reject(new Error(`HTTP ${r.statusCode}`));
      },
      fail: (e) => reject(new Error(e.errMsg || '网络错误')),
    });
  });
}
