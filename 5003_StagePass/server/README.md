# 售票系统 API（T1 + T2 + M1 + M2 + M3）

双前端共用的 Express 服务：用户端（8080）与管理端（8081）都请求 `http://localhost:3000`。M1 实现用户端下单、模拟支付与出票；M2 补齐用户退票和管理端运营接口；M3 补齐自助注册、服务端退出吊销、用户与角色授权、自动对账 worker。

## 前置

- Node 20+（本机 v22 已验证）
- MariaDB/MySQL 已启动，`ticketing_system` 已导入（用 `scripts\reset_demo.ps1`）

## 安装与启动

```powershell
cd ticketing-app\server
npm install
Copy-Item .env.example .env   # 按本机情况改数据库账号
npm run dev                   # 或 npm start
```

看到 `[api] listening on http://127.0.0.1:3000` 即启动成功；`/health` 返回 `db:"ok"` 说明数据库连接正常。

## 当前已实现的端点（T1 + T2 + M1 + M2 + M3）

| 端点 | 说明 |
|---|---|
| `GET /health` | API-05。真实 ping 数据库；`db:"down"` 时返回 503 |
| `POST /auth/register` | API-01。自助注册，成功后默认 `USER`；账号重复返回 409 `USERNAME_TAKEN` |
| `POST /auth/login` | API-02。`{user_name, password}` → `token`、`expires_in`、`user.roles`；JWT 含 `tv` |
| `POST /auth/logout` | API-03。`token_version + 1`，该用户全部已签发 token 立即 401；返回 204 |
| `GET /auth/me` | API-04。需 `Authorization: Bearer <token>`；角色每次从数据库重读 |
| `GET /events` | API-06。`keyword`、`page`、`page_size`；草稿活动不出现 |
| `GET /events/{id}` | API-07。封面 + 销售未截止的场次摘要；草稿活动 404 |
| `GET /performances` | API-08。`event_id`、`date_from`、`date_to`、`sales_status`；日期按 HKT 日历日 |
| `GET /performances/{id}` | API-09。销售/核销窗口、票价档、四类座位计数、限购与退款策略 |
| `GET /performances/{id}/seats` | API-10。座位图（含坐标与布局）；带 token 时返回 `holder_mine`，坏 token 按匿名 |
| `GET /performances/{id}/seat-recommendations` | API-47。2–4 人、区域与总预算的同排连座推荐；只读、不预留，无组合返回空数组 |
| `POST /orders` | API-11。必须带 `Idempotency-Key`；1–4 座、整组锁座、5 分钟预留 |
| `GET /orders` | API-13。本人订单，按状态 / HKT 日期筛选与分页 |
| `GET /orders/{id}` | API-12。订单明细、支付尝试、票据与退款摘要；本人或 ADMIN |
| `POST /orders/{id}/cancel` | API-14。释放 HELD 座位；重复取消幂等 |
| `POST /payments` | API-16。为待支付订单创建/复用支付尝试 |
| `POST /payments/{id}/simulate` | API-18。test 模式下模拟 `SUCCESS/FAIL/TIMEOUT` |
| `POST /payments/notify` | API-19。HMAC-SHA256 验签；去重、迟到退款、金额不符记 REJECTED |
| `GET /payments/{id}` | API-17。支付状态、`provider_txn_id` 与退款列表 |
| `GET /tickets` | API-20。本人票据，按签发时间倒序 |
| `GET /tickets/{id}` | API-21。票面 + 60 秒 `qr_token` + 核销信息 |
| `GET /tickets/{id}/qr.png` | API-22。320px PNG，`no-store` |
| `POST /orders/{id}/refund` | API-15。本人 PAID、开场前 ≥24h、全票 VALID；必须带 `Idempotency-Key`，同键 replay 返回原退款 |
| `GET /admin/events` · `POST` · `PATCH /{id}` | API-23–25。活动列表、新建、编辑（ADMIN） |
| `GET /admin/performances` · `POST` · `PATCH /{id}` | API-26–28。场次列表、建草稿、编辑窗口（ADMIN） |
| `POST /admin/performances/{id}/publish` · `/sales` | API-29–30。发布、pause/resume |
| `PATCH /admin/performances/{id}/price-tiers` | API-31。改票价档 |
| `PATCH /admin/session-seats/{id}` | API-32。单座 `AVAILABLE`/`BLOCKED` |
| `GET /admin/checker/performances` · `POST /admin/checkins` · `GET /admin/checkins` | API-33–35。授权场次、验票、核销记录；验票必须带 `Idempotency-Key` |
| `GET /admin/stats` · `GET /admin/orders` | API-36–37。场次统计、订单查询 |
| `GET /admin/payments/exceptions` · `POST /admin/payments/{id}/reconcile` | API-38/40。支付异常与对账登记（不清除异常） |
| `GET /admin/refunds` · `GET /admin/audit-logs` | API-39/41。退款进度、审计日志 |
| `GET /admin/users` | API-44。用户搜索、角色筛选、分页；返回有效角色授权 |
| `POST /admin/users/{user_id}/roles` | API-45。授予 ADMIN 或 CHECKER；CHECKER 必须带场次；重复授权 409 `ROLE_ALREADY_ASSIGNED` |
| `DELETE /admin/users/{user_id}/roles/{assignment_id}` | API-46。撤销角色，下一次请求立即 403；最后一个 ADMIN 返回 409 `LAST_ADMIN` |
| `GET /admin/reconciliation/status` · `POST /admin/reconciliation/run` | 9.3。自动对账状态与手动触发；返回 pending / processed_24h / failed_24h / last_run_at |
| `GET /admin/venues` · `GET /admin/performances/{id}` | 管理端读辅助：场馆座位数、场次详情含 `price_tiers` |

T3 起在同一骨架上继续加分组路由：`src/routes/*.js`，权限用 `requireRole('ADMIN')` / `requireRole('CHECKER')`。

## 目录

```
src/
  server.js          启动、优雅退出
  app.js             中间件装配（CORS、JSON、request_id、日志、404、错误）
  config.js          环境变量与常量（含 sql_mode、限购/退款规则）
  db.js              mysql2 连接池（每条连接设严格模式与 UTC）
  lib/http.js        统一响应包、ApiError、错误处理
  lib/params.js      分页/整数/日期参数校验
  lib/body.js        M1 请求体校验、Idempotency-Key
  lib/format.js      M1 订单号、座位标签、金额/ISO 时间
  lib/audit.js       M1 审计写入（兼容连接与 query）
  middleware/auth.js JWT 校验、可选鉴权与角色校验（401/403）
  services/auth.js   注册、登录、服务端退出、当前用户与角色聚合
  services/users.js  M3 用户列表、授予/撤销角色（含最后管理员保护）
  services/catalog.js 活动/场次/座位图查询
  services/orders.js 下单事务、幂等、CFG-04、到期清理
  services/payments.js 支付尝试、模拟支付、通知、出票、迟到退款
  services/tickets.js 票据列表/详情/QR
  services/refunds.js M2 退款申请与终态确认（成功/失败、票据与座位联动）
  services/admin.js  M2 管理端活动/场次/票价/座位/验票/统计/审计
  services/reconciliation.js M3 自动对账 worker（重放未处理支付通知）
  routes/health.js   /health
  routes/auth.js     /auth/register、/auth/login、/auth/logout、/auth/me
  routes/events.js   /events、/events/:id
  routes/performances.js /performances、/:id、/:id/seats
  routes/orders.js   /orders、/:id、/:id/cancel、/:id/refund
  routes/payments.js /payments、/:id、/:id/simulate、/notify
  routes/tickets.js  /tickets、/:id、/:id/qr.png
  routes/admin.js    /admin/*（M2 全部运营端点）
```

## 约定

- 响应统一 `{code, message, data, request_id}`；成功 `code:"OK"`。
- 数据库会话固定 `time_zone='+00:00'`，`DATETIME(3)` 按 UTC 存取；API 输出 ISO 8601（`Z`），界面按 `Asia/Hong_Kong` 展示。
- 错误码见 `docs/api-contract.md` §2.3，不在路由里临时造码。
- 账号角色 = `USER` + `role_assignments` 中未撤销的 `ADMIN`/`CHECKER`。鉴权中间件每次请求都重读数据库角色，并比对 `users.token_version` 与 JWT 的 `tv`；授权或撤销立即生效，退出后旧 token 立即 401。
- `token_version` 是全局吊销：同一账号的所有设备 token 一起失效。若未来要求“只退当前设备”，需要另加 session 表或黑名单。
- 自动对账默认每 300 秒扫一批最多 50 条、龄期 120 秒的 `PENDING` 通知，用 `payload_json` 重算 HMAC 后重放；`RECONCILE_INTERVAL_SECONDS` / `RECONCILE_BATCH_SIZE` / `RECONCILE_MIN_AGE_SECONDS` 可调，`RECONCILE_ENABLED=0` 可关闭。测试支付适配器不能真实查询网关，退款终态仍由 API-43 人工确认。
- JWT 默认 8 小时；生产环境必须设置 `JWT_SECRET`（`NODE_ENV=production` 时使用默认密钥会拒绝启动）。
- 密码用 bcrypt 校验（`bcryptjs`，兼容 Python 端 `$2b$` 哈希），不存明文。

## 自测

```powershell
cd ..\..\scripts
.\smoke.ps1          # T1：5 条
.\catalog_check.ps1  # T2：32 条
.\m1_check.ps1       # M1：19 条断言，覆盖下单/幂等/支付/出票/QR/取消/并发
.\m2_check.ps1       # M2：45 条断言，角色/活动/场次/票价/单座与批量封座/验票/退款终态/对账/统计
.\m3_check.ps1       # M3：33 条断言，注册/退出吊销/角色授权/自动对账/退款边界
.\perf_smoke.ps1     # M3：5 条核心读接口冒烟耗时；完整 P95 与 EXPLAIN 在 M4
```

预期全部 PASS；API 未启动时输出 SKIP 并 exit 0。`m1_check.ps1` / `m2_check.ps1` 会写入测试订单与场次，跑完用 `.\reset_demo.ps1` 恢复。

## 已知限制（M2 阶段）

- 未实现注册、退出（API-01/03，T1 范围外）。
- 未做登录限流；`RATE_LIMITED` 留到后续按需实现。
- 活动列表 `min_price_cents` 取该活动全部在售场次最低价；`venue_name` 在多场馆时为 `Multiple venues`。
- 座位图每次全量返回该场座位（最多 350 条），暂未做增量或分页。
- 角色以 token 快照为准，撤销授权不会立刻让已发 token 失效。
- 仅监听本机；部署到其他机器时改 `HOST=0.0.0.0` 并自行处理防火墙与 HTTPS。
- 管理端已覆盖活动、场次、票价、单座/批量/整区封座、验票、订单、退款申请与终态确认、支付异常、审计与统计；验票输入票码文本，不要求摄像头或硬件扫码。
- `session_seats` 支持单座与批量在 `AVAILABLE` 与 `BLOCKED` 间切换；`HELD`/`SOLD` 始终跳过，批量操作在事务内写审计。
- `npm run dev` 使用 `node --watch`；新增依赖或语法错误会整体退出，需重启。
- 用户端为 Vue 3 + Vite；课程模板是 Vue 2 + webpack，页面视觉与结构对齐，技术栈差异已在交付说明注明。
