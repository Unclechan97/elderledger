import { Router } from 'express';
import { db } from '../db/db';
import { localDateStr } from '../utils/dates';
import { resolveUserId, resolveViewUserId } from '../utils/context';

export const transactionsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = ['voice', 'photo', 'manual', 'family'];

transactionsRouter.post('/', async (req, res) => {
  const { kind, amount_fen, category_id, occurred_on, note, source, confidence } = req.body ?? {};
  const amount = Number(amount_fen);

  if (kind !== 'expense' && kind !== 'income') return res.status(400).json({ error: 'kind 必须是 expense|income' });
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount_fen 必须是正整数（分）' });
  if (amount > 100_000_000) return res.status(400).json({ error: '金额超出上限（100 万）' });

  const cat = await db.get<{ id: number; kind: string }>('SELECT id, kind FROM category WHERE id = ?', [Number(category_id)]);
  if (!cat) return res.status(400).json({ error: '分类不存在' });
  if (cat.kind !== kind) return res.status(400).json({ error: '分类与收支类型不匹配' });

  if (typeof occurred_on !== 'string' || !DATE_RE.test(occurred_on)) {
    return res.status(400).json({ error: 'occurred_on 格式应为 YYYY-MM-DD' });
  }

  const src = SOURCES.includes(source) ? source : 'manual';
  const conf = typeof confidence === 'number' ? confidence : 1;

  // 家人代记：请求带 X-View-As 时写入老人账本（source 应为 family）
  const selfId = await resolveUserId(req);
  const userId = await resolveViewUserId(req, selfId);

  // 幂等：同一 client_token 只入一笔（客户端网关重试 / 老人双击防重复）
  const clientToken = String((req.body as { client_token?: unknown })?.client_token || '').slice(0, 64);
  if (clientToken) {
    const dup = await db.get<{ id: number }>('SELECT id FROM txn WHERE user_id = ? AND client_token = ?', [userId, clientToken]);
    if (dup) return res.status(200).json({ id: dup.id });
  }

  const info = await db
    .run(
      'INSERT INTO txn (user_id, kind, amount_fen, category_id, occurred_on, note, source, confidence, client_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, kind, amount, cat.id, occurred_on, String(note || ''), src, conf, clientToken || null],
    );
  res.status(201).json({
    id: info.insertId,
    // 同响应捎带本月支出总额：省掉小程序保存后的 /api/summary 网关调用（callContainer 有频控）
    month_total_fen: (
      (await db.get<{ t: number }>(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_fen ELSE 0 END), 0) AS t FROM txn WHERE user_id = ? AND occurred_on LIKE ?",
        [userId, `${occurred_on.slice(0, 7)}-%`],
      )) as { t: number }
    ).t,
  });
});

transactionsRouter.get('/', async (req, res) => {
  const selfId = await resolveUserId(req);
  const userId = await resolveViewUserId(req, selfId);

  const range = req.query.range === 'today' ? 'today' : 'month';
  const today = localDateStr();
  const monthPrefix = today.slice(0, 7);

  const where = range === 'today' ? 't.occurred_on = ? AND t.user_id = ?' : 't.occurred_on >= ? AND t.occurred_on <= ? AND t.user_id = ?';
  const params = range === 'today' ? [today, userId] : [`${monthPrefix}-01`, `${monthPrefix}-31`, userId];

  const base = `FROM txn t JOIN category c ON c.id = t.category_id WHERE ${where}`;
  const { n } = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n ${base}`, params)) as { n: number };
  const sums = (await db.get<{ expense_fen: number; income_fen: number }>(
    `SELECT COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_fen ELSE 0 END), 0) AS expense_fen,
            COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount_fen ELSE 0 END), 0) AS income_fen ${base}`,
    params,
  )) as { expense_fen: number; income_fen: number };
  const items = await db.all(
    `SELECT t.id, t.kind, t.amount_fen, t.occurred_on, t.note, t.source,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     ${base} ORDER BY t.occurred_on DESC, t.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSizeOf(req), (pageOf(req) - 1) * pageSizeOf(req)],
  );

  res.json({ items, total: n, page: pageOf(req), pageSize: pageSizeOf(req), ...sums });
});

function pageOf(req: { query: { page?: unknown } }): number {
  return Math.max(1, Number(req.query.page) || 1);
}
function pageSizeOf(req: { query: { pageSize?: unknown } }): number {
  return Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
}

transactionsRouter.delete('/:id', async (req, res) => {
  // 家人只读：删除只认自己的账本（不接 X-View-As，防家人误删老人记录）
  const selfId = await resolveUserId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id 无效' });
  const info = await db.run('DELETE FROM txn WHERE id = ? AND user_id = ?', [id, selfId]);
  if (info.changes === 0) return res.status(404).json({ error: '记录不存在' });
  res.json({ ok: true });
});
