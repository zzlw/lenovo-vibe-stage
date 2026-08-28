/**
 * 路由层（HTTP）
 * - 只做参数校验、调 db、返回响应
 * - 业务异常通过 throw + status 字段冒泡到全局错误中间件
 */
import express from 'express';
import os from 'os';
import * as db from './db.js';

const router = express.Router();

/**
 * 拿宿主机的局域网 IP（用于二维码）
 * 优先级：env LAN_IP > 内网网卡（192/10/172.16-31）> 任意非内部 IPv4 > null
 * 容器内默认拿到的是容器网卡 IP，没意义；所以一定要在 docker-compose 里把宿主机 IP 注入 LAN_IP
 */
function detectLanIp() {
  if (process.env.LAN_IP && process.env.LAN_IP.trim()) {
    return process.env.LAN_IP.trim();
  }
  const ips = [];
  const ifs = os.networkInterfaces();
  for (const name in ifs) {
    for (const iface of ifs[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return (
    ips.find((ip) => /^192\.168\./.test(ip)) ||
    ips.find((ip) => /^10\./.test(ip)) ||
    ips.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
    ips[0] ||
    null
  );
}

router.get('/server-info', (_req, res) => {
  res.json({
    code: 0,
    data: {
      host: detectLanIp(),
      source: process.env.LAN_IP ? 'env' : 'auto',
    },
  });
});

/** 输入校验：名字 1-32 字符、过滤前后空白 */
function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > 32) return null;
  // 屏蔽控制字符 / 换行
  if (/[\x00-\x1f\x7f]/.test(name)) return null;
  return name;
}

/** ---------- people ---------- */

router.get('/people', async (_req, res, next) => {
  try {
    const list = await db.listPeople();
    res.json({ code: 0, data: list });
  } catch (err) { next(err); }
});

router.post('/people', async (req, res, next) => {
  try {
    const name = validateName(req.body?.name);
    if (!name) {
      return res.status(400).json({ code: 1001, message: '名字格式不合法（1-32 字符）' });
    }
    const person = await db.createPerson(name);
    res.status(201).json({ code: 0, data: person });
  } catch (err) { next(err); }
});

router.delete('/people/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 1002, message: 'id 不合法' });
    }
    const ok = await db.deletePerson(id);
    if (!ok) return res.status(404).json({ code: 1003, message: '记录不存在' });
    res.json({ code: 0, data: { id } });
  } catch (err) { next(err); }
});

/** ---------- picks ---------- */

router.post('/picks', async (req, res, next) => {
  try {
    const count = Number(req.body?.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      return res.status(400).json({ code: 1010, message: 'count 必须是 1-10 的整数' });
    }
    const session = (req.body?.session || 'default').toString().slice(0, 64);
    const excludePicked = req.body?.excludePicked !== false;

    const picked = await db.pickPeople({ count, session, excludePicked });
    res.json({ code: 0, data: picked });
  } catch (err) { next(err); }
});

router.get('/picks', async (req, res, next) => {
  try {
    const session = (req.query.session || 'default').toString().slice(0, 64);
    const list = await db.listPicks(session);
    res.json({ code: 0, data: list });
  } catch (err) { next(err); }
});

router.delete('/picks', async (req, res, next) => {
  try {
    const session = (req.query.session || 'default').toString().slice(0, 64);
    const cleared = await db.clearPicks(session);
    res.json({ code: 0, data: { cleared } });
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const session = (req.query.session || 'default').toString().slice(0, 64);
    const stat = await db.statsBySession(session);
    res.json({ code: 0, data: stat });
  } catch (err) { next(err); }
});

/** ---------- commitments · 收尾互动「承诺墙」---------- */

function validateAction(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim();
  if (s.length < 4 || s.length > 280) return null;
  return s;
}

router.get('/commitments', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const list = await db.listCommitments(limit);
    res.json({ code: 0, data: list });
  } catch (err) { next(err); }
});

router.post('/commitments', async (req, res, next) => {
  try {
    const name = validateName(req.body?.name);
    if (!name) {
      return res.status(400).json({ code: 1020, message: '名字格式不合法（1-32 字符）' });
    }
    const action = validateAction(req.body?.action);
    if (!action) {
      return res.status(400).json({ code: 1021, message: '承诺内容 4-280 字符' });
    }
    const item = await db.createCommitment(name, action);
    res.status(201).json({ code: 0, data: item });
  } catch (err) { next(err); }
});

router.delete('/commitments', async (_req, res, next) => {
  try {
    const cleared = await db.clearCommitments();
    res.json({ code: 0, data: { cleared } });
  } catch (err) { next(err); }
});

/** ---------- messages · 留言板（开放反馈墙）---------- */

/**
 * 简易内存频控：单 IP 在 windowMs 内最多发 1 条留言，防刷
 * 生产建议换成 Redis + 滑动窗口；Demo 用进程内 Map 已足够
 * 注意：req.ip 依赖 app.set('trust proxy', true)，否则在 Nginx 后面拿到的全是 127.0.0.1
 */
const _msgRate = new Map();
const MSG_RATE_WINDOW_MS = 10_000;
function rateLimitMessage(ip) {
  const now = Date.now();
  const last = _msgRate.get(ip) || 0;
  if (now - last < MSG_RATE_WINDOW_MS) {
    const wait = Math.ceil((MSG_RATE_WINDOW_MS - (now - last)) / 1000);
    const e = new Error(`留言太快了，${wait}s 后再试`);
    e.status = 429;
    e.code = 1031;
    throw e;
  }
  _msgRate.set(ip, now);
  if (_msgRate.size > 5000) {
    for (const [k, t] of _msgRate) {
      if (now - t > MSG_RATE_WINDOW_MS * 6) _msgRate.delete(k);
    }
  }
}

function validateMessageName(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim();
  if (name.length === 0) return null;
  if (name.length > 32) return undefined;
  if (/[\x00-\x1f\x7f]/.test(name)) return undefined;
  return name;
}

function validateMessageContent(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim();
  if (s.length < 1 || s.length > 280) return null;
  return s;
}

router.get('/messages', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const beforeRaw = req.query.before;
    const before = beforeRaw ? Number(beforeRaw) : null;
    if (beforeRaw && (!Number.isInteger(before) || before <= 0)) {
      return res.status(400).json({ code: 1030, message: 'before 游标不合法' });
    }
    const list = await db.listMessages({ limit, before });
    res.json({ code: 0, data: list });
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    rateLimitMessage(req.ip || 'unknown');

    const name = validateMessageName(req.body?.name);
    if (name === undefined) {
      return res.status(400).json({ code: 1032, message: '名字 1-32 字符（不填则匿名）' });
    }
    const content = validateMessageContent(req.body?.content);
    if (!content) {
      return res.status(400).json({ code: 1033, message: '留言内容 1-280 字符' });
    }
    const item = await db.createMessage({ name, content });
    res.status(201).json({ code: 0, data: item });
  } catch (err) { next(err); }
});

router.delete('/messages/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 1034, message: 'id 不合法' });
    }
    const ok = await db.deleteMessage(id);
    if (!ok) return res.status(404).json({ code: 1035, message: '留言不存在' });
    res.json({ code: 0, data: { id } });
  } catch (err) { next(err); }
});

router.delete('/messages', async (_req, res, next) => {
  try {
    const cleared = await db.clearMessages();
    res.json({ code: 0, data: { cleared } });
  } catch (err) { next(err); }
});

export default router;
