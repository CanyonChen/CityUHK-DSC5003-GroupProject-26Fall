# 票务 API

用户端和管理端共用 Express API，默认地址为 `http://127.0.0.1:3000`。下列路径直接接在端口后。公开活动看板另外读取 `pages/data/` 中的 CAP 公告，票务 API 只管理演示演出。[本地启动指南](local-run-guide.md) · [路由源码](../server/src/routes/)

## 请求与响应

- 请求体使用 JSON。成功响应通常包含 `code: "OK"`、`message`、`data` 和 `request_id`。失败时读取 HTTP 状态、`code`、`message` 及可选的 `details`。响应头 `X-Request-Id` 可用于查找对应日志。
- 登录后，向受保护的端点发送 `Authorization: Bearer <token>`。默认令牌有效期为 8 小时。注销会递增该账号的令牌版本，现有会话需重新登录。
- 支持分页的列表接受 `page`（默认 1）和 `page_size`（默认 20，最大 100），并在 `data` 中返回 `items`、`page`、`page_size`、`total`。日期筛选使用 `YYYY-MM-DD`；场次的日期范围按香港时间计算。带时刻的响应使用 ISO 8601，金额以整数分表示，默认币种为 HKD。
- 创建订单、申请退款、提交核销时必须发送 `Idempotency-Key`，长度为 1 至 100 个字符。同一操作重试时沿用原键。下单或申请退款的首次创建返回 `201`，成功重放时返回 `200`。

在 PowerShell 中读取公开数据：

```powershell
$api = 'http://127.0.0.1:3000'
(Invoke-RestMethod "$api/events?page=1&page_size=5").data.items
```

### 账号与健康检查

| 方法与路径 | 用途 |
|---|---|
| `GET /health` | 数据库可用时返回 `200` 与 `data.db = "ok"`，不可用时返回 `503`。 |
| `POST /auth/register` | `user_name`（4–20 字符）、`password`（8–64 字符）、可选 `display_name`。创建购票账号。 |
| `POST /auth/login` | 发送 `user_name` 和 `password`，从 `data.token` 取登录令牌，从 `data.user` 取用户信息。 |
| `GET /auth/me` | 读取当前用户和角色。 |
| `POST /auth/logout` | 注销当前账号已有令牌，成功返回 `204`。 |

### 场次与座位

| 方法与路径 | 查询参数与结果 |
|---|---|
| `GET /events` | 按 `keyword` 搜索，分页返回公开演出。 |
| `GET /events/:eventId` | 演出名称、简介、主办方和媒体。 |
| `GET /performances` | 可按 `event_id`、`date_from`、`date_to`、`sales_status` 分页筛选。销售状态接受 `all`、`on_sale`、`paused`、`closed`。 |
| `GET /performances/:performanceId` | 场次的时间、场馆、票价区和销售状态。 |
| `GET /performances/:performanceId/seats` | 读取座位布局和 `session_seat_id`；附带有效令牌时还可识别本人持有的座位。 |
| `GET /performances/:performanceId/seat-recommendations` | 必填 `party_size`（2–4）、`region`，可选 `budget_cents`（整组总预算）、`limit`（默认 3，最多 10）。返回同排、不跨通道的可售组合。推荐时库存保持原状；创建订单时才锁座。 |

### 订单、支付与票据

登录用户从座位图取得 `session_seat_id`，用同一场次的座位创建订单，再凭 `order_id` 创建支付尝试。开发环境可模拟支付结果，成功后从 `/tickets` 查看生成的票据。

| 方法与路径 | 请求或行为 |
|---|---|
| `POST /orders` | `performance_id`、`session_seat_ids` 数组、幂等键。默认每单最多 4 个座位。整组预留成功后返回 `order_id`、价格与 `expires_at`，任一座位冲突则回滚整单。 |
| `GET /orders` | 本人的订单，可按 `status`、`date_from`、`date_to` 分页筛选。 |
| `GET /orders/:orderId` | 本人或管理员读取订单、座位明细及付款、退款、票据情况。 |
| `POST /orders/:orderId/cancel` | 取消本人待支付订单，释放仍归该订单持有的座位。 |
| `POST /orders/:orderId/refund` | 本人申请整单退款，需幂等键，`reason` 可选；默认在开演前 24 小时截止。 |
| `POST /payments` | 发送 `order_id` 创建支付尝试，已有可用尝试时复用。 |
| `GET /payments/:paymentId` | 查询支付尝试的处理状态。 |
| `POST /payments/:paymentId/simulate` | 测试模式下，`result` 接受 `SUCCESS`、`FAIL` 或 `TIMEOUT`。 |
| `POST /payments/notify` | 支付通知使用 `X-Signature` 校验原始请求体的 HMAC-SHA256。提交 `payment_id`、`provider_txn_id`、`result`（`SUCCESS` 或 `FAIL`）、`amount_cents`、`currency`、`order_no`。 |
| `GET /tickets` | 本人的票据，可按 `status`、`date_from` 分页筛选。 |
| `GET /tickets/:ticketId` | 本人或管理员读取票面、短期 `qr_token` 和已有的核销记录。 |
| `GET /tickets/:ticketId/qr.png` | 返回 `image/png` 和 `Cache-Control: no-store`。二维码默认 60 秒有效。 |

建单请求体示例（ID 取自本机座位图）：

```json
{"performance_id": 1, "session_seat_ids": [12, 13]}
```

`409 SEAT_UNAVAILABLE` 时应重新读取座位图。`401` 表示需要重新认证，`403` 表示当前账号未获该操作的权限，`400 VALIDATION_ERROR` 表示请求字段有误。

## 管理 API

`/admin/` 下的路由均要求登录。以下活动、库存和财务接口要求 `ADMIN` 角色，验票工作区另外开放给获授权的 `CHECKER`。

### 节目与库存

| 方法与路径 | 请求或行为 |
|---|---|
| `GET /admin/venues` | 可供排期使用的场馆列表。 |
| `GET /admin/events` | 分页查询活动，支持 `keyword`、`status`。 |
| `POST /admin/events` | 创建活动。必填 `title`、`organizer_name`，可选 `description`、`cover_url`。 |
| `PATCH /admin/events/:eventId` | 更新活动文案、主办方或封面，提交要变更的字段。 |
| `GET /admin/performances` | 按 `event_id`、`status`、`date_from`、`date_to` 分页筛选场次。 |
| `GET /admin/performances/:performanceId` | 场次配置与票价区。 |
| `POST /admin/performances` | 新建场次，提交 `event_id`、`venue_id`、`starts_at`、`sale_start_at`、`sale_end_at`、`checkin_start_at`、`checkin_end_at` 和 `price_tiers`。每个票价区包含 `tier_name`、`price_cents`。 |
| `PATCH /admin/performances/:performanceId` | 修改场次时间窗口或场馆，服务端校验场次状态和已有订单。 |
| `POST /admin/performances/:performanceId/publish` | 发布已完成配置的场次。 |
| `POST /admin/performances/:performanceId/sales` | `action` 取 `pause` 或 `resume`。 |
| `PATCH /admin/performances/:performanceId/price-tiers` | 提交 `tiers` 数组，包含票价区名称、价格及可选 `tier_id`。 |
| `PATCH /admin/session-seats/:sessionSeatId` | 设置单座的 `status` 为 `AVAILABLE` 或 `BLOCKED`。 |
| `PATCH /admin/performances/:performanceId/seat-status` | 按 `session_seat_ids`，或按 `region` 和可选 `row_no`，批量变更 `status`。 |
| `GET /admin/performances/:performanceId/occupancy` | 各区域及全场的座位、成交和核销汇总。上座率的分母排除停用座位。 |

### 验票工作区

| 方法与路径 | 请求或行为 |
|---|---|
| `GET /admin/checker/performances` | 返回当前账号可以核销的场次。 |
| `POST /admin/checkins` | 提交 `performance_id`、`ticket_code`（票码或二维码令牌）及幂等键。服务端核对场次授权、核销时间和票据状态。 |
| `GET /admin/checkins` | 读取权限范围内的核销记录，支持 `performance_id`、`date_from`、`date_to` 和分页。 |

### 用户、统计与对账

| 方法与路径 | 请求或行为 |
|---|---|
| `GET /admin/users` | 按 `keyword`、`role` 分页查询用户。 |
| `POST /admin/users/:userId/roles` | 提交 `role`；验票场次授权另附 `performance_id`。 |
| `DELETE /admin/users/:userId/roles/:assignmentId` | 撤销指定授权，成功返回 `204`。 |
| `GET /admin/stats` | 按 `performance_id`、`date_from`、`date_to` 查询销售、退款和核销汇总。 |
| `GET /admin/orders` | 跨用户订单查询，支持 `keyword`、`status`、`performance_id`、日期和分页。 |
| `GET /admin/payments/exceptions` | 查询待处理或异常支付，支持 `type` 和分页。 |
| `POST /admin/payments/:paymentId/reconcile` | 为支付尝试记录一次人工对账结果。 |
| `GET /admin/refunds` | 退款记录，按 `status`、`order_id` 分页查询。 |
| `POST /admin/refunds/:refundId/resolve` | `result` 为 `SUCCEEDED` 或 `FAILED`。成功退款会作废相应票据并释放库存。 |
| `GET /admin/reconciliation/status` | 查询后台对账任务的配置与最近一次运行状态。 |
| `POST /admin/reconciliation/run` | 主动执行一轮对账。 |
| `GET /admin/audit-logs` | 按 `object_type`、`object_id`、`action`、日期和分页查找审计日志。 |

## 实时刷新

连接 `ws://127.0.0.1:3000/ws`。订阅成功后先收到 `connected`；订单、库存等数据成功变更后收到 `data.changed`。`order_id` 与 `performance_id` 仅在服务端能确定范围时出现。收到相关变更时，客户端应使用原有登录身份重新读取 REST 数据。

```json
{"type":"data.changed","at":"2026-11-22T12:00:03.120Z","path":"/orders","order_id":595,"performance_id":1}
```

本地 HTTP 和 WebSocket 配置允许来自 `http://localhost`、`http://127.0.0.1` 的浏览器来源（可带端口）。前端失去 WebSocket 连接时仍能通过 REST 读取和提交数据。[实时通道实现](../server/src/realtime.js)

## Audit additions (2026-11-28)

- `GET /admin/performances/:performanceId/seats` requires ADMIN and can return a draft seat map. The public `GET /performances/:performanceId/seats` keeps drafts private.
- Order details include `refund_policy.cutoff_hours_before_start` and `refund_policy.partial_allowed`.
- Refund replay first verifies the order owner and returns the existing refund plus the current order status. Its key is stored as `refund:<order_id>:<key>`, so the full stored value must fit 100 characters; an overlong value returns 400.
- Confirming an excess/late-payment refund leaves order, ticket and seat state unchanged. A successful confirmation clears that payment attempt's awaiting-refund marker.
