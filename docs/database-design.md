# 数据库表结构与字段

> 版本 v1.2（2026-11-22），与物化 DDL `schema.sql` 对齐；已在 MariaDB 10.4.32（XAMPP）实际建库，并通过结构与约束用例。
> 数据类型采用 MySQL 8.0 / MariaDB 10.5+ 实际类型：金额统一 BIGINT 整数分；时间统一 DATETIME(3)，按 UTC 存储，展示层转 Asia/Hong_Kong。
> 数据库必须开启严格模式（`STRICT_ALL_TABLES` 等），否则 NOT NULL 与 CHECK 会被静默放宽。

---

## 模块一：实体清单

| 表名（英） | 用途（中） | 主键 | 字段数 |
|---|---|---|---|
| users | 用户账号与认证信息 | user_id | 6 |
| role_assignments | 用户-角色-场次授权关系 | assignment_id | 6 |
| venues | 场馆基础信息与布局元数据 | venue_id | 6 |
| seats | 场馆座位明细（区域/排号/坐标/相邻分组） | seat_id | 7 |
| events | 活动基础信息 | event_id | 5 |
| event_media | 活动展示资源（多图，含封面） | media_id | 6 |
| performances | 场次（时间窗口与状态） | performance_id | 11 |
| price_tiers | 场次票价区 | tier_id | 5 |
| session_seats | 场次座位库存与归属 | session_seat_id | 8 |
| orders | 订单（状态/金额/截止/幂等） | order_id | 12 |
| order_items | 订单明细与成交价格快照 | order_item_id | 5 |
| payment_attempts | 支付尝试 | attempt_id | 9 |
| payment_notifications | 支付通知接收与处理结果 | notice_id | 9 |
| tickets | 电子票据与票码哈希 | ticket_id | 5 |
| checkins | 核销记录 | checkin_id | 4 |
| refunds | 退款请求 | refund_id | 9 |
| audit_logs | 审计日志 | log_id | 9 |

---

## 模块二：实体关系概述

| 关系 | 基数 | 说明 |
|---|---|---|
| users ↔ role_assignments | 1 : N | 一个用户可有零个或多个授权记录；一条授权只属于一个用户 |
| performances ↔ role_assignments | 1 : N | 一条验票授权指向一个场次；管理员与购票用户无场次归属 |
| users ↔ orders | 1 : N | 一个用户可有零个或多个订单；一个订单只属于一个用户 |
| users ↔ checkins（验票员） | 1 : N | 一个验票员可核销多张票；一条核销记录只有一个验票员 |
| venues ↔ seats | 1 : N | 一个场馆包含多个座位；一个座位只属于一个场馆 |
| venues ↔ performances | 1 : N | 一个场馆可举办多个场次；一个场次只在一个场馆 |
| events ↔ performances | 1 : N | 一个活动对应多个场次；一个场次只属于一个活动 |
| events ↔ event_media | 1 : N | 一个活动可有多条展示资源；每条资源只属于一个活动 |
| performances ↔ price_tiers | 1 : N | 一个场次有多个票价区；一个票价区只属于一个场次 |
| performances ↔ session_seats | 1 : N | 一个场次包含多个场次座位 |
| seats ↔ session_seats | 1 : N | 一个座位可在多个场次中作为库存 |
| price_tiers ↔ session_seats | 1 : N | 一个票价区关联多个场次座位 |
| performances ↔ orders | 1 : N | 一个场次产生多个订单 |
| orders ↔ order_items | 1 : N | 一个订单包含多个明细（1–4 张票） |
| session_seats ↔ order_items | 1 : N | 同一场次座位可出现在不同历史订单明细（旧票作废后可再售） |
| order_items ↔ tickets | 1 : 1 | 一条明细生成一张票；一张票只源于一条明细 |
| tickets ↔ checkins | 1 : 1 | 一张票至多一条成功核销记录 |
| orders ↔ payment_attempts | 1 : N | 一个订单可有多次支付尝试 |
| payment_attempts ↔ payment_notifications | 1 : N | 一次支付尝试可收到多条通知 |
| payment_attempts ↔ refunds | 1 : N | 一次支付可发起多次退款尝试 |
| orders ↔ refunds | 1 : N | 整单退款关联订单；迟到付款等异常款项退款可不填订单 |
| audit_logs | — | 松耦合：不通过外键关联任何实体，快照式记录 |

---

## 模块三：数据字典

> 键及属性：PK=主键，FK（表.列）=外键，UK=唯一约束；组合键以"字段1 + 字段2"表达。生成列为实现层辅助列，不计入业务字段数。

**users（用户）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| user_id | 用户ID | BIGINT | No | PK | 用户唯一标识，自增 |
| user_name | 账号 | VARCHAR(50) | No | UK | 登录账号，全局唯一；普通注册不可提权 |
| password_hash | 密码哈希 | VARCHAR(255) | No | — | 认证凭证哈希，不存明文 |
| display_name | 展示名 | VARCHAR(50) | Yes | — | 个人信息页展示名 |
| token_version | 令牌版本 | INT | No | — | 默认为 0；退出时递增，用于立即吊销该用户已签发的 JWT |
| created_at | 创建时间 | DATETIME(3) | No | — | 账号注册时间，默认当前时间 |

**role_assignments（角色授权）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| assignment_id | 授权记录ID | BIGINT | No | PK | 授权记录唯一标识，自增 |
| user_id | 用户ID | BIGINT | No | FK（users.user_id） | 被授权用户 |
| role | 角色 | VARCHAR(20) | No | — | 购票用户（USER）/ 管理员（ADMIN）/ 验票员（CHECKER） |
| performance_id | 场次ID | BIGINT | Yes | FK（performances.performance_id） | 仅 CHECKER 必填；管理员与购票用户为 NULL |
| assigned_at | 授权时间 | DATETIME(3) | No | — | 授权发生时间，权限审计可追溯 |
| revoked_at | 撤销时间 | DATETIME(3) | Yes | — | 授权撤销时间；保留历史不删行 |
| performance_key | 场次键（生成列） | BIGINT | — | — | 实现层辅助列：IFNULL(performance_id,0)，使 NULL 参与唯一约束 |
| user_id + role + performance_key | 组合唯一 | — | — | UK | 用户、角色、场次授权关系唯一；解决 MySQL 唯一索引不判 NULL 重复 |

**venues（场馆）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| venue_id | 场馆ID | BIGINT | No | PK | 场馆唯一标识，自增 |
| name | 场馆名称 | VARCHAR(100) | No | UK | 场馆显示名称，全局唯一 |
| row_count | 总排数 | INT | Yes | — | 布局总排数，供前端渲染座位图 |
| col_count | 每排最大列数 | INT | Yes | — | 布局每排最大列数 |
| layout_json | 布局元数据 | TEXT | Yes | — | 通道与区域边界等布局信息，可选 |
| created_at | 创建时间 | DATETIME(3) | No | — | 场馆建档时间 |

**seats（座位）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| seat_id | 座位ID | BIGINT | No | PK | 座位唯一标识，自增 |
| venue_id | 场馆ID | BIGINT | No | FK（venues.venue_id） | 所属场馆 |
| region | 区域 | VARCHAR(50) | No | — | 座位所在区域（如 A 区） |
| row_no | 排号 | VARCHAR(10) | No | — | 座位所在排 |
| seat_no | 座位号 | VARCHAR(10) | No | — | 排内座位编号 |
| coordinates | 坐标 | VARCHAR(50) | No | — | 座位在布局图中的坐标（如 "3,5"） |
| adjacent_group | 相邻分组 | VARCHAR(50) | Yes | — | 同排、无通道分隔的连续物理座位段标识；独立座位可为空 |
| venue_id + region + row_no + seat_no | 组合唯一 | — | — | UK | 同一场馆、同一区域的座位定位唯一；不同区域可同排同号 |

**events（活动）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| event_id | 活动ID | BIGINT | No | PK | 活动唯一标识，自增 |
| name | 名称 | VARCHAR(100) | No | — | 活动名称 |
| description | 简介 | TEXT | Yes | — | 活动简介 |
| organizer | 主办方 | VARCHAR(200) | No | — | 主办方信息 |
| created_at | 创建时间 | DATETIME(3) | No | — | 活动创建时间 |

**event_media（活动展示资源）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| media_id | 展示资源ID | BIGINT | No | PK | 展示资源唯一标识，自增 |
| event_id | 活动ID | BIGINT | No | FK（events.event_id） | 所属活动 |
| media_type | 资源类型 | VARCHAR(20) | No | — | 封面（COVER）/ 详情图（GALLERY） |
| url | 图片地址 | VARCHAR(500) | No | — | 图片 URL 或相对路径 |
| sort_order | 显示顺序 | INT | No | — | 同活动同类型内显示次序，默认 0 |
| created_at | 创建时间 | DATETIME(3) | No | — | 资源上传时间 |
| cover_event_id | 封面键（生成列） | BIGINT | — | — | 实现层辅助列：COVER 时取 event_id，否则 NULL |
| cover_event_id | 唯一 | — | — | UK | 每活动最多一张封面 |
| event_id + media_type + sort_order | 组合唯一 | — | — | UK | 同活动同类型内顺序不重复 |

**performances（场次）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| performance_id | 场次ID | BIGINT | No | PK | 场次唯一标识，自增 |
| event_id | 活动ID | BIGINT | No | FK（events.event_id） | 所属活动 |
| venue_id | 场馆ID | BIGINT | No | FK（venues.venue_id） | 举办场馆 |
| starts_at | 开场时间 | DATETIME(3) | No | — | 演出开始时间 |
| sale_start_at | 开售时间 | DATETIME(3) | No | — | 销售开始时刻 |
| sale_end_at | 售票截止 | DATETIME(3) | No | — | 销售截止时刻（CHECK：必须早于开场） |
| checkin_start_at | 核销开始 | DATETIME(3) | No | — | 核销窗口开始（默认开场前 30 分钟） |
| checkin_end_at | 核销截止 | DATETIME(3) | No | — | 核销窗口结束（默认开场后 30 分钟，左闭右开） |
| status | 状态 | VARCHAR(20) | No | — | 草稿（DRAFT）/ 已发布（PUBLISHED）/ 暂停新销售（SALES_PAUSED）/ 已结束（FINISHED） |
| created_at | 创建时间 | DATETIME(3) | No | — | 场次建档时间 |
| published_at | 发布时间 | DATETIME(3) | Yes | — | 首次发布时间，未发布为空 |
| sale_start_at + sale_end_at + starts_at | 时间约束 | — | — | CHECK | 开售 < 截止 < 开场 |
| checkin_start_at + checkin_end_at | 时间约束 | — | — | CHECK | 核销开始 < 核销结束 |

**price_tiers（票价区）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| tier_id | 票价区ID | BIGINT | No | PK | 票价区唯一标识，自增 |
| performance_id | 场次ID | BIGINT | No | FK（performances.performance_id） | 所属场次 |
| tier_name | 票价区域 | VARCHAR(50) | No | — | 票价区名称（如 VIP、普通） |
| current_price | 当前价格 | BIGINT | No | — | 当前单价（整数分，CHECK：金额非负） |
| currency | 币种 | CHAR(3) | No | — | ISO 币种代码（本版 HKD） |
| performance_id + tier_name | 组合唯一 | — | — | UK | 同一场次内票价区名称不重复 |

**session_seats（场次座位）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| session_seat_id | 场次座位ID | BIGINT | No | PK | 代理主键，供订单明细引用 |
| performance_id | 场次ID | BIGINT | No | FK（performances.performance_id） | 所属场次 |
| seat_id | 座位ID | BIGINT | No | FK（seats.seat_id） | 座位 |
| tier_id | 票价区ID | BIGINT | No | FK（price_tiers.tier_id） | 所属票价区；须属于同一场次，跨表约束由服务层保证 |
| session_seat_status | 场次座位状态 | VARCHAR(20) | No | — | 可售（AVAILABLE）/ 预留（HELD）/ 已售（SOLD）/ 不可售（BLOCKED） |
| holder_order_id | 当前归属 | BIGINT | Yes | FK（orders.order_id） | 当前持有订单；仅 HELD 时非空 |
| hold_expires_at | 截止时间 | DATETIME(3) | Yes | — | 预留截止时间；仅 HELD 时非空 |
| updated_at | 更新时间 | DATETIME(3) | No | — | 库存状态最后变更时间 |
| performance_id + seat_id | 组合唯一 | — | — | UK | 场次与座位组合唯一 |
| session_seat_status + holder_order_id + hold_expires_at | 状态一致约束 | — | — | CHECK | HELD 必须同时有持有订单与截止时间；非 HELD 不得有持有订单 |

**orders（订单）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| order_id | 订单ID | BIGINT | No | PK | 订单唯一标识，自增 |
| user_id | 用户ID | BIGINT | No | FK（users.user_id） | 下单用户 |
| performance_id | 场次ID | BIGINT | No | FK（performances.performance_id） | 关联场次 |
| status | 状态 | VARCHAR(20) | No | — | 待支付（PENDING_PAYMENT）/ 已支付（PAID）/ 已取消（CANCELLED）/ 已过期（EXPIRED）/ 退款中（REFUND_PENDING）/ 已退款（REFUNDED） |
| total_amount | 总额 | BIGINT | No | — | 订单总金额（整数分，CHECK：非负） |
| currency | 币种 | CHAR(3) | No | — | ISO 币种代码 |
| expires_at | 截止时间 | DATETIME(3) | No | — | 支付截止时间（服务端持久化，前端不得自行计算） |
| idempotency_key | 请求标识 | VARCHAR(100) | No | UK（与 user_id 组合） | 创建请求幂等键，防重复下单 |
| request_hash | 内容指纹 | CHAR(64) | No | — | 请求内容 SHA-256（场次+座位集合+金额）；用于区分"同键不同内容"并拒绝 |
| created_at | 创建时间 | DATETIME(3) | No | — | 下单时间 |
| paid_at | 支付时间 | DATETIME(3) | Yes | — | 正常完成付款时间 |
| closed_at | 关闭时间 | DATETIME(3) | Yes | — | 取消或过期关闭时间 |
| user_id + idempotency_key | 组合唯一 | — | — | UK | 同一用户同一请求标识只对应一个订单 |
| expires_at + created_at | 时间约束 | — | — | CHECK | 截止时间必须晚于创建时间 |

**order_items（订单明细）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| order_item_id | 订单明细ID | BIGINT | No | PK | 代理主键 |
| order_id | 订单ID | BIGINT | No | FK（orders.order_id） | 所属订单 |
| session_seat_id | 场次座位ID | BIGINT | No | FK（session_seats.session_seat_id） | 购买的场次座位 |
| price_snapshot | 成交价格快照 | BIGINT | No | — | 成交时单价（整数分），不受后续改价影响 |
| created_at | 创建时间 | DATETIME(3) | No | — | 明细生成时间 |
| order_id + session_seat_id | 组合唯一 | — | — | UK | 订单与场次座位组合唯一；允许不同历史订单先后购买同一座位 |

**payment_attempts（支付尝试）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| attempt_id | 支付尝试ID | BIGINT | No | PK | 支付尝试唯一标识，自增 |
| order_id | 订单ID | BIGINT | No | FK（orders.order_id） | 所属订单 |
| payment_ref | 支付标识 | VARCHAR(100) | No | UK | 支付机构侧标识 |
| amount | 金额 | BIGINT | No | — | 支付金额（整数分，CHECK：大于 0） |
| currency | 币种 | CHAR(3) | No | — | 支付币种快照，付款确认时与订单币种比对 |
| result | 结果 | VARCHAR(20) | No | — | 待处理（PENDING）/ 成功（SUCCEEDED）/ 失败（FAILED） |
| handling_category | 处理类别 | VARCHAR(20) | Yes | — | 正常履约（NORMAL）/ 待退异常（AWAITING_REFUND）；结果确定后归类 |
| created_at | 创建时间 | DATETIME(3) | No | — | 支付发起时间 |
| updated_at | 更新时间 | DATETIME(3) | No | — | 结果最后变更时间 |

**payment_notifications（支付通知）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| notice_id | 通知记录ID | BIGINT | No | PK | 通知记录唯一标识，自增 |
| source | 来源 | VARCHAR(50) | No | — | 通知来源标识 |
| notification_id | 通知标识 | VARCHAR(100) | No | — | 来源侧通知标识 |
| payment_attempt_id | 关联支付 | BIGINT | No | FK（payment_attempts.attempt_id） | 关联支付尝试 |
| received_at | 接收时间 | DATETIME(3) | No | — | 通知到达时间；乱序判断与对账依据 |
| processed_at | 处理时间 | DATETIME(3) | Yes | — | 处理完成时间；未处理为空 |
| processed_result | 处理结果 | VARCHAR(20) | No | — | 待处理（PENDING）/ 已生效（APPLIED）/ 重复（DUPLICATE）/ 校验拒绝（REJECTED）/ 处理失败（FAILED）/ 忽略（IGNORED） |
| payload_digest | 通知摘要 | CHAR(64) | Yes | — | 通知原文 SHA-256，用于核对与审计，不存明文凭证 |
| payload_json | 通知原文 | TEXT | Yes | — | 通知原始 JSON，供自动对账重放；不含支付密钥 |
| source + notification_id | 组合唯一 | — | — | UK | 重复通知防重 |

**tickets（票据）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| ticket_id | 票据ID | BIGINT | No | PK | 票据唯一标识，自增 |
| order_item_id | 订单明细ID | BIGINT | No | FK（order_items.order_item_id）、UK | 订单明细只生成一张票 |
| ticket_code_hash | 票码校验值 | CHAR(64) | No | UK | 票码 SHA-256 哈希，不存完整票码 |
| status | 状态 | VARCHAR(20) | No | — | 有效（VALID）/ 已使用（USED）/ 退款中（REFUND_PENDING）/ 作废（VOID） |
| issued_at | 出票时间 | DATETIME(3) | No | — | 电子票生成时间，按日统计与审计使用 |

**checkins（核销记录）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| checkin_id | 核销记录ID | BIGINT | No | PK | 核销记录唯一标识，自增 |
| ticket_id | 票据ID | BIGINT | No | FK（tickets.ticket_id）、UK | 一票最多一次成功核销 |
| checker_id | 验票员ID | BIGINT | No | FK（users.user_id） | 核销验票员 |
| checked_in_at | 成功核销时间 | DATETIME(3) | No | — | 核销发生时间，默认当前时间 |

**refunds（退款）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| refund_id | 退款记录ID | BIGINT | No | PK | 退款记录唯一标识，自增 |
| order_id | 订单ID | BIGINT | Yes | FK（orders.order_id） | 整单退款关联订单；异常款项退款可为空 |
| payment_attempt_id | 原支付 | BIGINT | No | FK（payment_attempts.attempt_id） | 原支付尝试 |
| reason | 原因 | VARCHAR(255) | Yes | — | 退款原因 |
| amount | 金额 | BIGINT | No | — | 退款金额（整数分，CHECK：大于 0；累计不超过原收款由服务层保证） |
| idempotency_key | 请求标识 | VARCHAR(100) | No | UK | 退款请求幂等键，防重复退款 |
| status | 处理状态 | VARCHAR(20) | No | — | 待处理（PENDING）/ 成功（SUCCEEDED）/ 失败（FAILED） |
| created_at | 创建时间 | DATETIME(3) | No | — | 退款受理时间；对账扫描依据 |
| updated_at | 更新时间 | DATETIME(3) | No | — | 结果最后变更时间 |

**audit_logs（审计日志）**

| 字段名（英） | 字段名（中） | 数据类型 | 可空（Yes/No） | 键及属性 | 字段说明 |
|---|---|---|---|---|---|
| log_id | 日志ID | BIGINT | No | PK | 审计日志唯一标识，自增 |
| actor_type | 操作者类型 | VARCHAR(20) | No | — | 用户（USER）/ 管理员（ADMIN）/ 验票员（CHECKER）/ 系统任务（SYSTEM） |
| actor_id | 操作者ID | BIGINT | Yes | — | 用户 ID；SYSTEM 为空 |
| object_type | 对象类型 | VARCHAR(40) | No | — | 业务对象类型（ORDER/TICKET/SEAT/REFUND/PAYMENT/ROLE 等） |
| object_id | 对象ID | BIGINT | Yes | — | 业务对象主键，便于按订单号等精确过滤 |
| action | 动作 | VARCHAR(40) | No | — | 操作动作（创建/取消/核销/退款受理等） |
| state_summary | 前后状态摘要 | VARCHAR(500) | No | — | 状态变化摘要（原值→新值） |
| occurred_at | 时间 | DATETIME(3) | No | — | 操作时间 |
| request_id | 请求标识 | VARCHAR(100) | No | — | 关联的支付/退款/创建请求标识 |
| — | 安全约束 | — | — | — | 不保存密码、完整票码、支付密钥等凭证 |

> 无外键实体：users、venues、audit_logs。
> 版本说明：v1.1 相对 v1.0 修正 6 处阻塞问题（seats 唯一键补 region、role_assignments 的 NULL 唯一、时间类型改 DATETIME(3)、orders 增加内容指纹、payment_notifications 增加接收/处理时间、refunds 增加订单与时间），并补齐索引所需字段；对应 DDL 见同目录 `schema.sql`。
