# API 接口契约（双前端共用）

> 版本 v1.10（2026-11-23）｜对应需求《售票系统需求规格说明书》v1.6｜端口 3000
> 本文是前后端与验收脚本的唯一接口口径。改接口先改本文，再改前端 mock 与 `scripts\smoke.ps1`。
> v1.1 变更：角色代码统一为 `USER`/`ADMIN`/`CHECKER`（与 `role_assignments.role` 一致）；补 503 错误码。
> v1.2 变更：活动字段 `title`→`name`、`event_title`→`event_name`（与 DDL 列名一致）；座位补 `coordinates`；明确列表包结构与座位计数、退款策略字段。
> v1.3 变更（M1 对齐）：订单/票据列表统一 `event_name`；订单列表补 `venue_name`、`order_no`；`seat_label` 统一为 `区域-排-座`（如 `A-1-2`）；API-19 金额/币种/订单号不符时返回 409，并将该通知落库为 `REJECTED`；订单预留时长统一为 5 分钟（CFG-03）。
> v1.4 变更（M2 对齐）：补 API-15 退款成功/重放/拒绝字段；明确 API-34 仅 ADMIN 或获授权该场次的 CHECKER 可调用；API-40 只登记对账结果、不清除支付异常（FR-12）；新增两个不计入 41 条契约的 UI 辅助读接口（`GET /admin/venues`、`GET /admin/performances/{id}`），见 9.1。
> v1.5 变更（M2 补全）：新增 API-42 批量/整区停用座位；新增 API-43 管理员确认退款成功/失败（成功作废票据并释放座位，失败恢复 PAID/VALID）；错误码新增 `REFUND_ALREADY_RESOLVED`；验票明确为票码或 JWT 文本校验，不要求摄像头。
> v1.6 变更（M3 补全）：API-03 退出改为服务端吊销（`users.token_version` 递增，旧 token 立即 401）；新增 API-44~46 用户与角色授权；新增 9.3 自动对账状态与手动触发辅助；错误码新增 `ROLE_ALREADY_ASSIGNED`、`LAST_ADMIN`；执行计划与 P95 归 M4，M3 只做核心查询冒烟计时。
> v1.7 变更（R1 实时刷新）：新增 11.1 WebSocket 失效信号；`/ws` 仅广播 `data.changed`（`type`、`at`、`path`），不携带业务数据；订阅不影响 REST 契约与权限，客户端收到后仍按原接口重取。
> v1.8 变更（R1 限制版）：`data.changed` 增加可选 `order_id`、`performance_id` 作用域；服务端按路径、请求体、`res.locals.realtime` 与数据库关联解析，解析失败退化为仅 `path`。客户端按作用域过滤，并采用 300 ms 防抖、500 ms 最短间隔、500 ms 最大等待、单请求在飞、隐藏暂停/回前台补一次、操作中暂停。帧仍不含金额、用户、座位或票码。
> v1.9 变更（P1 连座推荐）：新增 API-47 `GET /performances/{performance_id}/seat-recommendations`；按人数 2–4、区域与总预算返回同排、同相邻分组、无通道分隔的可售组合；推荐只读、不预留，按区域中心距离、总价、首个座位号确定性排序。无合适组合返回空数组，不拆散座位、不提高预算。
> v1.10 变更（Q-06 区域上座率）：新增 API-48 `GET /admin/performances/{performance_id}/occupancy`；按场次与 `seats.region` 汇总区域总座位、BLOCKED、可售座位、成交票数、核销数与上座率/入场率。成交票含 `VALID/USED/REFUND_PENDING`，可售分母排除 `BLOCKED`。

## 1. 适用范围与原则

- 用户购票端（8080）与管理端（8081）共用同一套 API 与同一数据库，前端不直连数据库。
- 权限一律服务端校验；前端隐藏按钮不算权限控制（FR-01、AC-01、AC-19）。
- 客户端传来的角色、金额、订单状态、票价一律不采信；金额与到期时间由服务端计算并持久化（FR-05、BR-06）。
- 字段名统一 `snake_case`，与数据库列名一致；对外不暴露 `password_hash`、完整票码以外的凭证。

## 2. 通用约定

### 2.1 地址、认证与响应包

| 项 | 约定 |
|---|---|
| Base URL | `http://localhost:3000`，统一前缀 `/`（不另加 `/api`） |
| 认证 | `Authorization: Bearer <JWT>`；JWT 8 小时有效，claims 含 `sub`（user_id）、`roles`（数组）、`tv`（用户 token_version）、`exp`；每次鉴权比对数据库 `users.token_version`，退出后旧 token 立即失效 |
| 成功响应 | `{"code":"OK","message":"","data":{...},"request_id":"..."}`，HTTP 200/201；删除类返回 204 无包体 |
| 失败响应 | `{"code":"SEAT_UNAVAILABLE","message":"座位已被占用","details":{...},"request_id":"..."}`，HTTP 4xx/5xx |
| 请求追踪 | 客户端可带 `X-Request-Id`，服务端原样回传；未带则由服务端生成 |
| 时间 | ISO 8601 UTC，如 `2026-11-21T12:00:00.000Z`；界面按 Asia/Hong_Kong 展示 |
| 金额 | 整数分 `*_cents`，币种单独字段 `currency`，本版固定 `HKD`；禁止浮点 |
| 分页 | `page` 从 1 开始，`page_size` 默认 20、最大 100；响应 `data` 为 `{items:[], page, page_size, total}` |
| 角色代码 | `USER`（购票用户）/ `ADMIN`（管理员）/ `CHECKER`（验票员），与 `role_assignments.role` 一致；所有账号至少含 `USER` |

### 2.2 幂等

| 端点 | 幂等键 | 规则 |
|---|---|---|
| `POST /orders` | 必填 `Idempotency-Key` | 同键同内容返回原订单（`201` 或 `200` + `replay:true`）；同键不同内容 `409 IDEMPOTENCY_CONFLICT`（FR-05、AC-05） |
| `POST /orders/{id}/refund` | 必填 `Idempotency-Key` | 同键复用原退款请求，不重复退款（FR-10） |
| `POST /admin/checkins` | 必填 `Idempotency-Key` | 同键同票只成功一次（FR-11、AC-18） |
| `POST /payments/notify` | 由 `provider_txn_id` 保证 | 重复投递返回 `DUPLICATE`，不重复出票（FR-07、AC-10） |

服务端保存键与请求内容摘要；键至少保留 24 小时。

### 2.3 错误码

| HTTP | code | 触发场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 参数缺失、类型错误、数量不在 1–4、跨场次座位、重复座位 |
| 401 | `UNAUTHORIZED` | 未带 token、token 失效 |
| 401 | `INVALID_CREDENTIALS` | 账号或密码错误（不区分两种情况） |
| 403 | `FORBIDDEN` | 角色不符、访问他人资源、验票员越权（AC-01、AC-19） |
| 404 | `NOT_FOUND` | 活动、场次、订单、票、支付不存在或无权可见 |
| 409 | `USERNAME_TAKEN` | 注册用户名重复 |
| 409 | `ROLE_ALREADY_ASSIGNED` | 目标用户已拥有同一角色（CHECKER 为同一场次） |
| 409 | `LAST_ADMIN` | 撤销后将没有有效管理员，操作被拒绝 |
| 409 | `SEAT_UNAVAILABLE` | 座位已被他人预留或售出、整组预留失败（AC-07） |
| 409 | `SALE_CLOSED` | 未开售、已截止、暂停销售、场次非 PUBLISHED（AC-03） |
| 409 | `LIMIT_EXCEEDED` | 超过 4 张，或同场次已有未到期待支付订单（CFG-02、CFG-04、AC-23） |
| 409 | `ORDER_EXPIRED` | 已过截止时间，失去出票资格（AC-12） |
| 409 | `ORDER_NOT_PAYABLE` | 订单非 PENDING_PAYMENT，或座位已不归该单 |
| 409 | `PAYMENT_MISMATCH` | 金额、币种、订单号、来源不符（AC-11） |
| 409 | `REFUND_NOT_ALLOWED` | 已核销、超退票期限、票非 VALID、订单未支付（AC-17） |
| 409 | `REFUND_ALREADY_RESOLVED` | 退款已确认成功/失败后，再次提交另一种结果 |
| 409 | `TICKET_ALREADY_USED` | 重复核销，返回首次核销时间与操作者（AC-18） |
| 400 | `TICKET_INVALID` | 票码不存在、已作废、退款中、非本场次 |
| 409 | `OUT_OF_WINDOW` | 不在核销窗口内（CFG-08） |
| 409 | `PERFORMANCE_LOCKED` | 已发布或已有订单后修改布局、开场时间、销售/核销窗口 |
| 409 | `SEAT_NOT_EDITABLE` | 停用/恢复的座位处于 HELD 或 SOLD |
| 409 | `IDEMPOTENCY_CONFLICT` | 同键不同内容 |
| 429 | `RATE_LIMITED` | 登录或下单频率超限（可选实施） |
| 503 | `SERVICE_UNAVAILABLE` | `/health` 探测到数据库不可用 |
| 500 | `INTERNAL` | 未预期异常，不返回堆栈 |

## 3. 角色与端点分组

| 分组 | 端点数 | 访客 | 购票用户 | 管理员 | 验票员 |
|---|---|---|---|---|---|
| 认证与健康检查 | 5 | 部分 | 是 | 是 | 是 |
| 活动/场次/座位浏览 | 6 | 是 | 是 | 是 | 否 |
| 订单 | 5 | 否 | 仅本人 | 只读查询 | 否 |
| 支付 | 4 | 否 | 仅本人订单 | 对账 | 否 |
| 票据 | 3 | 否 | 仅本人 | 否 | 否 |
| 管理：用户与角色 | 3 | 否 | 否 | 是 | 否 |
| 管理：活动与场次 | 11 | 否 | 否 | 是 | 否 |
| 验票工作区 | 3 | 否 | 否 | 是 | 仅授权场次 |
| 统计与对账 | 8 | 否 | 否 | 是 | 否 |

合计 48 个契约端点；另有四个不计编号的管理端辅助（见 9.1、9.3）。验票员登录管理端后只可见验票工作区，其余分组一律 `403 FORBIDDEN`。

## 4. 认证与健康检查

### API-01 注册

`POST /auth/register` · 访客 · FR-01

| 项 | 内容 |
|---|---|
| 请求体 | `user_name` 4–20 字符、唯一；`password` 8–64；`display_name` 可选 |
| 成功 | `201`，`data` 为 `user_id`、`user_name`、`display_name`、`roles:["USER"]` |
| 错误 | `USERNAME_TAKEN`、`VALIDATION_ERROR` |
| 说明 | 客户端传入的 `role` 一律忽略；新用户只获得 `USER` |

### API-02 登录

`POST /auth/login` · 访客 · FR-01

| 项 | 内容 |
|---|---|
| 请求体 | `user_name`、`password` |
| 成功 | `200`，`data` 为 `token`、`token_type:"Bearer"`、`expires_in`（秒）、`user`（含 `roles` 数组） |
| 错误 | `INVALID_CREDENTIALS`（账号不存在与密码错误同一码同一文案） |
| 说明 | 角色来自 `role_assignments`/`users`，不来自请求；token 的 `tv` 必须等于登录时数据库中的 `users.token_version` |

### API-03 退出

`POST /auth/logout` · 已登录 · FR-01

| 项 | 内容 |
|---|---|
| 请求体 | 无 |
| 成功 | `204` |
| 说明 | 服务端把 `users.token_version` 加 1，当前用户所有已签发 token 立即失效；客户端同时丢弃本地 token。写 `ROLE`/`AUTH` 审计记录 |

### API-04 当前用户

`GET /auth/me` · 已登录 · FR-01

| 项 | 内容 |
|---|---|
| 成功 | `200`，`data` 为 `user_id`、`user_name`、`display_name`、`roles`、`created_at` |
| 错误 | `UNAUTHORIZED` |

### API-05 健康检查

`GET /health` · 公开 · NFR-04、NFR-08

| 项 | 内容 |
|---|---|
| 成功 | `200`，`data` 为 `status:"ok"`、`db:"ok|down"`、`version`、`server_time` |
| 失败 | `503`，`code:"SERVICE_UNAVAILABLE"`，`data.db:"down"` |
| 说明 | 必须真实 ping 数据库；`db:"down"` 时整体返回 `503` |

## 5. 活动、场次与座位（读）

### API-06 活动列表

`GET /events` · 公开 · FR-03

| 项 | 内容 |
|---|---|
| 查询参数 | `keyword`、`page`、`page_size` |
| 成功 | `200`，列表项含 `event_id`、`name`、`cover_url`、`venue_name`、`next_performance_at`、`min_price_cents`、`currency`；`venue_name` 单一场馆给名称、多场馆给 `Multiple venues`；`min_price_cents` 取未来在售场次最低价 |
| 说明 | 只返回含已发布场次的活动；草稿活动不出现在用户端（AC-03） |

### API-07 活动详情

`GET /events/{event_id}` · 公开 · FR-03

| 项 | 内容 |
|---|---|
| 成功 | `200`，活动字段 + `media[]`（最多一张封面）+ `performances[]` 摘要（`performance_id`、`starts_at`、`status`、`available_seats`、`min_price_cents`）；只列销售未截止的 `PUBLISHED`/`SALES_PAUSED` 场次，按开场升序 |
| 错误 | `NOT_FOUND`（不存在或未发布） |

### API-08 场次列表

`GET /performances` · 公开 · FR-03

| 项 | 内容 |
|---|---|
| 查询参数 | `event_id`、`date_from`、`date_to`、`sales_status`（`on_sale|closed|paused|all`）、分页 |
| 成功 | `200`，含 `performance_id`、`event_id`、`event_name`、`venue_name`、`starts_at`、`sales_close_at`、`status`、`available_seats`、`min_price_cents` |
| 说明 | `status` 使用 DRAFT/PUBLISHED/SALES_PAUSED/FINISHED；用户端不返回 DRAFT |

### API-09 场次详情

`GET /performances/{performance_id}` · 公开 · FR-03、FR-04

| 项 | 内容 |
|---|---|
| 成功 | `200`，含开场时间、销售窗口、核销窗口、`price_tiers[]`（`tier_name`、`price_cents`、`currency`）、`seat_counts{available,held,sold,blocked}`、`purchase_limit:4`、`refund_policy{cutoff_hours_before_start:24,partial_allowed:false}` |
| 错误 | `NOT_FOUND`；`SALE_CLOSED` 仅用于下单，不在本接口返回 |

### API-10 座位图

`GET /performances/{performance_id}/seats` · 公开 · FR-04

| 项 | 内容 |
|---|---|
| 成功 | `200`，`seats[]` 含 `session_seat_id`、`region`、`row_no`、`seat_no`、`coordinates`、`status`、`price_cents`、`tier_name`、`holder_mine`；附 `layout`（`row_count`、`col_count`、通道与空位）与 `updated_at` |
| 说明 | 状态取 AVAILABLE/HELD/SOLD/BLOCKED；`holder_mine` 仅在登录时按当前用户返回，其他人一律 `false`，不暴露持有者身份（FR-04、AC-01）。页面可订阅 11.1 的 `/ws`，收到 `data.changed` 后重新调用本接口；客户端只接受 `performance_id` 等于当前场次或未带作用域的事件，其他场次事件忽略 |

### API-47 多人连座推荐

`GET /performances/{performance_id}/seat-recommendations` · 公开 · FR-14 · AC-25

| 项 | 内容 |
|---|---|
| 查询参数 | `party_size`（必填，2–4）、`region`（必填，区域名）、`budget_cents`（可选，整数分，总预算上限）、`limit`（可选，1–10，默认 3） |
| 成功 | `200`，`recommendations[]` 每项含 `seats[]`（`session_seat_id`、`seat_label`、`region`、`row_no`、`seat_no`、`price_cents`、`tier_name`）、`total_amount_cents`、`currency`、`adjacent_group`、`distance_to_region_center`、`reason`；外层含 `performance_id`、`party_size`、`region`、`budget_cents`、`currency`、`total`、`returned`、`limit`、`reservation_note`、`ranking` |
| 错误 | `VALIDATION_ERROR`（人数不在 2–4、区域为空、预算/数量格式错误）；`NOT_FOUND`；`SALE_CLOSED`（未开售、暂停或已截止） |
| 规则 | 只考虑 `AVAILABLE` 座位；同一 `adjacent_group`、同排、座位号连续，且不跨 `layout.aisles` 通道；组合总价不超过 `budget_cents`；无组合返回 `200` + 空数组，不拆散、不超预算。按离区域中心距离、总价、首个座位号升序排序；同一输入结果确定。本接口只读，不改变 `session_seats`；确认后仍由 API-11 在同一事务重新检查并整组预留（FR-05、BR-03） |

## 6. 订单

### API-11 创建订单（整组预留）

`POST /orders` · 购票用户 · FR-05、FR-06 · 必须带 `Idempotency-Key`

| 项 | 内容 |
|---|---|
| 请求体 | `performance_id`、`session_seat_ids[]`（1–4 个，同场次、不重复） |
| 成功 | `201`，`data` 含 `order_id`、`order_no`、`status:"PENDING_PAYMENT"`、`items[]`（座位与价格快照）、`total_amount_cents`、`currency`、`expires_at`、`created_at` |
| 错误 | `VALIDATION_ERROR`、`SEAT_UNAVAILABLE`、`SALE_CLOSED`、`LIMIT_EXCEEDED`、`IDEMPOTENCY_CONFLICT` |
| 说明 | 服务端在同一事务内锁座、建单、写明细；任一座位失败整组回滚（BR-03、AC-07）。`expires_at` 取「创建+5 分钟」与「售票截止」较早者（CFG-03）。请求中不得携带价格 |

### API-12 订单详情

`GET /orders/{order_id}` · 本人或管理员 · FR-09

| 项 | 内容 |
|---|---|
| 成功 | `200`，订单字段 + `items[]` + `payment_attempts[]` 摘要 + `refund`（如有）+ `tickets[]` 摘要 |
| 错误 | `FORBIDDEN`（非本人且非管理员）、`NOT_FOUND` |

### API-13 我的订单

`GET /orders` · 购票用户 · FR-09

| 项 | 内容 |
|---|---|
| 查询参数 | `status`、`date_from`、`date_to`、分页 |
| 成功 | `200`，列表项含 `order_id`、`order_no`、`performance_id`、`event_name`、`venue_name`、`starts_at`、`status`、`total_amount_cents`、`currency`、`expires_at`、`paid_at`；分页包 `items/page/page_size/total` |
| 说明 | 只返回本人订单；管理员用 API-37 |

### API-14 取消订单

`POST /orders/{order_id}/cancel` · 本人 · FR-06

| 项 | 内容 |
|---|---|
| 成功 | `200`，`data` 为 `status:"CANCELLED"`、`released_seats` |
| 错误 | `FORBIDDEN`、`ORDER_EXPIRED`（已过期按到期处理）、`ORDER_NOT_PAYABLE`（已支付，应走退款） |
| 说明 | 重复取消返回同样的 `200`，不产生二次库存变化；释放前校验座位仍属于该单（BR-08、AC-08） |

### API-15 申请退款（整单）

`POST /orders/{order_id}/refund` · 本人 · FR-10 · 必须带 `Idempotency-Key`

| 项 | 内容 |
|---|---|
| 请求体 | 无（退款原因可选 `reason`） |
| 成功 | `201`，`data` 为 `refund_id`、`status:"PENDING"`、`order_status:"REFUND_PENDING"`、`amount_cents` |
| 错误 | `REFUND_NOT_ALLOWED`（已核销、超 24 小时、票非 VALID）、`FORBIDDEN` |
| 说明 | 同事务内订单转 REFUND_PENDING、全部票转退款中、禁止核销（BR-10、AC-17）；金额取原付款，不接受客户端传值。同 `Idempotency-Key` 重放返回 `200` 与同一 `refund_id`，不新建退款 |

## 7. 支付

### API-16 创建支付尝试

`POST /payments` · 购票用户（本人订单）· FR-07

| 项 | 内容 |
|---|---|
| 请求体 | `order_id` |
| 成功 | `201`（新建）或 `200`（`reused:true`，已有未确定尝试）；`data` 含 `payment_id`、`status:"PENDING"`、`amount_cents`、`currency`、`order_expires_at` |
| 错误 | `ORDER_NOT_PAYABLE`、`ORDER_EXPIRED`、`FORBIDDEN` |
| 说明 | 金额由订单总额决定；同一订单同一时刻最多一个未确定尝试，未知时复用而非新建（FR-07） |

### API-17 查询支付

`GET /payments/{payment_id}` · 本人或管理员 · FR-07、FR-09

| 项 | 内容 |
|---|---|
| 成功 | `200`，含 `status`（PENDING/SUCCEEDED/FAILED）、`provider_txn_id`、`amount_cents`、`currency`、`created_at`、`updated_at`、`refunds[]`（异常退款） |
| 错误 | `NOT_FOUND`、`FORBIDDEN` |

### API-18 模拟支付结果

`POST /payments/{payment_id}/simulate` · 本人（仅测试模式）· FR-07、CFG-11

| 项 | 内容 |
|---|---|
| 请求体 | `result` 取 `SUCCESS|FAIL|TIMEOUT` |
| 成功 | `200`，`data` 为 `payment_status`、`order_status`、`tickets_issued`（成功时数量） |
| 错误 | `ORDER_EXPIRED`（此时按迟到付款处理，返回 `order_status:"EXPIRED"` 与退款单号）、`NOT_FOUND` |
| 说明 | 仅当环境变量 `PAYMENT_MODE=test` 时开放；生产模式 `403 FORBIDDEN`。`TIMEOUT` 保持 PENDING，交由对账处理（AC-14） |

### API-19 支付通知

`POST /payments/notify` · 支付适配器（服务端密钥）· FR-07、FR-13

| 项 | 内容 |
|---|---|
| 请求头 | `X-Signature`（HMAC-SHA256，密钥来自环境变量，不进代码库） |
| 请求体 | `provider_txn_id`、`payment_id`、`order_no`、`amount_cents`、`currency`、`result`（`SUCCESS|FAIL`）、`occurred_at` |
| 成功 | `200`，`data.result` 取 `APPLIED`、`DUPLICATE`、`LATE_REFUND` |
| 错误 | `PAYMENT_MISMATCH`（金额/币种/订单号不符；同时把该通知落库为 `REJECTED`，`details.notification_result="REJECTED"`）、`VALIDATION_ERROR` |
| 说明 | 成功但订单已关闭 → `LATE_REFUND`，订单状态不变，生成异常退款（AC-12、AC-13）；重复通知 `DUPLICATE`，不重复出票（AC-10） |

## 8. 票据

### API-20 我的票据

`GET /tickets` · 购票用户 · FR-08、FR-09

| 项 | 内容 |
|---|---|
| 查询参数 | `status`、`date_from`、分页 |
| 成功 | `200`，列表项含 `ticket_id`、`order_id`、`event_name`、`venue_name`、`seat_label`（区域-排-座，如 `A-1-2`）、`starts_at`、`status`、`issued_at` |

### API-21 票据详情

`GET /tickets/{ticket_id}` · 本人或管理员 · FR-08

| 项 | 内容 |
|---|---|
| 成功 | `200`，票面信息 + `qr_token`（短时签名，60 秒有效）+ `checkin`（已核销时含时间与操作者显示名） |
| 错误 | `NOT_FOUND`、`FORBIDDEN` |
| 说明 | `qr_token` 不含密码、支付信息，且不能直接改状态；打开页面不构成核销（FR-08） |

### API-22 二维码图片

`GET /tickets/{ticket_id}/qr.png` · 本人 · FR-08

| 项 | 内容 |
|---|---|
| 成功 | `200`，`image/png`，内容为 `qr_token` 生成的二维码 |
| 错误 | `FORBIDDEN`、`NOT_FOUND` |
| 说明 | 票已作废或退款中仍可展示，但票面须标状态；核销端会拒绝对应票码 |

## 9. 管理：活动与场次

### API-23 管理端活动列表

`GET /admin/events` · 管理员 · FR-02、FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `keyword`、`status`、分页 |
| 成功 | `200`，含草稿在内全部活动，附 `performance_count` |

### API-24 新建活动

`POST /admin/events` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 请求体 | `title`、`description`、`organizer_name`、`cover_url` 可选 |
| 成功 | `201`，返回 `event_id` |

### API-25 修改活动

`PATCH /admin/events/{event_id}` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 请求体 | 同 API-24，字段可选 |
| 成功 | `200` |
| 错误 | `NOT_FOUND` |
| 说明 | 已有订单的活动不得改标题以外的关键信息？本版允许改文案与封面；不影响历史订单快照 |

### API-26 管理端场次列表

`GET /admin/performances` · 管理员 · FR-02、FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `event_id`、`status`、`date_from`、分页 |
| 成功 | `200`，含 `venue_id`、`starts_at`、窗口、`status`、四类座位计数 |

### API-27 新建场次

`POST /admin/performances` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 请求体 | `event_id`、`venue_id`、`starts_at`、`sales_open_at`、`sales_close_at`、`checkin_open_at`、`checkin_close_at`、`price_tiers[]` |
| 成功 | `201`，状态 `DRAFT`，同时按场馆布局初始化场次座位 |
| 错误 | `VALIDATION_ERROR`（销售截止须早于开场、核销窗口须合法，对应 DDL 的 CHECK） |

### API-28 修改场次

`PATCH /admin/performances/{performance_id}` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 成功 | `200` |
| 错误 | `PERFORMANCE_LOCKED`（已发布后改场馆、开场时间；已有订单后改销售/核销窗口） |
| 说明 | 发布后允许改简介类字段，不允许改影响既有订单的时限（AC-03） |

### API-29 发布场次

`POST /admin/performances/{performance_id}/publish` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 成功 | `200`，`status:"PUBLISHED"` |
| 错误 | `VALIDATION_ERROR`（无票价区或座位未初始化） |
| 说明 | 发布后布局与开场时间固定（FR-02） |

### API-30 暂停/恢复销售

`POST /admin/performances/{performance_id}/sales` · 管理员 · FR-12

| 项 | 内容 |
|---|---|
| 请求体 | `action` 取 `pause|resume` |
| 成功 | `200`，返回新 `status`（`SALES_PAUSED` 或 `PUBLISHED`） |
| 错误 | `VALIDATION_ERROR`（已截止后恢复销售）、`NOT_FOUND` |
| 说明 | 暂停不阻止已有未到期订单付款与已售票核销（AC-03） |

### API-31 调整票价

`PATCH /admin/performances/{performance_id}/price-tiers` · 管理员 · FR-02

| 项 | 内容 |
|---|---|
| 请求体 | `tiers[]`，每项 `tier_name`、`price_cents` |
| 成功 | `200`，返回最新票价区列表 |
| 说明 | 只影响此后创建的订单；历史订单明细保持快照（AC-20） |

### API-32 停用/恢复单座

`PATCH /admin/session-seats/{session_seat_id}` · 管理员 · FR-02、FR-12

| 项 | 内容 |
|---|---|
| 请求体 | `status` 取 `BLOCKED|AVAILABLE` |
| 成功 | `200`，`session_seat_id`、`status` |
| 错误 | `SEAT_NOT_EDITABLE`（当前为 HELD 或 SOLD）、`NOT_FOUND` |
| 说明 | 只能停用未被预留、未售出的座位（FR-02） |

### API-42 批量/整区停用或恢复座位

`PATCH /admin/performances/{performance_id}/seat-status` · 管理员 · FR-02、FR-12

| 项 | 内容 |
|---|---|
| 请求体 | `status` 取 `BLOCKED|AVAILABLE`；选择器二选一：`session_seat_ids`（1–1000 个）或 `region`（可加 `row_no`） |
| 成功 | `200`，`updated`、`skipped`、`requested`、`seat_counts` |
| 错误 | `SEAT_NOT_EDITABLE`（目标不是 AVAILABLE/BLOCKED 时计入 `skipped`）、`VALIDATION_ERROR`、`NOT_FOUND` |
| 说明 | 同一事务只改 AVAILABLE/BLOCKED，HELD/SOLD 跳过；选择 `region` 即整区封锁/恢复；写 `SEATS_BLOCKED`/`SEATS_AVAILABLE` 审计 |

### 9.1 管理端读辅助（实现补充，不计入 48 条契约端点）

这两个接口只服务 8081 的下拉框与票价编辑，不改变 48 条业务契约的编号；字段变更仍需按第 14 节流程登记。

| 端点 | 权限 | 成功返回 |
|---|---|---|
| `GET /admin/venues` | 管理员 | `{items:[{venue_id,name,row_count,col_count,layout,seat_count}]}` |
| `GET /admin/performances/{performance_id}` | 管理员 | 场次详情（`performance_id`、`event_id`、`venue_id`、五个时间字段、`status`、`seat_counts`）+ `price_tiers:[{tier_id,tier_name,price_cents,currency}]` |

`GET /admin/performances/{id}` 只补列表未返回的 `price_tiers`，不替代 API-09 的公开场次详情。

### 9.2 用户与角色授权

### API-44 用户列表

`GET /admin/users` · 管理员 · FR-01

| 项 | 内容 |
|---|---|
| 查询参数 | `keyword`（用户名/展示名）、`role`（`ADMIN|CHECKER`，可选；`USER` 为所有用户隐含角色）、`page`、`page_size` |
| 成功 | `200`，列表项含 `user_id`、`user_name`、`display_name`、`created_at`、`roles[]`、`assignments[]`；`assignments` 只含未撤销记录，字段为 `assignment_id`、`role`、`performance_id`、`event_name`、`starts_at`、`assigned_at` |
| 说明 | 不返回 `password_hash`；`roles` 始终至少含 `USER`；按 `user_id` 升序 |

### API-45 授予角色

`POST /admin/users/{user_id}/roles` · 管理员 · FR-01

| 项 | 内容 |
|---|---|
| 请求体 | `role` 取 `ADMIN|CHECKER`；`CHECKER` 必填 `performance_id`，`ADMIN` 必须省略 |
| 成功 | `201`，返回 `assignment_id`、`user_id`、`role`、`performance_id`、`assigned_at`、`reactivated`（复用已撤销记录时为 `true`） |
| 错误 | `VALIDATION_ERROR`、`NOT_FOUND`（用户/场次不存在）、`ROLE_ALREADY_ASSIGNED` |
| 说明 | 授权写 `ROLE_GRANTED` 审计；新用户仍只获得 `USER`，管理员不能通过注册接口提权 |

### API-46 撤销角色

`DELETE /admin/users/{user_id}/roles/{assignment_id}` · 管理员 · FR-01

| 项 | 内容 |
|---|---|
| 成功 | `204` |
| 错误 | `NOT_FOUND`、`LAST_ADMIN`（撤销后系统将没有有效管理员） |
| 说明 | 只把 `revoked_at` 置为当前时间，保留历史；同一角色/场次再次授予时复用原记录并清空 `revoked_at`；写 `ROLE_REVOKED` 审计 |

### 9.3 自动对账辅助（实现补充，不计入 48 条契约端点）

自动对账 worker 默认每 300 秒扫描一次，环境变量 `RECONCILE_INTERVAL_SECONDS` 可调；单批上限 50 条，处理超过 120 秒仍未完成的支付通知。测试适配器没有真实退款查询能力时，退款仍由管理员通过 API-43 确认，worker 只记录检查结果，不擅自改金额。

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /admin/reconciliation/status` | 管理员 | 返回 `enabled`、`interval_seconds`、`last_run_at`、`last_duration_ms`、`scanned`、`applied`、`failed`、`still_unknown`、`last_error` |
| `POST /admin/reconciliation/run` | 管理员 | 立即运行一轮，返回同结构；供演示与故障排查，不替代定时任务 |

## 10. 验票工作区

### API-33 我的授权场次

`GET /admin/checker/performances` · 验票员（管理员返回全部）· FR-11

| 项 | 内容 |
|---|---|
| 成功 | `200`，`performance_id`、`event_name`、`venue_name`、`starts_at`、`checkin_open_at`、`checkin_close_at`、`checked_in_count` |
| 说明 | 验票员只看到 `role_assignments` 授权给自己的场次（AC-19） |

### API-34 核销

`POST /admin/checkins` · 验票员（授权场次）、管理员 · FR-11 · 必须带 `Idempotency-Key`

| 项 | 内容 |
|---|---|
| 请求体 | `ticket_code`、`performance_id` |
| 成功 | `200`，`data` 为 `result:"OK"`、`ticket_id`、`seat_label`、`checked_at` |
| 错误 | `TICKET_ALREADY_USED`（附首次核销时间与操作者显示名）、`TICKET_INVALID`、`OUT_OF_WINDOW`、`WRONG_PERFORMANCE`、`FORBIDDEN` |
| 说明 | 同一事务内票据 VALID→USED 并写核销记录（BR-05）；并发双扫至多一次成功（AC-18）；退款中票不可核销（BR-10） |

### API-35 核销记录

`GET /admin/checkins` · 验票员（授权场次）、管理员 · FR-11、FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `performance_id`、`date_from`、`date_to`、分页 |
| 成功 | `200`，含 `ticket_id`、`seat_label`、`checked_at`、`checked_by`（显示名）、`result` |

## 11. 统计与对账

### API-36 销售统计

`GET /admin/stats` · 管理员 · FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `performance_id` 可选、`date_from`、`date_to` |
| 成功 | `200`，按场次行：可售/预留/已售/不可售座位数、`tickets_sold`、`checked_in`、`gross_cents`、`refunded_cents`、`net_cents`；附合计行 |
| 说明 | 口径与需求第 12 节一致，同一订单不重复累计（AC-21） |

### API-37 订单查询（管理端）

`GET /admin/orders` · 管理员 · FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `status`、`performance_id`、`date_from`、`date_to`、`keyword`（订单号/用户名）、分页 |
| 成功 | `200`，含订单状态、金额、支付状态摘要、退款状态 |

### API-38 支付异常

`GET /admin/payments/exceptions` · 管理员 · FR-13

| 项 | 内容 |
|---|---|
| 查询参数 | `type` 取 `unknown|mismatch|unprocessed|late`、分页 |
| 成功 | `200`，含 `payment_id`、`order_no`、`amount_cents`、`reason`、`created_at`、`last_checked_at` |

### API-39 退款进度

`GET /admin/refunds` · 管理员 · FR-10、FR-12

| 项 | 内容 |
|---|---|
| 查询参数 | `status`（PENDING/SUCCEEDED/FAILED）、`order_id`、分页 |
| 成功 | `200`，含 `refund_id`、`order_no`、`amount_cents`、`status`、`reason`、`updated_at` |

### API-40 重试对账

`POST /admin/payments/{payment_id}/reconcile` · 管理员 · FR-13

| 项 | 内容 |
|---|---|
| 请求体 | 无 |
| 成功 | `200`，`data.result` 取 `APPLIED|STILL_UNKNOWN|FAILED`，附最新 `payment_status` |
| 说明 | 通过支付适配器查询后重试处理；不允许直接改库状态清除异常（FR-12） |

### API-41 审计日志

`GET /admin/audit-logs` · 管理员 · FR-13

| 项 | 内容 |
|---|---|
| 查询参数 | `object_type`（order/payment/refund/ticket/role_assignment）、`object_id`、`action`、`date_from`、`date_to`、分页 |
| 成功 | `200`，含 `occurred_at`、`actor_type`（user/system）、`actor_display`、`object_type`、`object_id`、`action`、`result`、`request_id` |
| 说明 | 不含密码、完整票码、支付密钥（FR-13、NFR-05） |

### API-43 确认退款结果

`POST /admin/refunds/{refund_id}/resolve` · 管理员 · FR-10、FR-12

| 项 | 内容 |
|---|---|
| 请求体 | `result` 取 `SUCCEEDED|FAILED` |
| 成功 | `200`，`refund.status`、`orderStatus`（`REFUNDED`、`PAID` 或迟到付款场景的 `EXPIRED`）、`released_seats`；同结果重放返回 `replayed:true` |
| 错误 | `REFUND_ALREADY_RESOLVED`（已确认后提交另一种结果）、`REFUND_NOT_ALLOWED`（订单不在退款处理中）、`NOT_FOUND` |
| 说明 | `SUCCEEDED`：订单转 `REFUNDED`、票据转 `VOID`、原座位回 `AVAILABLE`；`FAILED`：订单回 `PAID`、票据回 `VALID`、座位保持 `SOLD`。迟到付款的 `EXPIRED` 订单只更新退款状态，不改订单状态、不释放座位。同事务写审计；金额以原退款记录为准（FR-10、AC-15、AC-16、AC-24） |

### API-48 各区域上座率

`GET /admin/performances/{performance_id}/occupancy` · 管理员 · FR-12 · Q-06

| 项 | 内容 |
|---|---|
| 查询参数 | 无 |
| 成功 | `200`，含 `performance_id`、`event_name`、`venue_name`、`starts_at`、`status`、`regions[]`、`total`、`definitions`。`regions[]` 每行含 `region`、`total_seats`、`blocked_seats`、`sellable_seats`、`tickets_sold`、`checked_in`、`occupancy_rate`、`attendance_rate`；`total` 为同结构合计行 |
| 错误 | `NOT_FOUND`（场次不存在）、`FORBIDDEN`（非管理员） |
| 口径 | 区域总座位取 `session_seats`，`BLOCKED` 单列；`sellable_seats = total_seats - blocked_seats`；成交票数取 `tickets.status IN ('VALID','USED','REFUND_PENDING')`，核销数取 `status='USED'`；`occupancy_rate = tickets_sold / sellable_seats`，`attendance_rate = checked_in / tickets_sold`，均返回 0–100 数值并保留两位小数。`tickets` 经 `order_items → session_seats → seats.region` 归域，并用 `orders.performance_id` 限定场次；区域座位与票务分别聚合后在服务层合并，避免多表连接重复计票 |
| 说明 | 只读统计，不改变库存；未售座位与 `HELD` 不计入成交票数。定义随响应返回，供管理端表尾说明（FR-12、Q-06） |

## 11.1 实时刷新通道（WebSocket，非 REST）

`ws://127.0.0.1:3000/ws` · 公开订阅 · FR-04、AC-26

| 项 | 内容 |
|---|---|
| 连接 | 同一端口升级；`path=/ws`；单帧上限 1 KB；无业务鉴权，仅允许 `localhost` / `127.0.0.1` 或没有 `Origin` 的本地客户端，其他 Origin 返回 `403` |
| 服务端消息 | 连接成功：`{"type":"connected","at":"2026-11-22T12:00:00.000Z","path":"/ws"}`；数据变更：`{"type":"data.changed","at":"...","path":"/orders","order_id":595,"performance_id":1}`。`order_id`、`performance_id` 为可选整数，缺失时不出现该键 |
| 广播时机 | 任意非 GET 请求返回 2xx 后广播一次；`/auth/*` 与 GET 不广播；`path` 为原始请求路径（不含查询串），例如 `/orders`、`/orders/599/cancel`、`/payments/notify` |
| 作用域解析 | 优先读 `res.locals.realtime`、请求体、路径参数，再按订单/支付/退款/场次座位的数据库关联补齐 `order_id`、`performance_id`；无法解析或非整数时不写该字段。下单写 `order_id` + `performance_id`，支付写 `order_id` 并由订单补 `performance_id`，退款确认写 `order_id` 并补 `performance_id` |
| 数据边界 | 只传失效信号与两个整数 ID，不含金额、用户、座位、价格、票码或 token；客户端不得把消息当业务事实，必须用原有 REST 接口重取 |
| 客户端过滤 | 座位图只接受当前 `performance_id` 的事件，订单页只接受当前 `order_id` 的事件；管理端概览接受订单、支付、票据、核验、退款、场次座位等统计相关路径，财务页接受 `/payments`、`/admin/payments`、`/admin/refunds`、`/admin/reconciliation`。无作用域时按路径前缀兼容 |
| 客户端节流 | 300 ms 防抖、500 ms 最短刷新间隔、500 ms 最大等待；同一时刻最多一个刷新请求在飞，之后最多补一次；`hidden` 时不请求、回前台补一次；页面操作进行中暂停、结束后恢复 |
| 心跳与重连 | 服务端每 30 秒 ping，未 pong 的连接被终止；客户端断线 2 秒后重连 |
| 兜底 | 座位图保留手动 Refresh；订单页保留 15 秒到期兜底轮询；`/ws` 不可用时 REST 功能不受影响 |
| 范围 | 用户端座位图与订单页、管理端概览与财务页订阅；广播为单进程内存实现，未接 Redis 等跨实例总线 |

示例：

```json
{"type":"connected","at":"2026-11-22T12:00:00.000Z","path":"/ws"}
{"type":"data.changed","at":"2026-11-22T12:00:03.120Z","path":"/orders","order_id":595,"performance_id":1}
{"type":"data.changed","at":"2026-11-22T12:00:04.020Z","path":"/performances/1/seats","performance_id":1}
```

## 12. 需求对应与验收映射

| 端点组 | 需求 | 主要验收用例 |
|---|---|---|
| API-01~05 认证 | FR-01 | AC-01 |
| API-06~10、47 浏览与座位 | FR-03、FR-04、FR-14 | AC-03、AC-04、AC-25 |
| API-11~15 订单 | FR-05、FR-06、FR-09、FR-10 | AC-04~AC-08、AC-15~AC-17、AC-23 |
| API-16~19 支付 | FR-07、FR-13 | AC-09~AC-14 |
| API-20~22 票据 | FR-08 | AC-09、AC-24 |
| API-44~46 用户与角色 | FR-01 | AC-01 |
| API-23~32、42 管理配置 | FR-02、FR-12 | AC-02、AC-03、AC-20 |
| API-33~35 验票 | FR-11 | AC-18、AC-19、AC-24 |
| API-36~41、43 统计对账 | FR-10、FR-12、FR-13 | AC-15、AC-16、AC-21、AC-24 |
| 9.3 自动对账辅助 | FR-13 | AC-13、AC-14 |
| 11.1 WebSocket 失效信号 | FR-04（P1 提前实现） | AC-26 |

## 13. 与 T1 及验收脚本的衔接

- T1 只实现 API-05、API-02、API-04 三条，加 401/403 中间件；`scripts\smoke.ps1` 顶部 `$Paths` 与此处一致。
- M3 补齐 API-01、API-03、API-44~46，以及 9.3 两个自动对账辅助；`scripts\m3_check.ps1` 覆盖注册、退出吊销、角色授予/撤销、越权拒绝与核心查询耗时。
- T1 完成标准：`/health` 返回 `db:"ok"`；正确凭据返回 token 与 roles；错误密码 401 且文案不区分；无 token 访问 `/auth/me` 返回 401。
- 前端 mock 以本文的成功/失败包为准，字段名不得另起别名。

## 14. 变更流程

1. 先改本文并升版本号，注明影响的端点编号。
2. 同步 `scripts\smoke.ps1` 的 `$Paths` 与断言，必要时补用例。
3. 若涉及数据库字段，先改数据字典与 DDL，再回来改本契约（见 `delivery\delivery.json` 的 `--impact`）。
4. 前端 mock、后端实现、验收脚本三方对齐后，才可把端点标为“已实现”。
