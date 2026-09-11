import { Router } from 'express';
import { db } from '../db/sqlite';

export const categoriesRouter = Router();

categoriesRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, icon, color, kind, sort FROM category ORDER BY kind, sort')
    .all() as Array<{ id: number; name: string; icon: string; color: string; kind: string; sort: number }>;
  res.json({
    expense: rows.filter((r) => r.kind === 'expense'),
    income: rows.filter((r) => r.kind === 'income'),
  });
});
