import { Router } from 'express';
import { db } from '../db/db';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  const rows = await db.all<{ id: number; name: string; icon: string; color: string; kind: string; sort: number }>(
    'SELECT id, name, icon, color, kind, sort FROM category ORDER BY kind, sort',
  );
  res.json({
    expense: rows.filter((r) => r.kind === 'expense'),
    income: rows.filter((r) => r.kind === 'income'),
  });
});
