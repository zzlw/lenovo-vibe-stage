# CLAUDE.md · Lenovo Vibe Stage 项目宪法

> 给 AI（Claude / Cursor / Copilot）看的项目说明。**任何 AI 修改这个项目时必须先读这一份。**
>
> 当你（人类）让 AI 改这个项目时，AI 会自动加载本文件，不需要你重复粘贴上下文。

📦 **Repo**：<https://github.com/zzlw/lenovo-vibe-stage>

---

## 1 · Project（一句话）

**Lenovo Vibe Stage** = Vibe Coding 工程化进阶分享会的"现场抽人 + 承诺墙"演示系统。整套作品本身就是 4 招（CLAUDE.md / Cursor Rules / MCP / Hooks）的工程化样本。

- 听众：Lenovo 软件开发团队（已在用 AI 写代码）
- 时长：30 分钟主分享 + 1 小时第 2 天实战工作坊
- 关键交互：扫码进 PPT 内弹窗（录入 / 抽人 / 承诺）

---

## 2 · Stack（必须严格遵守版本）

| 层 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| Frontend | 单文件 PPT | 原生 HTML/CSS/JS | 暗色 + Lenovo 红 + 紫 + 青，11 页 |
| Frontend | qrcodejs | gh:davidshimjs/qrcodejs | CDN，二维码生成 |
| Frontend | html2pdf.js | 0.10.2 | CDN，一键导出 PDF |
| Backend | Node.js | **20.x（不要降级到 18）** | ESM 必须用 |
| Backend | Express | 4.21.x | 不上 5.x（生态未稳定） |
| Backend | pg | 8.13.x | 直接用，不引入 ORM |
| DB | PostgreSQL | 16-alpine | UNIQUE/事务/参数化 |
| Web | Nginx | 1.27-alpine | 本地反代 /api → backend |
| Orch | Docker Compose | v2 | 本地一键启动，不用 Swarm/K8s |
| 生产前端 | Vercel | 静态 + Edge | `frontend/`；`/api/*` 代理到 Railway |
| 生产后端 | Railway | Node 20 | `Dockerfile.railway` + PostgreSQL 16 |

---

## 3 · Conventions（团队约定）

### Backend (`backend/src/`)

- **必须 ESM**（`"type": "module"`），不要 CommonJS。
- 异步统一 `async/await`，错误统一 `next(err)` 冒泡到全局错误中间件。
- SQL **必须参数化**（`$1, $2`），绝对不要字符串拼接。
- 表设计：snake_case 字段，主键 `id BIGSERIAL`、时间戳 `created_at TIMESTAMPTZ DEFAULT NOW()`。
- 抽人这种"读后写"的操作走事务（见 `db.pickPeople`）。
- 健康检查：`/healthz`（liveness）和 `/readyz`（带 DB ping）必须区分。
- 输入校验在 `routes.js` 入口完成（如 `validateName`），DB 层默认输入合法。
- 日志走 `console.log`/`console.error` 即可，**不引日志库**（Demo 项目）。

### Frontend (`frontend/index.html`)

- **单文件原则**：所有 CSS/JS 都内联在 `index.html` 里。
  - 例外：`qrcode.min.js` 和 `html2pdf.js` 用 CDN（合理依赖）。
- **不引 React/Vue/任何前端框架**——这是 Vibe Coding 极简哲学的演示。
- 颜色变量必须用 `:root` 里的（`--lenovo`/`--primary`/`--primary-2` 等），不要硬编码 hex。
- 字体只用：系统字体 + JetBrains Mono（mono 类）。
- 弹窗（modal）一律：暗色遮罩 + 中央卡片 + ESC 关闭 + 点遮罩关闭 + URL hash 路由。
- API 调用统一走顶部的 `apiCall(path, opts)`，不要散落 `fetch`。

### Database

- 一切 schema 变更走 `db.ensureSchema()`，**幂等**（`CREATE TABLE IF NOT EXISTS`）。
- UNIQUE 约束、外键约束、NOT NULL 必须显式声明。
- 任何"先查后写"操作必须 BEGIN/COMMIT。

### Naming

- 文件：`kebab-case.js` / `kebab-case.html`
- JS 变量/函数：`camelCase`
- DOM ID/CSS class：`camelCase` 或 `kebab-case` 都行（保持每个文件内一致）
- DB 字段：`snake_case`

### Git / Commits

- 走 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:`、`fix:`、`refactor:`、`docs:`、`chore:`...
- 一次提交只做一件事
- PR 模板必填："本次是否需要更新 CLAUDE.md？"

---

## 4 · Don't（红线）

- ❌ 不要在 frontend 里硬编码 IP、端口、URL（用 `window.location` 或调 `/api/server-info`）
- ❌ 不要用 `alert()`/`confirm()`/`prompt()`（用 `enrollToast` 或自定义 modal）
- ❌ 不要在 backend 直接 `throw new Error('xxx')`——要 `const err = new Error(); err.status = 4xx; throw err;`
- ❌ 不要在 SQL 里拼接字符串（参数化只有这一条路）
- ❌ 不要把 `console.log` 留在代码里（仅保留 `console.error` 用于真实错误）
- ❌ 不要修改 `.env.example` 字段顺序——按"端口 → DB → LAN_IP"分组保留
- ❌ 不要引入新依赖之前不与 maintainer 确认（比如要装个 winston、knex、koa——都不要）
- ❌ 不要用 `<script>` 引入 React/Vue/jQuery
- ❌ 不要在 Cursor/Claude 里把这份 CLAUDE.md 当 README 写成长篇大论——精简、指令式

---

## 5 · How to run

```bash
# 一键启动（推荐，自动探测 LAN_IP 写入 .env）
./start.sh

# 手动启动（如果 start.sh 不可用）
cp .env.example .env
echo "LAN_IP=$(ipconfig getifaddr en0)" >> .env  # mac
docker compose up -d

# 看日志
docker compose logs -f backend
docker compose logs -f db

# 重置数据
docker compose down -v && docker compose up -d

# 关掉
docker compose down
```

入口：

| 用途 | URL |
| --- | --- |
| 讲师投影 PPT | http://<LAN_IP>:8080 |
| 学员手机扫码（录入） | http://<LAN_IP>:8080/#enroll |
| 承诺墙 | http://<LAN_IP>:8080/#commit |
| 健康检查 | http://<LAN_IP>:8080/readyz |
| API 文档式 | `/api/people`、`/api/picks`、`/api/stats`、`/api/commitments`、`/api/server-info` |

生产（Vercel + Railway）：前端 Root Directory = `frontend/`，环境变量 `BACKEND_URL` 指向 Railway 公网域名；后端只吃 `DATABASE_URL`。

---

## 6 · 给 AI 的特殊指令

- 修改 `index.html` 时**永远先读完整的现有 `<style>` 和 `<script>` 块**，再用 `StrReplace` 局部修改，不要全文重写。
- 改后端 schema 时**先在 `db.js` 的 `ensureSchema` 里加 `CREATE TABLE IF NOT EXISTS`**，再写业务代码。
- 任何涉及 docker 的改动后，必须提示用户 `docker compose up -d --build` 而非 restart。
- 改了前端文件后，由于 nginx Dockerfile 是 `COPY .`，build cache 可能不识别删除——遇到老文件还在的情况，建议 `docker compose build --no-cache frontend`。
- 谈到团队规范时引用本文件，**不要重复粘贴规范内容**。
- 如果用户要新加功能，先反问："要不要顺便更新 CLAUDE.md 第 X 节？"

---

> 维护人：张展亮（itcode: zhangzl39，Lenovo 大前端 · Studio AI）
> 上次更新：2026-05-08（首版）
