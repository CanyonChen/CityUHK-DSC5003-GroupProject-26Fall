# M4 正确性与查询评估报告

> 版本：v1.0（2026-11-22）
> 产品：StagePass（中文沟通名：舞台通行）
> 项目：DSC5003 Ticketing System（Track 1，双前端）
> 对应需求：NFR-02、NFR-03、AC-14、AC-17、AC-22、AC-24

## 1. 结论摘要

M4 已在独立基准库 `ticketing_bench` 上完成规模数据、代表性查询基准、索引实验、50 并发预留压测与三组异常用例。正式验收结果如下：

| 项目 | 结果 | 目标 | 判定 |
|---|---|---|---|
| 规模数据 | 100 场次 / 20,000 条场次座位 / 10,000 条历史订单 | AC-22 扩大数据 | 通过 |
| Q-01 场次座位图 | P95 133.64 ms，平均 110.71 ms | P95 ≤ 500 ms | 通过 |
| Q-02 管理端订单检索 | P95 1,095.12 ms，平均 639.45 ms | P95 ≤ 2,000 ms | 通过 |
| Q-03 各场次销售统计 | P95 559.67 ms，平均 513.27 ms | P95 ≤ 2,000 ms | 通过 |
| Q-04 用户订单进展 | P95 139.17 ms，平均 109.32 ms | P95 ≤ 1,000 ms | 通过 |
| Q-05 活动列表 | P95 96.44 ms，平均 74.58 ms | P95 ≤ 500 ms | 通过 |
| 50 并发预留 | 50/50 HTTP 201，P95 380.77 ms，平均 258.64 ms | P95 ≤ 1,000 ms，无超卖 | 通过 |
| AC-17 退票/核销窗口重叠 | 恰好 1 个 2xx、1 个 409、0 个 500，最终状态唯一 | 只能有一种合法结果 | 通过 |
| AC-24 退款释放后重购 | 旧票持续失效，新票仅核销一次，两订单保留 | 新旧票分别可核验 | 通过 |
| AC-14 中断后恢复 | 重启后通知重试收敛，支付 SUCCEEDED、订单 PAID、仅 1 张票 | 唯一正确结果 | 通过 |

**索引实验结论：4 个候选索引没有带来稳定整体收益，Q-03 反而明显变差。实验后已删除候选索引，`AI/schema.sql` 保持原有 20 个显式索引。**

## 2. 测试环境与数据

### 2.1 环境

| 项目 | 值 |
|---|---|
| 主机 | LAPTOP-5MOL2EF7 |
| CPU | Intel Core Ultra X7 358H，16 逻辑处理器 |
| 内存 | 31.55 GB |
| 操作系统 | Windows，Node.js v22.23.2 |
| 数据库 | MariaDB 10.4.32 |
| InnoDB buffer pool | 16,777,216 B（16 MB） |
| 最大连接数 | 151 |
| 基准 API | 端口 3100，`DB_NAME=ticketing_bench`，`DB_POOL=10` |
| HTTP 客户端 | Node 22 全局 `fetch`，HTTP keep-alive |

### 2.2 数据规模

`scripts/m4_scale_setup.js` 每次执行会先 DROP `ticketing_bench`，再按 `AI/schema.sql` 重建，然后生成规模数据；不改演示库 `ticketing_system`。

| 数据 | 数量 |
|---|---|
| 账号 | 102 个（1 ADMIN、1 CHECKER、50 买家、50 压测买家） |
| 场馆 / 活动 / 场次 | 1 / 10 / 100（前 60 场未来，后 40 场历史） |
| 场次座位 | 20,000（M4 基准库每场 200 座；演示种子为 3 场馆/670 座） |
| 订单 | 10,000 |
| 订单明细 | 14,000 |
| 票据 | 11,200 |
| 支付尝试 | 9,500 |
| 支付通知 | 8,000 |
| 退款 | 2,000 |
| 核销 | 2,000 |

生成后自检结果：

| 自检项 | 结果 |
|---|---|
| 场次数 / 场次座位数 / 订单数 | 100 / 20,000 / 10,000 |
| 每场 `available + held + sold + blocked = 200` | 全部成立 |
| 订单金额与明细合计不一致 | 0 |
| 已支付订单无票 | 0 |

证据：`delivery/evidence/M4/dataset-summary.json`。

> 压测与异常用例会在基准数据上追加测试订单和座位状态，因此运行后的全局计数会高于初始 10,000。报告中的“数据规模”指初始生成规模，AC-22 的可复现入口是重新执行 `m4_scale_setup.js`。

## 3. 查询基准设计

### 3.1 负载口径

| 参数 | 值 |
|---|---|
| 并发 | 50 |
| 每个接口样本数 | 500 |
| 每接口串行预热 | 20 次 |
| 统计指标 | 平均、P50、P95、P99、最小值、最大值、吞吐 |
| 失败判定 | 非 2xx 或请求异常 |
| 正式结果 | 预热后的 warm 轮 |

5 个接口覆盖需求中的代表查询：

| 编号 | 代表查询 | API |
|---|---|---|
| Q-01 | 场次座位可买状态 | `GET /performances/1/seats` |
| Q-02 | 管理端订单检索 | `GET /admin/orders?status=PAID&page_size=20` |
| Q-03 | 各场次销售统计 | `GET /admin/stats` |
| Q-04 | 用户订单进展 | `GET /orders?page_size=20` |
| Q-05 | 活动列表 | `GET /events?page_size=20` |

> **编号口径说明**：本报告的 Q-01–Q-05 是 M4 基准作业编号，不等于需求 §12.2 的同号查询。Q-01 对应需求 Q-01；Q-02（管理端订单检索）与 Q-04（用户订单进展）分别覆盖需求 Q-02 的管理端与用户端视角；Q-03 对应需求 Q-03；Q-05（活动列表）是补充公开读路径，不在需求 §12.2 的七条之内。需求 Q-04（到期关闭订单扫描）由后台过期 worker 实现，Q-05（待处理款项）由 `GET /admin/payments/exceptions` 提供，本轮均未做 HTTP P95；Q-06（区域上座率）、Q-07（连座推荐，P1）也未纳入本轮基准。

### 3.2 失败率与样本

5 个接口各 500 个样本，全部返回 HTTP 200；正式 warm 轮失败率为 **0/2,500 = 0%**。每个接口的 `status_codes`、`errors`、`latency_ms.count` 均写入 `bench-baseline.json`。

### 3.3 冷缓存说明

数据库刚重建、InnoDB buffer pool 完全冷时，第一次 Q-03 的 P95 曾达到 **2,868.73 ms**，超过 2,000 ms 目标；同一数据集预热后重跑为 **559.67 ms**。正式验收表只采用预热后的 warm 值，但保留这条冷缓存观察：

- 冷缓存首轮不是正式验收值，不能用来宣称“所有时候都达标”。
- 100 场次 × 多个相关子查询的统计接口对 buffer pool 敏感；生产部署应做预热，或改为预聚合/物化统计。
- 复现时先执行 `m4_scale_setup.js`，再执行 `m4_bench.js baseline`；脚本自带每接口 20 次预热。

## 4. 查询结果

### 4.1 Baseline（原始 20 个显式索引）

| 编号 | 平均 ms | P50 ms | P95 ms | P99 ms | 最大 ms | 吞吐 req/s | 目标 ms | 判定 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Q-01 | 110.71 | 112.73 | 133.64 | 137.94 | 140.95 | 434.26 | 500 | 通过 |
| Q-02 | 639.45 | 562.62 | 1,095.12 | 1,226.69 | 1,266.23 | 74.56 | 2,000 | 通过 |
| Q-03 | 513.27 | 529.31 | 559.67 | 583.10 | 621.48 | 93.18 | 2,000 | 通过 |
| Q-04 | 109.32 | 111.58 | 139.17 | 151.20 | 157.42 | 444.18 | 1,000 | 通过 |
| Q-05 | 74.58 | 75.82 | 96.44 | 107.79 | 113.89 | 645.36 | 500 | 通过 |

证据：`delivery/evidence/M4/bench-baseline.json`。

Q-02 的 P95 最高，原因是管理端订单检索在 50 并发下同时执行 5 表连接、按 `created_at DESC` 文件排序，以及每行两个相关子查询（最新支付结果、退款状态）。它仍在 2 秒目标内，但属于当前最值得继续优化的读路径。

## 5. 索引实验

### 5.1 候选索引

| 索引 | 定义 | 目标查询 |
|---|---|---|
| `idx_m4_orders_status_created` | `orders(status, created_at, order_id)` | Q-02 |
| `idx_m4_orders_perf_status_amount` | `orders(performance_id, status, total_amount)` | Q-03 |
| `idx_m4_session_seats_perf_status_tier` | `session_seats(performance_id, session_seat_status, tier_id)` | Q-01/Q-03 |
| `idx_m4_refunds_status_order` | `refunds(status, order_id)` | Q-02/Q-03 |

### 5.2 Baseline 与 Tuned 对比

| 编号 | Baseline 平均 | Tuned 平均 | 平均变化 | Baseline P95 | Tuned P95 | P95 变化 | 判定 |
|---|---:|---:|---:|---:|---:|---:|---|
| Q-01 | 110.71 | 112.05 | +1.2% | 133.64 | 146.36 | +9.5% | 变慢 |
| Q-02 | 639.45 | 774.34 | +21.1% | 1,095.12 | 892.73 | -18.5% | P95 变快、平均变慢 |
| Q-03 | 513.27 | 589.02 | +14.8% | 559.67 | 952.81 | +70.2% | 明显变慢 |
| Q-04 | 109.32 | 107.28 | -1.9% | 139.17 | 129.20 | -7.2% | 略快 |
| Q-05 | 74.58 | 73.81 | -1.0% | 96.44 | 124.69 | +29.3% | 变慢 |

证据：`delivery/evidence/M4/bench-tuned.json`。

### 5.3 结论

候选索引没有带来稳定整体收益：

- Q-02 的 P95 下降 18.5%，但平均上升 21.1%；优化器仍从 `venues → events → performances → orders` 的连接顺序进入，`orders.status` 候选索引没有成为驱动索引。这个 P95 改善不足以证明索引有效，且平均变差说明结果受执行顺序和缓存波动影响。
- Q-03 的 P95 上升 70.2%。100 个场次 × 多个相关子查询的整体成本没有实质下降；只有 gross 子查询使用了 `idx_m4_orders_perf_status_amount`，其他子查询仍走原有索引。
- Q-01/Q-05 也没有稳定收益。

因此执行 `m4_bench.js drop` 删除 4 个候选索引，恢复到 `AI/schema.sql` 的 20 个显式索引。`information_schema` 统计的总索引数为 58（含主键、唯一索引和隐式索引）。证据：`indexes-candidates.json`、`indexes-restored.json`。

**未把候选索引写回 `AI/schema.sql`。** 当前 schema 仍是基线索引；如果后续要改，应先改 `schema.sql`，再同步数据字典、查询设计说明和索引清单，不能只在基准库手工加索引。

## 6. 执行计划（EXPLAIN）

### 6.1 Q-01 场次座位图

`EXPLAIN` 关键行：

| 表 | 访问方式 | 使用索引 | 估算行数 | Extra |
|---|---|---|---|---|
| `s`（seats） | ALL | 无 | 200 | Using filesort |
| `ss`（session_seats） | eq_ref | `uk_session_seats` | 1 | — |
| `pt`（price_tiers） | eq_ref | PRIMARY | 1 | — |
| `o`（orders） | eq_ref | PRIMARY | 1 | Using where |

判断：座位图必须枚举该场馆全部 200 个座位，再逐座关联场次座位、票价区和订单。`seats` 全表只有 200 行，排序成本可控；这也是 Q-01 在 50 并发下仍有 133.64 ms P95 的原因。 seats 表随场馆数量增长后，才需要考虑按 `venue_id` 分区或把座位布局缓存到应用层。

### 6.2 Q-02 管理端订单检索

`EXPLAIN` 关键行：

| 表 | 访问方式 | 使用索引 | 估算行数 | Extra |
|---|---|---|---|---|
| `v`（venues） | index | `uk_venues_name` | 1 | Using index; Using temporary; Using filesort |
| `e`（events） | ALL | 无 | 10 | Using join buffer (flat, BNL join) |
| `p`（performances） | ref | `idx_performances_event` | 5 | Using where |
| `o`（orders） | ref | `idx_orders_performance` | 8 | Using index condition |
| `u`（users） | eq_ref | PRIMARY | 1 | — |
| `r`（refunds） | ref | `idx_refunds_order` | 1 | DEPENDENT SUBQUERY; Using where |
| `pa`（payment_attempts） | ref | `idx_payment_attempts_order` | 1 | DEPENDENT SUBQUERY; Using filesort |

判断：优化器把 `venues` 作为第一张表，`events` 只有 10 行，`performances` 每活动 5 行，`orders` 每场约 50 行中再按 `status=PAID` 过滤。`orders.status` 上的候选索引无法改变这个连接顺序，因此没有成为驱动索引。真正成本在 `orders.created_at DESC` 排序和每行两个相关子查询；后续优化方向是给 `orders(performance_id, status, created_at, order_id)` 做覆盖索引，或把“最新支付结果/退款状态”改成一次聚合查询。

### 6.3 Q-03 各场次销售统计

`EXPLAIN` 显示该查询是 100 行 `performances` 驱动，然后对每个场次执行多个 `DEPENDENT SUBQUERY`：

| 子查询对象 | 使用索引 | 估算行数 | 说明 |
|---|---|---|---|
| `orders`（gross 等） | `idx_orders_performance` | 50 | 每个场次重复扫描 |
| `orders` + `order_items` + `tickets` + `checkins` | `idx_orders_performance` / `uk_order_items` / `uk_tickets_order_item` / `uk_checkins_ticket` | 50 / 1 / 1 / 1 | 统计已售与核销 |
| `session_seats`（available/held/sold/blocked） | `idx_session_seats_status` 或 `idx_session_seats_expiry` | 37 或 1 | 每个场次重复 3–4 次 |
| `refunds` | `idx_refunds_order` | 1 | 每订单一次 |

判断：`admin.salesStats` 对每个 performance 使用多个相关子查询，100 个场次 × 多个子查询是主要成本。候选索引只改善了 gross 子查询，没有改变整体结构。若后续要稳定压低 Q-03，应把统计改为“按场次一次聚合”的查询，或增加按天/按场次的汇总表，而不是继续堆单列索引。

## 7. 50 并发预留压测

### 7.1 正式结果

| 指标 | 值 |
|---|---|
| 并发 | 50 |
| 样本 | 50 个不同座位、50 个不同买家 |
| HTTP 结果 | 50/50 HTTP 201，0 错误 |
| 平均 | 258.64 ms |
| P50 | 254.76 ms |
| P95 | 380.77 ms |
| P99 | 389.59 ms |
| 最大 | 389.59 ms |
| 吞吐 | 126.97 req/s |
| 总耗时 | 393.78 ms |
| 目标 | P95 ≤ 1,000 ms |

数据一致性：

- 新建 50 个 `PENDING_PAYMENT` 订单，全部为 pending。
- 50 个所选座位全部 `HELD`，`holder_order_id` 去重后 50 个。
- 无超卖；压测后全局 `orders=10,050`、`held_total=470`、`sold_total=9,100`。
- 证据：`delivery/evidence/M4/reservation.json`。

口径说明：50 个 `bench_load` 账号在压测前完成登录；bcrypt 登录在 50 并发下约 5–6 秒/个，属于 CPU 争用，不计入预留 P95。预留 P95 只统计 `POST /orders`。

### 7.2 两次真实故障与修复

第一次 50 并发预留：**8 个 201、42 个 500**，错误码 `ER_LOCK_DEADLOCK`，冲突 SQL 是 `SELECT ... FROM performances WHERE performance_id = 1 FOR UPDATE`。根因是 `createOrder` 在 `REPEATABLE READ` 下先做 `pending` 空结果 `FOR UPDATE`，留下 gap lock，再锁 `performances` 行，与并发插入形成环。修复：`orders.js` 在事务开始前执行 `SET TRANSACTION ISOLATION LEVEL READ COMMITTED`，并加注释说明 pending 查询只需要已有行锁、不需要 gap lock。

第二次 50 并发：**50 个请求全部 30 秒超时，状态码 0**，`/health` 也被阻塞；数据库 10 个 `ticketing_bench` 连接全部 `Sleep`。根因是 `createOrder` 在 `await conn.commit()` 后、`finally` 释放连接前调用 `loadOrder(query, orderId)`，而 `loadOrder` 又向连接池申请第二条连接；10 个事务各占一条连接、再等第二条，形成应用层连接池死锁。修复：正常路径、事务内幂等重放路径、`ER_DUP_ENTRY` 兜底路径都改为在同一个 `conn` 上调用 `loadOrder`，不再在持有连接时向池申请第二连接。

第三次（最终）：50/50 HTTP 201，P95 380.77 ms，通过。

## 8. 异常用例

### 8.1 AC-17：退票与核销窗口重叠

测试配置：`REFUND_CUTOFF_HOURS=0`，构造 `checkin_start_at` 已开始、`starts_at` 在未来的场次 104，使退票与核销窗口重叠；同一订单同时发 `POST /admin/checkins` 与 `POST /orders/:id/refund`。

结果：

| 指标 | 值 |
|---|---|
| 核销 | HTTP 200，票 11205 `USED` |
| 退款 | HTTP 409 `REFUND_NOT_ALLOWED`（“订单中有已核销票据，不能整单退款”） |
| 2xx 数 | 1 |
| 409 数 | 1 |
| 500 数 | 0 |
| 最终订单 | `PAID` |
| 最终票 | `USED` |
| 最终核销记录 | 1 条 |
| 最终退款记录 | 0 条 |

首次执行时退款返回 500，日志为 `ER_LOCK_DEADLOCK`，冲突 SQL 是 `SELECT o.order_id ... JOIN performances p ... WHERE o.order_id=10051 FOR UPDATE`。原因是核销先锁 `performances`、退款先锁 `orders`，两段事务锁顺序相反。修复：`refunds.js` 把 `requestRefund` 拆为 `requestRefundOnce` + 外层 `requestRefund`，仅对 `ER_LOCK_DEADLOCK` 做最多 3 次整段事务重试（50/100 ms 退避）；若核销先提交，重试返回 409；若退款先提交，重试返回已在退款流程中。修复后 AC-17 通过。

同时修复了 `refunds.js` 在 `commit` 后、释放连接前调用 `refundRow(query, ...)` 的潜在连接池死锁模式：`refundRow` 现在接受可选执行器，事务内和事务后回读都复用同一个 `conn`。`resolveRefund` 的两处回读也改为同一连接。

### 8.2 AC-24：退款释放座位后重新购买

| 检查项 | 结果 |
|---|---|
| 退款申请 201 | 通过 |
| 管理员确认退款 200 | 通过 |
| 退款后座位先回到 `AVAILABLE` | 通过 |
| 旧订单保持 `REFUNDED` | 通过 |
| 新订单 `PAID` | 通过 |
| 旧票 `VOID` | 通过 |
| 新票 `USED` | 通过 |
| 座位最终 `SOLD` | 通过 |
| 旧票核销 409 | 通过 |
| 新票核销 200 | 通过 |
| 新票二次核销 409 | 通过 |
| 新票恰好 1 条核销记录 | 通过 |
| 旧票 0 条核销记录 | 通过 |
| 两个订单都保留 | 通过 |

证据：`m4-anomalies.json` 中 AC-24 的 `final_state`：订单 10056 `REFUNDED`、订单 10057 `PAID`；票 11206 `VOID`、票 11207 `USED`；座位 20801 `SOLD`。

### 8.3 AC-14：外部已成功付款，本地中断后重启

测试方式：另起 3110 端口 bench API（`DB_NAME=ticketing_bench`、`PORT=3110`、`DB_POOL=10`、`REFUND_CUTOFF_HOURS=0`、`RECONCILE_INTERVAL_SECONDS=2`、`RECONCILE_MIN_AGE_SECONDS=1`），创建订单和 `PENDING` 支付，手工插入 `payment_notifications` 的 `PENDING` 通知，停止 3110 再重启，轮询等待 worker 通过通知重试收敛。

| 检查项 | 结果 |
|---|---|
| 重启前通知为 `PENDING` | 通过 |
| 重启前支付为 `PENDING` | 通过 |
| 进程确实重启 | 通过（第一实例 `SIGTERM`，最终实例重新监听） |
| 重启后支付 `SUCCEEDED` | 通过 |
| 重启后订单 `PAID` | 通过 |
| 通知 `APPLIED` | 通过 |
| 恰好 1 张票 | 通过 |
| 座位 `SOLD` | 通过 |

轮询记录显示第 4 秒收敛（0.5–3.5 秒仍为 PENDING，4.0 秒变为 SUCCEEDED/PAID/APPLIED）。这说明重启后 worker 能重放已存通知；测试支付适配器不能查询真实网关，自动对账只能重放已存通知，不宣称“向外部网关查询并确认”。

## 9. 复现步骤

```powershell
cd D:\_Study\CityU_MDS\Courses\SemesterA\5003\Assignment\GP\scripts

# 1. 重建 ticketing_bench 并生成 100/20,000/10,000
node .\m4_scale_setup.js

# 2. 启动 bench API（另开窗口保持运行）
$env:DB_NAME='ticketing_bench'
$env:PORT='3100'
$env:DB_POOL='10'
$env:REFUND_CUTOFF_HOURS='0'
$env:RECONCILE_INTERVAL_SECONDS='2'
$env:RECONCILE_MIN_AGE_SECONDS='1'
cd ..\ticketing-app\server
node src\server.js

# 3. 回到 scripts 跑基准、索引实验、删除候选索引
cd ..\..\scripts
node .\m4_bench.js baseline
node .\m4_bench.js indexes
node .\m4_bench.js tuned
node .\m4_bench.js drop

# 4. 50 并发预留
node .\m4_bench.js reservation

# 5. AC-14/17/24（需 3100 正在运行，3110 未被占用）
node .\m4_anomaly_check.js
```

注意：`m4_scale_setup.js` 会 DROP 并重建 `ticketing_bench`；演示库 `ticketing_system` 不受影响。重跑规模数据会清除之前压测产生的 50 个预留订单和 HELD 座位。

## 10. 证据文件

| 文件 | 内容 |
|---|---|
| `dataset-summary.json` | 规模数据计数与三项自检 |
| `bench-baseline.json` | 5 个查询的 baseline 延迟、吞吐、状态码、EXPLAIN |
| `bench-tuned.json` | 候选索引下的 5 个查询 |
| `explain-baseline.json` | Q-01/Q-02/Q-03 的 JSON + 表格 EXPLAIN |
| `explain-tuned.json` | 候选索引下的 EXPLAIN |
| `indexes-baseline.json` | 基线索引状态 |
| `indexes-candidates.json` | 4 个候选索引定义与创建后状态 |
| `indexes-tuned.json` | tuned 时索引状态 |
| `indexes-restored.json` | 删除候选索引后的恢复状态 |
| `reservation.json` | 50 并发预留结果与后置状态 |
| `m4-anomalies.json` | AC-14/17/24 的请求、状态与最终数据 |
| `bench-api.out.log` / `bench-api.err.log` | 3100 API 当前实例日志；首次 AC-17 死锁结论见第 8.1 节，日志在重启重跑后已被覆盖 |

## 11. 范围边界与后续

- M4 只做 50 并发预留与读接口 P95；没有做 500 并发、长时间稳定性、连接池耗尽、慢查询日志分析。
- Q-06（区域上座率）、Q-07（连座推荐，P1）未纳入本轮基准。
- AC-22 的“干净环境重新初始化并启动两个前端与后端”尚未在 M4 单独执行；M4 使用独立 bench API 与数据库，双前端启动与干净环境复现留给 M5 部署验收。
- 测试支付适配器不能查询真实网关；AC-14 只证明通知重放与对账收敛，不证明外部网关对账。
- `m4_bench.js` 的 50 并发是 HTTP 客户端并发，不等于数据库 50 连接；bench API 连接池为 10，超出部分在应用层排队。这个口径在报告中已明确。
- 候选索引未写回 `AI/schema.sql`；当前基线仍是 20 个显式索引。后续若改索引，必须同步 `DICT`、`DOC-OPS` 和索引清单。
