// 身份：storage 存"我是谁"（本地模拟）和"我在代看谁"（家人代看，云端本地都用）
import { API_MODE } from './config';

const KEY_USER = 'user_id';
const KEY_VIEW_AS = 'view_as_id';
const KEY_VIEW_NAME = 'view_as_name';

function get(key: string): string {
  try {
    const v = wx.getStorageSync(key);
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

function set(key: string, value: string): void {
  try {
    if (value) wx.setStorageSync(key, value);
    else wx.removeStorageSync(key);
  } catch {
    /* 存储异常不阻塞记账 */
  }
}

/** 当前登录用户（空 = 服务端默认老人） */
export function getUserId(): string {
  return get(KEY_USER);
}

export function setUserId(id: string): void {
  set(KEY_USER, id);
}

/** 家人代看对象（空 = 看自己的账本） */
export function getViewAsId(): string {
  return get(KEY_VIEW_AS);
}

export function getViewAsName(): string {
  return get(KEY_VIEW_NAME);
}

export function setViewAs(id: string, name: string): void {
  set(KEY_VIEW_AS, id);
  set(KEY_VIEW_NAME, name);
}

export function clearViewAs(): void {
  set(KEY_VIEW_AS, '');
  set(KEY_VIEW_NAME, '');
}

/** 统一请求头：本地模拟 X-User-Id；云端身份由 callContainer 注入的 openid 决定，只传代看视角 */
export function identityHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_MODE === 'local') {
    const uid = getUserId();
    if (uid) h['X-User-Id'] = uid;
  }
  const vid = getViewAsId();
  if (vid) h['X-View-As'] = vid;
  return h;
}
