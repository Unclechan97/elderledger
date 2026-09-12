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
// 预置分类：幂等补种（WHERE NOT EXISTS），已有库升级后自动补新分类
{
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
    ['生意进账', '🏪', '#26A69A', 'income', 3], // 小生意/摆摊/房租等"自己挣的钱"
    ['其他收入', '📥', '#78909C', 'income', 4],
  ];
  const ins = db.prepare(
    'INSERT INTO category (name, icon, color, kind, sort) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM category WHERE name = ?)',
  );
  db.transaction(() => rows.forEach((r) => ins.run(r[0], r[1], r[2], r[3], r[4], r[0])))();
}

// M1：本地开发阶段单一默认用户（免登录）；M2 接 code2Session 后按 openid 建/查用户
const DEFAULT_OPENID = 'local-dev';
db.prepare('INSERT OR IGNORE INTO user (openid, nickname) VALUES (?, ?)').run(DEFAULT_OPENID, '本机用户');
export const DEFAULT_USER_ID = (db.prepare('SELECT id FROM user WHERE openid = ?').get(DEFAULT_OPENID) as { id: number }).id;

// M5：邀请码列（已有库幂等迁移）
{
  const cols = (db.pragma('table_info(user)') as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes('invite_code')) db.exec('ALTER TABLE user ADD COLUMN invite_code TEXT');
}
