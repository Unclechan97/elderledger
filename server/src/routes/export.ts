// GET /api/export/csv?month=YYYY-MM —— 按月导出 CSV（Excel 友好：UTF-8 BOM + CRLF）
// 家人视角可用（X-View-As）：导出是只读操作，允许家人帮老人导出
import { Router } from 'express';
import { db } from '../db/db';
import { resolveUserId, resolveViewUserId } from '../utils/context';

export const exportRouter = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function csvCell(v: string | number): string {
  const s = String(v);
  // 含逗号/引号/换行的字段加引号并把内部引号翻倍
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const KIND_TEXT: Record<string, string> = { expense: '支出', income: '收入' };
const SOURCE_TEXT: Record<string, string> = { voice: '语音', photo: '拍照', manual: '手动', family: '家人代记' };

exportRouter.get('/csv', async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month 格式应为 YYYY-MM' });

  const selfId = await resolveUserId(req);
  const userId = await resolveViewUserId(req, selfId);

  const rows = (await db.all(
    `SELECT t.occurred_on, t.kind, t.amount_fen, t.note, t.source,
            c.name AS category_name
     FROM txn t JOIN category c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.occurred_on >= ? AND t.occurred_on <= ?
     ORDER BY t.occurred_on ASC, t.id ASC`,
    [userId, `${month}-01`, `${month}-31`],
  )) as Array<{
    occurred_on: string;
    kind: string;
    amount_fen: number;
    note: string;
    source: string;
    category_name: string;
  }>;

  const header = ['日期', '类型', '分类', '金额(元)', '备注', '来源'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.occurred_on,
        KIND_TEXT[r.kind] ?? r.kind,
        r.category_name,
        (r.amount_fen / 100).toFixed(2),
        r.note,
        SOURCE_TEXT[r.source] ?? r.source,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // BOM 让 Excel 识别 UTF-8；CRLF 是 Excel 的行分隔
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="elderledger-${month}.csv"`);
  res.send(body);
});
