/**
 * Lenovo Vibe Stage Backend
 * - Express 4 + ESM
 * - 关键工程化点：健康检查、优雅关闭、错误兜底、请求日志、CORS（同源时其实可关）
 */
import express from 'express';
import { ensureSchema, ping, pool } from './db.js';
import api from './routes.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

// 走 Nginx 反代后，req.ip 默认会被覆盖成网关 IP；信任一层代理拿到真实客户端 IP（用于频控）
app.set('trust proxy', 1);

/** ---------- 中间件 ---------- */
app.use(express.json({ limit: '64kb' }));

// 简易请求日志（生产建议换成 pino / morgan）
app.use((req, _res, next) => {
  const t0 = Date.now();
  process.nextTick(() =>
    console.log(`[req] ${req.method} ${req.path}  +${Date.now() - t0}ms`)
  );
  next();
});

// 同源部署时其实不需要 CORS，但开发态方便点
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** ---------- 健康检查 ---------- */
// liveness：进程活着就行
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
// readiness：还要 DB 连得通
app.get('/readyz', async (_req, res) => {
  try {
    await ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unready', error: err.message });
  }
});

/** ---------- 业务路由 ---------- */
app.use('/api', api);

/** ---------- 404 + 错误兜底（必须放最后）---------- */
app.use((req, res) => {
  res.status(404).json({ code: 4040, message: 'Not Found', path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error('[err]', err);
  res.status(status).json({
    code: err.code || (status === 500 ? 5000 : status),
    message: err.message || 'Internal Server Error',
  });
});

/** ---------- 启动 + 优雅关闭 ---------- */
async function bootstrap() {
  // DB 还没起就重试，最多 30 次（30 秒）
  for (let i = 0; i < 30; i++) {
    try {
      await ensureSchema();
      console.log('[db] schema ready');
      break;
    } catch (err) {
      if (i === 29) {
        console.error('[db] failed to init schema:', err.message);
        process.exit(1);
      }
      console.warn(`[db] not ready (${err.code || err.message}), retry ${i + 1}/30...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`[http] listening on :${PORT}`);
  });

  // 优雅关闭
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[sys] received ${signal}, shutting down...`);
    server.close(async () => {
      try { await pool.end(); } catch (_) {}
      console.log('[sys] bye');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => console.error('[unhandled]', err));
}

bootstrap();
