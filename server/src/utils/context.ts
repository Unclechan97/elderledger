// 身份上下文：
// - 云端（微信云托管）：callContainer 自动注入 x-wx-openid 请求头，按 openid 建/查用户
// - 本地开发：请求头 X-User-Id 模拟登录态，X-View-As 模拟家人查看老人
import { Request } from 'express';
import { db, defaultUserId } from '../db/db';

export async function resolveUserId(req: Request): Promise<number> {
  // 云端优先：openid 是唯一权威身份，存在时不认 X-User-Id（防串号）
  const openid = req.header('x-wx-openid');
  if (openid) {
    const u = await db.get<{ id: number }>('SELECT id FROM user WHERE openid = ?', [openid]);
    if (u) return u.id;
    try {
      // 首次调用自动建档（老人身份；绑定邀请码后转 family）
      const info = await db.run("INSERT INTO user (openid, nickname, role) VALUES (?, '微信用户', 'elder')", [openid]);
      return info.insertId;
    } catch {
      // 并发首调撞 UNIQUE：回读即可
      const again = await db.get<{ id: number }>('SELECT id FROM user WHERE openid = ?', [openid]);
      if (again) return again.id;
      throw new Error('用户建档失败');
    }
  }
  // 本地开发：X-User-Id 模拟登录态
  const id = Number(req.headers['x-user-id']);
  if (Number.isInteger(id) && id > 0) {
    const u = await db.get('SELECT id FROM user WHERE id = ?', [id]);
    if (u) return id;
  }
  return defaultUserId();
}

/** 家人查老人：X-View-As 仅对已绑定的 family 用户生效，否则回落到自己（防越权） */
export async function resolveViewUserId(req: Request, selfId: number): Promise<number> {
  const id = Number(req.headers['x-view-as']);
  if (!Number.isInteger(id) || id <= 0) return selfId;
  const self = await db.get<{ role: string; family_of: number | null }>('SELECT role, family_of FROM user WHERE id = ?', [selfId]);
  if (self?.role === 'family' && self.family_of === id) return id;
  return selfId;
}
