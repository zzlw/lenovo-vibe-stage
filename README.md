# Lenovo Vibe Stage · Vibe Coding 工程化样板

<p align="left">
  <a href="https://github.com/zzlw/lenovo-vibe-stage"><img src="https://img.shields.io/badge/GitHub-zzlw%2Flenovo-vibe-stage-181717?logo=github&logoColor=white" alt="GitHub"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://github.com/zzlw/lenovo-vibe-stage/commits/main"><img src="https://img.shields.io/github/last-commit/zzlw/lenovo-vibe-stage?logo=git&logoColor=white" alt="Last Commit"></a>
</p>

> Lenovo 大前端团队 Vibe Coding 工程化分享会的"舞台"——PPT + 现场互动（录入 / 抽人 / 承诺墙）+ 4 招工程化样板（CLAUDE.md / Cursor Rules / MCP / Hooks + Subagent）一站全有。
>
> **整个分享会只有一个 URL**。PPT、录入弹窗、抽人弹窗、承诺墙弹窗都在 `frontend/index.html` 里。后端 Node.js + PostgreSQL + Docker Compose 一键启动。
>
> 生产环境：Vercel（前端）+ Railway（后端 + PostgreSQL），与 [aftersales-agent](https://github.com/zzlw/aftersales-agent) 同一套拆分。

📦 **开源仓库**：<https://github.com/zzlw/lenovo-vibe-stage>

---

## ⚡ 30 秒一键启动

```bash
git clone https://github.com/zzlw/lenovo-vibe-stage.git
cd lenovo-vibe-stage
./start.sh                # 自动探测 LAN_IP → 写入 .env → docker compose up -d → 打印实际访问 URL
```

`start.sh` 会自动探测本机 LAN IP 并打印 5 条实际可点击的 URL（讲师投影 / 学员录入 / 讲师抽人 / 承诺墙 / 健康检查）。**无需任何离线文件**——qrcode / html2pdf 都走 CDN，开箱即用。

> 下文表格里的 `<LAN_IP>` 是占位符。实际值看 `start.sh` 的输出，或者 `cat .env | grep LAN_IP`。

---

## 云端部署（Vercel + Render + Neon）

免费档：前端 Vercel，后端 Render 容器，数据库 Neon Postgres。Railway / Koyeb 试用或控制台不可用时走这一套。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/zzlw/lenovo-vibe-stage)

| 环节 | 平台 | 说明 |
|---|---|---|
| 代码托管 | GitHub（本仓库，MIT） | `main` 为生产分支 |
| 前端 | Vercel | Root Directory = `frontend/`；`BACKEND_URL` 指向 Render 公网域名 |
| 后端 | Render 免费 Web Service | `Dockerfile.railway` + `render.yaml`；空闲 15 分钟会休眠 |
| 数据库 | Neon PostgreSQL 16 | 注入 `DATABASE_URL`；启动时 `ensureSchema()` 幂等建表 |

Render 创建时会提示填写 `DATABASE_URL`（从 Neon 控制台复制，带 `sslmode=require`）。Vercel 环境变量：`BACKEND_URL=https://<render-service>.onrender.com`（不要末尾斜杠）。

---

## 目录结构

```
lenovo-vibe-stage/
├── README.md                    ← 你正在看的
├── CLAUDE.md                    ⭐ 项目宪法（AI 改代码前必读）
├── LICENSE                      MIT
├── start.sh                     一键启动脚本（自动探测 LAN_IP）
├── docker-compose.yml           三层服务编排（含 LAN_IP 注入 backend）
├── Dockerfile.railway           Railway 后端镜像（打包 backend/）
├── railway.json                 Railway 构建 / 健康检查
├── .env.example                 环境变量样板
├── .gitignore
│
├── .cursor/                     ⭐ Cursor Rules · 全局 + 项目分层规则
│   ├── mcp.json                 MCP 配置示范（含 browser/postgres/github/jira/filesystem）
│   └── rules/
│       ├── general.mdc          全局：所有文件都拉
│       ├── backend.mdc          仅 backend/ 下文件拉
│       ├── frontend.mdc         仅 frontend/ 下文件拉
│       └── db.mdc               涉及 SQL 的文件拉
│
├── .claude/                     ⭐ Claude Code 项目级 Hooks + Subagent
│   ├── settings.json            Hooks（PreToolUse / PostToolUse / SubagentStart / SubagentStop / Stop / UserPromptSubmit）
│   ├── agent-memory/            🧠 subagent 跨会话记忆（code-reviewer / test-writer / report-writer 共用）
│   │   └── MEMORY.md            团队反复违规模式 + 高风险文件清单 + 已覆盖测试索引
│   └── agents/                  按 Anthropic v2.x 最佳实践配置（model + color + memory + disallowedTools + maxTurns）
│       ├── code-reviewer.md     🔴 sonnet · 严苛代码审查员（只读，禁 Edit/Write）
│       ├── api-designer.md      🔵 sonnet · REST API 设计专家（只读 + 禁 Bash，纯设计）
│       ├── commit-maker.md      🟢 haiku  · Conventional Commits 生成器（不执行 commit）
│       ├── test-writer.md       🟡 haiku  · node:test 单测写手（只写 backend/test/，不引第三方）
│       └── report-writer.md     🟣 sonnet · 日报/周报/Sprint Review/Changelog（只写 reports/，机密自动打码）
│
├── backend/                     Node.js 20 + Express 4
│   ├── Dockerfile               多阶段、tini PID1、非 root、HEALTHCHECK
│   ├── package.json
│   ├── .dockerignore
│   └── src/
│       ├── index.js             入口（启动 / 健康检查 / 优雅关闭）
│       ├── routes.js            HTTP 路由 · /api/server-info / commitments
│       └── db.js                数据访问层（连接池 + 事务 + ensureSchema · 含 commitments 表）
│
└── frontend/                    Nginx 1.27 + 单文件 PPT（Vercel 同源托管）
    ├── Dockerfile
    ├── nginx.conf               本地：静态服务 + /api 反代 + 旧链接 301
    ├── vercel.json              云端：安全 header + 旧链接 301
    ├── api/[...path].js         Vercel Edge：/api/* → Railway BACKEND_URL
    └── index.html               ⭐ 唯一入口
                                  ├ PPT（11 页 · 暗色 · Lenovo 红 + 紫 + 青）
                                  ├ 顶部右上：📝 录入 · 🎯 抽人 · 🤝 承诺 · 📥 PDF · ⛶ 全屏
                                  ├ 录入弹窗（学员手机扫 P2 二维码自动进）
                                  ├ 抽人弹窗（讲师沉浸式抽人）
                                  └ 承诺墙弹窗（收尾互动 · 学员扫 P11 二维码自动进）
```

---

## 🎯 4 招工程化 · 在本项目里怎么落地

| 招式 | 文件位置 | 一句话 |
|---|---|---|
| ① **CLAUDE.md** | [`CLAUDE.md`](./CLAUDE.md) | 项目宪法。AI 改任何代码前必读。Stack / Conventions / Don't / How to run / 给 AI 特别指令 5 节 |
| ② **Cursor Rules** | [`.cursor/rules/*.mdc`](.cursor/rules/) | 4 个文件分层：general（全局）+ backend/frontend/db（按 globs scope） |
| ③ **MCP** | [`.cursor/mcp.json`](.cursor/mcp.json) | 5 个常见 server 的配置示范（browser / postgres / github / jira / filesystem），默认 `enabled: false` |
| ④ **Hooks & Subagent** | [`.claude/settings.json`](.claude/settings.json) + [`.claude/agents/`](.claude/agents/) | PreToolUse 拦危险命令、PostToolUse 自动 syntax check、SubagentStart/Stop 切换可视化、Stop 提醒 checklist；**5 个 subagent**（按 Anthropic v2.x 官方最佳实践，全部含 model/color/memory/disallowedTools/maxTurns） |

> 🔥 把这一坨 commit 进自己的项目，AI 第一天就能"开口讲规矩"。

---

## 入口速查

| 入口 | 地址 | 谁用 |
|---|---|---|
| **PPT（唯一入口）** | http://<LAN_IP>:8080 | 讲师投影 |
| 录入弹窗（深链） | http://`<LAN_IP>`:8080/#enroll | 学员手机扫 P2 二维码 |
| 抽人弹窗（深链） | http://<LAN_IP>:8080/#pick | 讲师顶部 🎯 唤起 |
| 承诺墙（深链） | http://`<LAN_IP>`:8080/#commit | 收尾互动 · 学员手机扫 P11 二维码 |
| 兼容旧链接 | `/enroll.html` → `/#enroll` 等 | 历史收藏夹 301 重定向 |
| 后端 API | http://<LAN_IP>:8080/api/{people,picks,stats,commitments,server-info} | 程序对接 |
| 健康检查 | http://<LAN_IP>:8080/readyz | 运维 |

---

## 现场分享会标准用法

### Day 1 · 30 分钟主分享

1. **5 分钟前**：`./start.sh`（首次会自动探测 LAN_IP 写入 .env）
2. **投影 PPT**：http://<LAN_IP>:8080，`F` 全屏
3. **P2 开场抽人**：屏幕显示二维码 → 学员扫码进 `#enroll` 录名字 → 现场抽 1 人破冰
4. **正文 8 分钟讲 4 招**（CLAUDE.md / Rules / MCP / Hooks）
5. **P11 收尾承诺墙**：屏幕显示二维码 → 学员扫码进 `#commit` 写承诺 → 讲师按"🎯 念 1 个"现场抽承诺念出来
6. **导出 PDF**：右上角 📥 → 浏览器另存为 PDF（@media print 已优化为 A4 横版每页一张 slide）
7. **结束**：`docker compose down`（保留数据，下周回访承诺墙）

### Day 2 · 60 分钟实战工作坊

详见 [`workshop-day2.md`](./workshop-day2.md)。每人带一个手上的真实项目，下课交 4 个文件 PR：
1. 一份 CLAUDE.md
2. 至少 2 条 .cursor/rules/*.mdc
3. 一个生效的 Claude Code Hook
4. 一个 Subagent 定义

---

## 业内最佳实践对照表

| 维度 | 实践 | 对应文件 |
|---|---|---|
| 架构 | 三层：HTTP routes → 业务/db → DB | `backend/src/{index,routes,db}.js` |
| 容器化 | 多阶段构建、tini PID1、非 root、HEALTHCHECK | `backend/Dockerfile` |
| 编排 | depends_on healthy、命名 volume、bridge network、restart policy | `docker-compose.yml` |
| 数据库 | pg.Pool 连接池、参数化 SQL、事务保护、幂等迁移、UNIQUE 约束 | `backend/src/db.js` |
| 健康检查 | `/healthz`（liveness） + `/readyz`（带 DB ping）双探针 | `backend/src/index.js` |
| 优雅关闭 | SIGTERM 关 server + 释放 pool + 10s 兜底 | `backend/src/index.js` |
| 反向代理 | Nginx 同源 `/api/` → backend，**避免浏览器 CORS** | `frontend/nginx.conf` |
| 缓存策略 | 静态资源 7 天 immutable，HTML no-cache | `frontend/nginx.conf` |
| 安全 header | X-Content-Type-Options / X-Frame-Options / Referrer-Policy | `frontend/nginx.conf` |
| 输入校验 | 名字 1-32 字符 + 控制字符过滤 / count 1-10 / commitment 4-280 | `backend/src/routes.js` |
| 错误响应 | 业务态：`{ code, message }` + 合理 HTTP status | `backend/src/routes.js` |
| 配置管理 | 12-factor，全部走环境变量 + `.env.example` 入库 | `docker-compose.yml` / `.env.example` |
| **工程化 AI** | CLAUDE.md / Cursor Rules / Hooks / Subagent | 项目根目录 4 个文件夹 |

---

## 常用命令速查

```bash
# ===== 🚀 重新打包部署（改完代码必看）=====
# 改了 backend 代码（Node.js）→ 重建 backend 镜像并热替换容器
docker compose up -d --build backend

# 改了 frontend 代码（index.html / nginx.conf）→ 重建 frontend
# ⚠️ nginx Dockerfile 用的是 COPY .，build cache 不识别"删除的文件"，
#    遇到老文件还在/改的样式没生效，加 --no-cache 强制重打
docker compose build --no-cache frontend && docker compose up -d frontend

# 改了多个服务 / 改了 docker-compose.yml → 全量重建
docker compose up -d --build

# 改了 .env 里的环境变量 → 必须 down 再 up（restart 不会重读 env）
docker compose down && docker compose up -d

# 疑难杂症兜底（连基础镜像层都丢掉，时间换确定性，60-120s）
docker compose down
docker compose build --no-cache
docker compose up -d

# 代码没改、只想重启容器（清进程内存，不重新构建镜像）
docker compose restart backend

# 重建后看一眼新镜像是否生效（CREATED 时间应是几秒前）
docker images | grep lenovo-vibe-stage

# ===== 📋 看日志 / 排查 =====
# 看实时日志
docker compose logs -f backend
docker compose logs -f db

# 进 backend 容器
docker compose exec backend sh

# 进数据库
docker compose exec db psql -U roster -d roster
#   \dt                          # 看表（people / picks / commitments）
#   SELECT * FROM people;
#   SELECT * FROM picks;
#   SELECT * FROM commitments ORDER BY created_at DESC;

# 看容器健康（STATUS 列要是 healthy 才算就绪）
docker compose ps

# ===== 🛑 停止 / 清理 =====
# 全部停止（保留数据卷，下次 up 还在）
docker compose down

# 全部停止 + 销毁数据（承诺墙 / 录入名单全清空）
docker compose down -v

# 清掉本项目所有镜像（彻底从零开始，配合 down -v 用）
docker images | grep lenovo-vibe-stage | awk '{print $3}' | xargs -r docker rmi -f
```

> 💡 **黄金法则**（来自 [`CLAUDE.md`](./CLAUDE.md) 第 6 节）：
> - 改了代码用 `up -d --build`，**不要**用 `restart`——restart 不重新构建镜像
> - 删了前端文件用 `build --no-cache frontend`——nginx 的 `COPY .` 会被 cache 骗
> - 改了 `.env` 用 `down && up`——`up` 单独跑不会重读环境变量

---

## API 速查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/people` | 列出所有人 |
| POST | `/api/people` | 录入：`{ name }` |
| DELETE | `/api/people/:id` | 删除某个人 |
| POST | `/api/picks` | 抽人：`{ count, session?, excludePicked? }` |
| GET | `/api/picks` | 抽人历史（`?session=xxx`） |
| DELETE | `/api/picks` | 清空抽人历史 |
| GET | `/api/stats` | `{ total, picked, commitments }` |
| GET | `/api/commitments` | 承诺墙列表（`?limit=50`） |
| POST | `/api/commitments` | 加承诺：`{ name, action }` |
| DELETE | `/api/commitments` | 清空承诺墙 |
| GET | `/api/server-info` | 返回宿主机 LAN IP（二维码用） |
| GET | `/healthz` | 进程存活（liveness） |
| GET | `/readyz` | 进程 + DB 都就绪（readiness） |

响应统一格式：

```json
{ "code": 0, "data": ..., "message": "ok" }
```

---

## 想自己用 Vibe Coding 重做一遍？

参照 4 轮 Prompt 思路（你可以直接把每轮粘进 Cursor / Claude Code）：

1. **Round 1 · 先写 CLAUDE.md（不写一行代码）** —— "我要做一个 Lenovo 团队抽人系统：Node 20 + Express 4 + pg + Postgres 16 + Nginx + Docker。请按 5 节生成 CLAUDE.md：Stack / Conventions / Don't / How to run / 给 AI 特殊指令。"
2. **Round 2 · 后端 + DB + Docker** —— "按 CLAUDE.md，搭出 backend/、docker-compose.yml、.env.example，3 个表 people / picks / commitments，幂等 ensureSchema，提供 /api/people /api/picks /api/commitments /api/stats /api/server-info /healthz /readyz。"
3. **Round 3 · 前端单页 PPT** —— "按 CLAUDE.md，frontend/index.html 单文件 11 页 PPT，暗色 + Lenovo 红，三个 modal（enroll/pick/commit），URL hash 路由。CDN 引 qrcodejs + html2pdf。"
4. **Round 4 · 改 bug + 收尾** —— "右上角加 PDF 导出 + 加 @media print 样式让所有 slide 平铺。承诺墙 P11 加二维码 + 抽 1 条念出来按钮。"

---

## 维护人

**张展亮** · Lenovo 大前端团队 · 目前主要负责 **Studio AI** 项目
- itcode：`zhangzl39`
- 微信/手机：`17310568690`
- 仓库：<https://github.com/zzlw/lenovo-vibe-stage>

> Made with Vibe Coding ✨
