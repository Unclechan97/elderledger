import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(path.join(config.dataDir, 'elderledger.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 首次启动：预置分类（需求文档 §4-F5：支出 8 类 + 收入 3 类）
const { n } = db.prepare('SELECT COUNT(*) AS n FROM category').get() as { n: number };
if (n === 0) {
  const rows: Array<[string, string, string, string, number]> = [
    ['吃饭买菜', '🥬', '#4CAF50', 'expense', 1],
    ['医疗药品', '💊', '#EF5350', 'expense', 2],
    ['水电日用', '💡', '#FFA726', 'expense', 3],
    ['交通出行', '🚌', '#42A5F5', 'expense', 4],
    ['人情往来', '🧧', '#EC407A', 'expense', 5],
    ['穿衣打扮', '👕', '#AB47BC', 'expense', 6],
    ['休闲娱乐', '🎉', '#FFB300', 'expense', 7],
    ['其他支出', '📦', '#8D6E63', 'expense', 8],
    ['退休金', '💰', '#F9A825', 'income', 1],
    ['子女给', '🧑‍🤝‍🧑', '#5C6BC0', 'income', 2],
    ['其他收入', '📥', '#78909C', 'income', 3],
  ];
  const ins = db.prepare('INSERT INTO category (name, icon, color, kind, sort) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => rows.forEach((r) => ins.run(...r)))();
}
