// M5 家人协同：邀请码绑定 + 家人只读视角
// POST /api/family/invite  老人生成/刷新邀请码
// POST /api/family/bind    家人凭码绑定 → 创建 family 用户
// GET  /api/family/me      当前身份信息（老人带邀请码；家人带绑定老人）
// GET  /api/family/elders  家人已绑定的老人列表（含本月汇总）
import { Router } from 'express';
import { db } from '../db/sqlite';
import { resolveUserId } from '../utils/context';
import { localDateStr } from '../utils/dates';

export const familyRouter = Router();

// 去掉易混字符（0/O/1/I/L）的 6 位邀请码
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genInviteCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** GET /api/family/me */
familyRouter.get('/me', (req, res) => {
  const selfId = resolveUserId(req);
  const u = db.prepare('SELECT id, openid, nickname, role, family_of, invite_code FROM user WHERE id = ?').get(selfId) as
    | { id: number; openid: string; nickname: string; role: string; family_of: number | null; invite_code: string | null }
    | undefined;
  if (!u) return res.status(404).json({ error: '用户不存在' });

  if (u.role === 'family' && u.family_of) {
    const elder = db.prepare('SELECT id, nickname FROM user WHERE id = ?').get(u.family_of) as
      | { id: number; nickname: string }
      | undefined;
    return res.json({ ...u, elder: elder ?? null });
  }
  return res.json({ ...u, elder: null });
});

/** POST /api/family/invite —— 老人生成/刷新邀请码 */
familyRouter.post('/invite', (req, res) => {
  const selfId = resolveUserId(req);
  const code = genInviteCode();
  db.prepare('UPDATE user SET invite_code = ? WHERE id = ?').run(code, selfId);
  res.json({ invite_code: code });
});

/** POST /api/family/bind { code } —— 家人绑定老人 */
familyRouter.post('/bind', (req, res) => {
  const code = String((req.body as { code?: string })?.code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return res.status(400).json({ error: '邀请码格式不对' });

  const elder = db.prepare('SELECT id, nickname FROM user WHERE invite_code = ?').get(code) as
    | { id: number; nickname: string }
    | undefined;
  if (!elder) return res.status(404).json({ error: '邀请码无效，请让老人重新生成' });

  // 本地开发：家人身份也是模拟的（一个绑定一个家人用户）；上线后此处由 openid 建/查
  const openid = `family-${elder.id}-${Date.now()}`;
  const info = db
    .prepare('INSERT INTO user (openid, nickname, role, family_of) VALUES (?, ?, ?, ?)')
    .run(openid, '家人', 'family', elder.id);

  res.status(201).json({
    family_user_id: info.lastInsertRowid,
    elder: { id: elder.id, nickname: elder.nickname },
  });
});

/** GET /api/family/elders —— 家人视角：已绑老人 + 本月汇总 */
familyRouter.get('/elders', (req, res) => {
  const selfId = resolveUserId(req);
  const self = db.prepare('SELECT role, family_of FROM user WHERE id = ?').get(selfId) as
    | { role: string; family_of: number | null }
    | undefined;
  if (!self || self.role !== 'family' || !self.family_of) return res.json({ elders: [] });

  const monthPrefix = localDateStr().slice(0, 7);
  const elders = db
    .prepare(
      `SELECT u.id, u.nickname,
              COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_fen ELSE 0 END), 0) AS expense_fen,
              COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount_fen ELSE 0 END), 0) AS income_fen,
              COUNT(t.id) AS month_count
       FROM user u
       LEFT JOIN txn t ON t.user_id = u.id AND t.occurred_on LIKE ?
       WHERE u.id = ?
       GROUP BY u.id`,
    )
    .all(`${monthPrefix}-%`, self.family_of);
  res.json({ elders });
});
