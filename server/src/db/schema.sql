-- 对应 docs/04-架构设计.md §3
CREATE TABLE IF NOT EXISTS user (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  openid     TEXT NOT NULL UNIQUE,
  nickname   TEXT,
  role       TEXT NOT NULL DEFAULT 'elder',   -- elder | family
  family_of  INTEGER,                          -- family 用户绑定的老人 user.id
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS category (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL,
  icon   TEXT NOT NULL,
  color  TEXT NOT NULL,
  kind   TEXT NOT NULL,                        -- expense | income
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS txn (               -- 避开 SQL 关键字 transaction
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES user(id),
  kind         TEXT NOT NULL,                  -- expense | income
  amount_fen   INTEGER NOT NULL CHECK (amount_fen > 0),
  category_id  INTEGER NOT NULL REFERENCES category(id),
  occurred_on  TEXT NOT NULL,                  -- YYYY-MM-DD
  note         TEXT DEFAULT '',
  source       TEXT NOT NULL,                  -- voice | photo | manual | family
  confidence   REAL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON txn(user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category  ON txn(category_id);

CREATE TABLE IF NOT EXISTS parse_log (         -- 解析留痕：错误可追溯、prompt 可迭代
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  source       TEXT NOT NULL,                  -- voice | photo
  raw_text     TEXT,
  llm_output   TEXT,
  final_txn_id INTEGER REFERENCES txn(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
