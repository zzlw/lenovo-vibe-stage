/**
 * 数据访问层（Data Access Layer）
 * - 连接池：pg.Pool，按业内最佳实践复用连接
 * - 自动迁移：启动时执行 ensureSchema()，幂等建表
 * - 不在此层做 HTTP 相关处理，保持纯净
 */
import pg from 'pg';
import { randomInt } from 'node:crypto';

const { Pool } = pg;

const poolShared = {
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

function sslForDatabaseUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) {
      return false;
    }
  } catch {
    // 解析失败按公网处理
  }
  // Railway 公网证书链对 Node 默认 CA 不完整
  return { rejectUnauthorized: false };
}

function createPool() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (url) {
    return new Pool({
      connectionString: url,
      ...poolShared,
      ssl: sslForDatabaseUrl(url),
    });
  }

  if (!process.env.PGPASSWORD) {
    throw new Error(
      '[db] DATABASE_URL or PGPASSWORD is required. Refusing to start with a hardcoded fallback. ' +
      'Set DATABASE_URL or PGPASSWORD in env / .env / docker-compose.yml.'
    );
  }

  return new Pool({
    host: process.env.PGHOST || 'db',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'roster',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'roster',
    ...poolShared,
  });
}

export const pool = createPool();

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err);
});

/** 启动时检查并创建表结构（幂等） */
export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      id          BIGSERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT  people_name_unique UNIQUE (name)
    );

    CREATE TABLE IF NOT EXISTS picks (
      id          BIGSERIAL PRIMARY KEY,
      person_id   BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      session     VARCHAR(64) NOT NULL DEFAULT 'default',
      picked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT  picks_person_session_unique UNIQUE (person_id, session)
    );

    CREATE INDEX IF NOT EXISTS idx_picks_session_time
      ON picks (session, picked_at DESC);

    CREATE TABLE IF NOT EXISTS commitments (
      id          BIGSERIAL    PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      action      VARCHAR(280) NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_commitments_created
      ON commitments (created_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL       PRIMARY KEY,
      name        VARCHAR(32),
      content     VARCHAR(280) NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT  messages_content_len CHECK (char_length(content) BETWEEN 1 AND 280)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_id_desc
      ON messages (id DESC);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'picks_person_session_unique'
      ) THEN
        ALTER TABLE picks
          ADD CONSTRAINT picks_person_session_unique UNIQUE (person_id, session);
      END IF;
    END $$;
  `);
}

/** 健康探测：能不能从池里拿到连接 */
export async function ping() {
  const r = await pool.query('SELECT 1 AS ok');
  return r.rows[0].ok === 1;
}

/** ---------- people ---------- */

export async function listPeople(limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const { rows } = await pool.query(
    `SELECT id, name, created_at
       FROM people
      ORDER BY created_at ASC, id ASC
      LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

export async function createPerson(name) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO people (name) VALUES ($1) RETURNING id, name, created_at`,
      [name]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('该名字已存在');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

export async function deletePerson(id) {
  const { rowCount } = await pool.query(`DELETE FROM people WHERE id = $1`, [id]);
  return rowCount > 0;
}

/** ---------- picks ---------- */

/**
 * 抽 N 人：在事务中操作，避免并发抽到重复
 * - 默认排除当前 session 已抽中的
 * - 当排除后池子空了，自动 fallback 全员
 */
export async function pickPeople({ count, session = 'default', excludePicked = true }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const baseSql = excludePicked
      ? `SELECT p.id, p.name FROM people p
         WHERE p.id NOT IN (
           SELECT person_id FROM picks WHERE session = $1
         )`
      : `SELECT p.id, p.name FROM people p`;

    const params = excludePicked ? [session] : [];
    let { rows: candidates } = await client.query(baseSql, params);

    if (excludePicked && candidates.length === 0) {
      const { rows } = await client.query(
        `SELECT id, name FROM people LIMIT 1000`
      );
      candidates = rows;
    }

    if (candidates.length === 0) {
      await client.query('ROLLBACK');
      const e = new Error('名单为空，请先录入');
      e.status = 400;
      throw e;
    }

    const n = Math.min(count, candidates.length);
    const picked = [];
    const arr = candidates.slice();
    for (let i = 0; i < n; i++) {
      const idx = randomInt(arr.length);
      picked.push(arr.splice(idx, 1)[0]);
    }

    for (const p of picked) {
      await client.query(
        `INSERT INTO picks (person_id, session) VALUES ($1, $2)`,
        [p.id, session]
      );
    }

    await client.query('COMMIT');
    return picked;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listPicks(session = 'default', limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const { rows } = await pool.query(
    `SELECT pk.id, pk.picked_at, p.id AS person_id, p.name
       FROM picks pk
       JOIN people p ON p.id = pk.person_id
      WHERE pk.session = $1
      ORDER BY pk.picked_at DESC
      LIMIT $2`,
    [session, safeLimit]
  );
  return rows;
}

export async function clearPicks(session = 'default') {
  const { rowCount } = await pool.query(`DELETE FROM picks WHERE session = $1`, [session]);
  return rowCount;
}

export async function statsBySession(session = 'default') {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM people) AS total,
       (SELECT COUNT(DISTINCT person_id)::int FROM picks WHERE session = $1) AS picked,
       (SELECT COUNT(*)::int FROM commitments) AS commitments
    `,
    [session]
  );
  return rows[0]; // { total, picked, commitments }
}

/** ---------- commitments · 收尾互动「承诺墙」---------- */

export async function listCommitments(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const { rows } = await pool.query(
    `SELECT id, name, action, created_at
       FROM commitments
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

export async function createCommitment(name, action) {
  const { rows } = await pool.query(
    `INSERT INTO commitments (name, action)
     VALUES ($1, $2)
     RETURNING id, name, action, created_at`,
    [name, action]
  );
  return rows[0];
}

export async function clearCommitments() {
  const { rowCount } = await pool.query(`DELETE FROM commitments`);
  return rowCount;
}

/** ---------- messages · 留言板（开放反馈墙）----------
 * 与 commitments 的差异：name 可空（匿名）、内容定位为"感想/提问/吐槽"
 * 排序按 id DESC（自带主键索引，比 created_at 更省一次回表）
 */

export async function listMessages({ limit = 50, before = null } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  if (before && Number.isInteger(before) && before > 0) {
    const { rows } = await pool.query(
      `SELECT id, name, content, created_at
         FROM messages
        WHERE id < $1
        ORDER BY id DESC
        LIMIT $2`,
      [before, safeLimit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT id, name, content, created_at
       FROM messages
      ORDER BY id DESC
      LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

export async function createMessage({ name, content }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (name, content)
     VALUES ($1, $2)
     RETURNING id, name, content, created_at`,
    [name ?? null, content]
  );
  return rows[0];
}

export async function deleteMessage(id) {
  const { rowCount } = await pool.query(`DELETE FROM messages WHERE id = $1`, [id]);
  return rowCount > 0;
}

export async function clearMessages() {
  const { rowCount } = await pool.query(`DELETE FROM messages`);
  return rowCount;
}

export async function countMessages() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM messages`);
  return rows[0].n;
}
