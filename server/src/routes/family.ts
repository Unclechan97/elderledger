// M5 家人协同：邀请码绑定 + 家人只读视角
// POST /api/family/invite  老人生成/刷新邀请码
// POST /api/family/bind    家人凭码绑定 → family 用户
// POST /api/family/unbind  家人解绑（角色回老人）
// GET  /api/family/me      当前身份信息（老人带邀请码；家人带绑定老人）
// GET  /api/family/elders  家人已绑定的老人列表（含本月汇总）
import { Router } from 'express';
import { db } from '../db/db';
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
familyRouter.get('/me', async (req, res) => {
  const selfId = await resolveUserId(req);
  const u = await db.get<{ id: number; openid: string; nickname: string; role: string; family_of: number | null; invite_code: string | null }>(
    'SELECT id, openid, nickname, role, family_of, invite_code FROM user WHERE id = ?',
    [selfId],
  );
  if (!u) return res.status(404).json({ error: '用户不存在' });

  if (u.role === 'family' && u.family_of) {
    const elder = await db.get<{ id: number; nickname: string }>('SELECT id, nickname FROM user WHERE id = ?', [u.family_of]);
    return res.json({ ...u, elder: elder ?? null });
  }
  return res.json({ ...u, elder: null });
});

/** POST /api/family/invite —— 老人生成/刷新邀请码 */
familyRouter.post('/invite', async (req, res) => {
  const selfId = await resolveUserId(req);
  const code = genInviteCode();
  await db.run('UPDATE user SET invite_code = ? WHERE id = ?', [code, selfId]);
  res.json({ invite_code: code });
});

/** POST /api/family/bind { code } —— 家人绑定老人 */
familyRouter.post('/bind', async (req, res) => {
  const code = String((req.body as { code?: string })?.code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return res.status(400).json({ error: '邀请码格式不对' });

  const elder = await db.get<{ id: number; nickname: string }>('SELECT id, nickname FROM user WHERE invite_code = ?', [code]);
  if (!elder) return res.status(404).json({ error: '邀请码无效，请让老人重新生成' });

  // 云端：callContainer 注入真实 openid → 找/建调用者并绑为该老人的家人
  // 本地开发：无 openid，合成 openid 模拟（一个绑定一个家人用户）
  const openid = req.header('x-wx-openid');
  let familyUserId: number;
  if (openid) {
    const exist = await db.get<{ id: number }>('SELECT id FROM user WHERE openid = ?', [openid]);
    if (exist) {
      await db.run("UPDATE user SET role = 'family', family_of = ? WHERE id = ?", [elder.id, exist.id]);
      familyUserId = exist.id;
    } else {
      const info = await db.run("INSERT INTO user (openid, nickname, role, family_of) VALUES (?, ?, ?, ?)", [openid, '家人', 'family', elder.id]);
      familyUserId = info.insertId;
    }
  } else {
    const info = await db.run("INSERT INTO user (openid, nickname, role, family_of) VALUES (?, ?, ?, ?)", [
      `family-${elder.id}-${Date.now()}`,
      '家人',
      'family',
      elder.id,
    ]);
    familyUserId = info.insertId;
  }

  res.status(201).json({
    family_user_id: familyUserId,
    elder: { id: elder.id, nickname: elder.nickname },
  });
});

/** POST /api/family/unbind —— 家人解除绑定（角色回老人；也用于云端调试切回身份） */
familyRouter.post('/unbind', async (req, res) => {
  const selfId = await resolveUserId(req);
  const info = await db.run("UPDATE user SET role = 'elder', family_of = NULL WHERE id = ? AND role = 'family'", [selfId]);
  if (info.changes === 0) return res.status(400).json({ error: '当前不是家人身份' });
  res.json({ ok: true });
});

/** GET /api/family/elders —— 家人视角：已绑老人 + 本月汇总 */
familyRouter.get('/elders', async (req, res) => {
  const selfId = await resolveUserId(req);
  const self = await db.get<{ role: string; family_of: number | null }>('SELECT role, family_of FROM user WHERE id = ?', [selfId]);
  if (!self || self.role !== 'family' || !self.family_of) return res.json({ elders: [] });

  const monthPrefix = localDateStr().slice(0, 7);
  const elders = await db.all(
    `SELECT u.id, u.nickname,
            COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_fen ELSE 0 END), 0) AS expense_fen,
            COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount_fen ELSE 0 END), 0) AS income_fen,
            COUNT(t.id) AS month_count
     FROM user u
     LEFT JOIN txn t ON t.user_id = u.id AND t.occurred_on LIKE ?
     WHERE u.id = ?
     GROUP BY u.id, u.nickname`,
    [`${monthPrefix}-%`, self.family_of],
  );
  res.json({ elders });
});
