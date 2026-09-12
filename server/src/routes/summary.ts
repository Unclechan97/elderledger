import { Router } from 'express';
import { db } from '../db/sqlite';
import { localDateStr, prevMonthPrefix } from '../utils/dates';
import { resolveUserId, resolveViewUserId } from '../utils/context';

export const summaryRouter = Router();

/** GET /api/summary?period=month —— 首页大字汇总 + 月度支出/收入分类占比（stats 页共用） */
summaryRouter.get('/', (req, res) => {
  const selfId = resolveUserId(req);
  const userId = resolveViewUserId(req, selfId);

  const month = localDateStr().slice(0, 7); // YYYY-MM
  const prev = prevMonthPrefix(month);

  const monthTotal = (db
    .prepare("SELECT COALESCE(SUM(amount_fen), 0) AS t FROM txn WHERE kind = 'expense' AND user_id = ? AND occurred_on >= ? AND occurred_on <= ?")
    .get(userId, `${month}-01`, `${month}-31`) as { t: number }).t;
  const prevTotal = (db
    .prepare("SELECT COALESCE(SUM(amount_fen), 0) AS t FROM txn WHERE kind = 'expense' AND user_id = ? AND occurred_on >= ? AND occurred_on <= ?")
    .get(userId, `${prev}-01`, `${prev}-31`) as { t: number }).t;
  const incomeTotal = (db
    .prepare("SELECT COALESCE(SUM(amount_fen), 0) AS t FROM txn WHERE kind = 'income' AND user_id = ? AND occurred_on >= ? AND occurred_on <= ?")
    .get(userId, `${month}-01`, `${month}-31`) as { t: number }).t;

  const byCategory = (kind: 'expense' | 'income') =>
    db
      .prepare(
        `SELECT c.id AS category_id, c.name, c.icon, c.color,
              SUM(t.amount_fen) AS total_fen, COUNT(*) AS cnt
       FROM txn t JOIN category c ON c.id = t.category_id
       WHERE t.kind = ? AND t.user_id = ? AND t.occurred_on >= ? AND t.occurred_on <= ?
       GROUP BY c.id ORDER BY total_fen DESC`,
      )
      .all(kind, userId, `${month}-01`, `${month}-31`);

  res.json({
    month,
    total_fen: monthTotal,
    prev_total_fen: prevTotal,
    diff_last_month_fen: monthTotal - prevTotal,
    income_total_fen: incomeTotal,
    by_expense_category: byCategory('expense'),
    by_income_category: byCategory('income'),
  });
});
