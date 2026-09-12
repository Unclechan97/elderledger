import { Router } from 'express';
import { db } from '../db/sqlite';
import { localDateStr } from '../utils/dates';
import { resolveUserId, resolveViewUserId } from '../utils/context';

export const transactionsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = ['voice', 'photo', 'manual', 'family'];

transactionsRouter.post('/', (req, res) => {
  const { kind, amount_fen, category_id, occurred_on, note, source, confidence } = req.body ?? {};
  const amount = Number(amount_fen);

  if (kind !== 'expense' && kind !== 'income') return res.status(400).json({ error: 'kind 必须是 expense|income' });
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount_fen 必须是正整数（分）' });
  if (amount > 100_000_000) return res.status(400).json({ error: '金额超出上限（100 万）' });

  const cat = db.prepare('SELECT id, kind FROM category WHERE id = ?').get(Number(category_id)) as
    | { id: number; kind: string }
    | undefined;
  if (!cat) return res.status(400).json({ error: '分类不存在' });
  if (cat.kind !== kind) return res.status(400).json({ error: '分类与收支类型不匹配' });

  if (typeof occurred_on !== 'string' || !DATE_RE.test(occurred_on)) {
    return res.status(400).json({ error: 'occurred_on 格式应为 YYYY-MM-DD' });
  }

  const src = SOURCES.includes(source) ? source : 'manual';
  const conf = typeof confidence === 'number' ? confidence : 1;

  // 家人代记：请求带 X-View-As 时写入老人账本（source 应为 family）
  const selfId = resolveUserId(req);
  const userId = resolveViewUserId(req, selfId);

  const info = db
    .prepare('INSERT INTO txn (user_id, kind, amount_fen, category_id, occurred_on, note, source, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, kind, amount, cat.id, occurred_on, String(note || ''), src, conf);
  res.status(201).json({ id: info.lastInsertRowid });
});

transactionsRouter.get('/', (req, res) => {
  const selfId = resolveUserId(req);
  const userId = resolveViewUserId(req, selfId);

  const range = req.query.range === 'today' ? 'today' : 'month';
  const today = localDateStr();
  const monthPrefix = today.slice(0, 7);

  const where = range === 'today' ? 't.occurred_on = ? AND t.user_id = ?' : 't.occurred_on >= ? AND t.occurred_on <= ? AND t.user_id = ?';
  const params = range === 'today' ? [today, userId] : [`${monthPrefix}-01`, `${monthPrefix}-31`, userId];

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));

  const base = `FROM txn t JOIN category c ON c.id = t.category_id WHERE ${where}`;
  const { n } = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params) as { n: number };
  const sums = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_fen ELSE 0 END), 0) AS expense_fen,
              COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount_fen ELSE 0 END), 0) AS income_fen ${base}`,
    )
    .get(...params) as { expense_fen: number; income_fen: number };
  const items = db
    .prepare(
      `SELECT t.id, t.kind, t.amount_fen, t.occurred_on, t.note, t.source,
              c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       ${base} ORDER BY t.occurred_on DESC, t.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  res.json({ items, total: n, page, pageSize, ...sums });
});

transactionsRouter.delete('/:id', (req, res) => {
  // 家人只读：删除只认自己的账本（不接 X-View-As，防家人误删老人记录）
  const selfId = resolveUserId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id 无效' });
  const info = db.prepare('DELETE FROM txn WHERE id = ? AND user_id = ?').run(id, selfId);
  if (info.changes === 0) return res.status(404).json({ error: '记录不存在' });
  res.json({ ok: true });
});
