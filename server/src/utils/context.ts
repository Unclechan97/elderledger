// 本地开发阶段的身份上下文：请求头 X-User-Id 模拟登录态，X-View-As 模拟家人查看老人
// 上线后 X-User-Id 换成 code2Session 解出的 openid 对应用户，接口形状不变
import { Request } from 'express';
import { db, DEFAULT_USER_ID } from '../db/sqlite';

export function resolveUserId(req: Request): number {
  const id = Number(req.headers['x-user-id']);
  if (Number.isInteger(id) && id > 0) {
    const u = db.prepare('SELECT id FROM user WHERE id = ?').get(id);
    if (u) return id;
  }
  return DEFAULT_USER_ID;
}

/** 家人查老人：X-View-As 仅对已绑定的 family 用户生效，否则回落到自己（防越权） */
export function resolveViewUserId(req: Request, selfId: number): number {
  const id = Number(req.headers['x-view-as']);
  if (!Number.isInteger(id) || id <= 0) return selfId;
  const self = db.prepare('SELECT role, family_of FROM user WHERE id = ?').get(selfId) as
    | { role: string; family_of: number | null }
    | undefined;
  if (self?.role === 'family' && self.family_of === id) return id;
  return selfId;
}
