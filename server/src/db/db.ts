// 数据层：微信云托管 MySQL（Serverless，存算分离）
// - 云端：同 VPC 内网直连，闲置 10 分钟自动暂停（暂停期算力 0 计费），唤醒期连接会报
//   "instance is resuming"，统一由 withRetry 兜底重试（官方建议做法）
// - 本地：docker compose 的 mysql:8 容器
// - 金额一律整数分；occurred_on 用字符串 YYYY-MM-DD（规避驱动 DATE 类型转换）
// - SUM() 走 DECIMAL，连接参数 decimalNumbers:true 保证驱动回的是 number 不是 string
import mysql from 'mysql2/promise';
import { config } from '../config';

export interface RunResult {
  insertId: number;
  changes: number;
}

/** 暂停唤醒/网络抖动的典型错误特征 */
const TRANSIENT_RE = /resuming|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|PROTOCOL_CONNECTION_LOST/i;
const RETRY_DELAYS = [500, 1500, 3000, 5000, 5000]; // ≈15s 内自动等库唤醒

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= RETRY_DELAYS.length || !TRANSIENT_RE.test(msg)) throw e;
      console.warn(`[db] 数据库暂不可用（可能唤醒中），${RETRY_DELAYS[i]}ms 后重试: ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
}

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      connectionLimit: 5,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      decimalNumbers: true, // SUM 的 DECIMAL 直接回 number，别给字符串坑前端
    });
  }
  return pool;
}

export const db = {
  /** 单行查询（无结果 undefined） */
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return withRetry(async () => {
      const [rows] = await getPool().query(sql, params);
      return (rows as T[])[0];
    });
  },

  /** 多行查询 */
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return withRetry(async () => {
      const [rows] = await getPool().query(sql, params);
      return rows as T[];
    });
  },

  /** 写操作，返回 { insertId, changes }（对齐原 better-sqlite3 的 lastInsertRowid/changes 语义） */
  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return withRetry(async () => {
      const [r] = await getPool().query(sql, params);
      const rr = r as mysql.ResultSetHeader;
      return { insertId: Number(rr.insertId), changes: rr.affectedRows };
    });
  },
};

// 建表 DDL（对应 docs/04-架构设计.md §3；金额整数分）
const DDL = [
  `CREATE TABLE IF NOT EXISTS user (
     id INT AUTO_INCREMENT PRIMARY KEY,
     openid VARCHAR(128) NOT NULL UNIQUE,
     nickname VARCHAR(64),
     role VARCHAR(16) NOT NULL DEFAULT 'elder',   -- elder | family
     family_of INT,                                -- family 用户绑定的老人 user.id
     invite_code VARCHAR(16),
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS category (
     id INT AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(32) NOT NULL UNIQUE,
     icon VARCHAR(16) NOT NULL,
     color VARCHAR(16) NOT NULL,
     kind VARCHAR(16) NOT NULL,                    -- expense | income
     sort INT NOT NULL DEFAULT 0
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS txn (                -- 避开 SQL 关键字 transaction
     id INT AUTO_INCREMENT PRIMARY KEY,
     user_id INT NOT NULL,
     kind VARCHAR(16) NOT NULL,                    -- expense | income
     amount_fen BIGINT NOT NULL,
     category_id INT NOT NULL,
     occurred_on VARCHAR(10) NOT NULL,             -- YYYY-MM-DD
     note VARCHAR(512) DEFAULT '',
     source VARCHAR(16) NOT NULL,                  -- voice | photo | manual | family
     confidence DOUBLE,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_txn_user_date (user_id, occurred_on),
     INDEX idx_txn_category (category_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS parse_log (          -- 解析留痕：错误可追溯、prompt 可迭代
     id INT AUTO_INCREMENT PRIMARY KEY,
     user_id INT,
     source VARCHAR(16) NOT NULL,
     raw_text TEXT,
     llm_output TEXT,
     final_txn_id INT,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// 预置分类（需求文档 §4-F5：支出 8 类 + 收入 3+1 类），幂等补种
const SEED_CATEGORIES: Array<[string, string, string, string, number]> = [
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

/** 启动时调用：建库建表 + 补种分类（幂等）。云端 MySQL 可能正在唤醒，全程带重试 */
export async function initDb(): Promise<void> {
  await withRetry(async () => {
    // 先不指定 database 连接，把库建出来（云端开通后默认没有业务库）
    const boot = await mysql.createConnection({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      charset: 'utf8mb4',
    });
    await boot.query(`CREATE DATABASE IF NOT EXISTS \`${config.mysqlDatabase}\` DEFAULT CHARSET utf8mb4`);
    await boot.end();
  });

  await withRetry(async () => {
    const p = getPool();
    for (const stmt of DDL) await p.query(stmt);
    for (const [name, icon, color, kind, sort] of SEED_CATEGORIES) {
      await p.query(
        'INSERT INTO category (name, icon, color, kind, sort) SELECT ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM category WHERE name = ?)',
        [name, icon, color, kind, sort, name],
      );
    }
  });
}

// 本地开发阶段单一默认用户（免登录；云端 callContainer 走 openid，不经过这里）
let defaultUserIdCache: number | null = null;
export async function defaultUserId(): Promise<number> {
  if (defaultUserIdCache) return defaultUserIdCache;
  await db.run(
    "INSERT INTO user (openid, nickname) SELECT 'local-dev', '本机用户' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM user WHERE openid = 'local-dev')",
  );
  const u = await db.get<{ id: number }>('SELECT id FROM user WHERE openid = ?', ['local-dev']);
  if (!u) throw new Error('默认用户初始化失败');
  defaultUserIdCache = u.id;
  return u.id;
}
