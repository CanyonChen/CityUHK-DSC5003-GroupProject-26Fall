# M5 证据索引：干净环境复现

版本：v1.4（2026-11-23）

本目录记录 M5 的“从发布包、在独立目录、用独立数据库重新安装与启动双前端 + 后端”的证据。v1.1 增加 R1 限制版的服务端 8/8、调度器单测结论与 03/04 实时刷新截图；v1.2 增加 P0 AC 缺口补测 16/16 的独立库证据；v1.3 增加 AC-25 连座推荐的 17/17 自动化结果、用户端面板实测与两张截图；v1.4 增加 Q-06 区域上座率的 API 实测与控制台截图。视频按团队安排延后，不在本目录范围内。

## 1. 环境与边界

| 项 | 值 |
|---|---|
| 发布包来源 | `delivery/5003_StagePass`（复制当时名为 `delivery/5003_GP`），复制时 commit `d5d1f4f`，139 个文件，2,098,987 B；加入 M5 文档后的最终包见提交清单 |
| 干净目录 | `C:\Users\Nicholas\AppData\Local\Temp\dsc5003_m5_clean` |
| 数据库 | 独立库 `ticketing_m5clean`（不碰演示库 `ticketing_system`） |
| 后端 | `DB_NAME=ticketing_m5clean`、`PORT=3200`、`DB_POOL=10`、`JWT_SECRET=m5-clean-test-secret` |
| 用户端 | `VITE_API_BASE=http://127.0.0.1:3200`，preview 8180 |
| 管理端 | 同一 API base，preview 8181 |
| Node | v22.23.2 |
| 数据库版本 | MariaDB 10.4.32（XAMPP） |

端口说明：默认 3000/8080/8081 仍被演示实例占用（3000 PID 33484、8080 PID 9072、8081 PID 4080），因此干净环境使用 3200/8180/8181。构建方式、依赖、数据库结构与 API 地址配置与默认部署一致；在空机器上可直接使用默认端口。

## 2. 复现步骤

1. 从发布包复制到独立临时目录，不复制 `.git`、不复制 `node_modules`、不复用源目录依赖。
2. 新建 `ticketing_m5clean`，把包内 `database/schema.sql` 与 `database/seed.sql` 的库名替换为 `ticketing_m5clean`，生成 `schema_m5clean.sql` / `seed_m5clean.sql` 并导入。
3. 在临时目录的后端、用户端、管理端分别执行 `npm install`。
4. 设置 `VITE_API_BASE=http://127.0.0.1:3200`，两个前端分别 `npm run build`。
5. 启动后端，确认 `GET /health` 为 `status=ok, db=ok`。
6. 两个前端分别 `vite preview`，确认 HTTP 200。
7. 用真实 API 完成购票链路，并用管理端统计接口核对汇总。
8. 浏览器打开两个干净前端，截图保存。

## 3. 结果

### 3.1 导入后计数

| 表 | 数量 |
|---|---:|
| performances | 16 |
| session_seats | 3,630 |
| orders（购票前） | 594 |
| tickets（购票前） | 1,751 |

与演示种子一致。

### 3.2 依赖与构建（R1 限制版前的干净环境基线）

| 项目 | 结果 |
|---|---|
| server `npm install` | 126 packages |
| web-user `npm install` | 33 packages |
| web-admin `npm install` | 33 packages |
| web-user build | 38 modules，673 ms |
| web-admin build | 37 modules，722 ms |

R1 限制版最终源码构建为：用户端 40 modules、管理端 39 modules；该次构建在演示实例上完成，未重新安装依赖。

### 3.3 服务状态

| 检查 | 结果 |
|---|---|
| `GET /health` | `status=ok`、`db=ok`、`version=0.1.0` |
| 用户端 `http://127.0.0.1:8180` | HTTP 200，505 B |
| 管理端 `http://127.0.0.1:8181` | HTTP 200，412 B |
| `buyer01 / Demo@1234` 登录 | `code=OK` |
| `admin / Demo@1234` 登录 | `code=OK` |

### 3.4 真实 API 购票链路

| 步骤 | 结果 |
|---|---|
| 选择座位 | `session_seat_id=1`，A-1-1，48,000 分 |
| 创建订单 | `order_id=595`，`PENDING_PAYMENT`，金额 48,000 |
| 创建支付 | `payment_id=595`，`PENDING` |
| 模拟支付成功 | `order_status=PAID` |
| 最终订单 | `PAID` |
| 生成票 | `ticket_id=1752`，`VALID`，座位 A-1-1 |

### 3.5 管理端统计

`GET /admin/stats` 返回 16 个场次统计，总计：

| 指标 | 值 |
|---|---:|
| available | 1,868 |
| held | 4 |
| sold | 1,752 |
| blocked | 6 |
| gross_cents | 61,329,000 |
| refunded_cents | 152,000 |
| net_cents | 61,177,000 |

### 3.6 页面截图

| 文件 | 内容 |
|---|---|
| `01-user-events.png` | 干净用户端活动列表页（events） |
| `02-admin-login.png` | 干净管理端登录页，admin 预填、密码掩码 |

## 4. 证据文件

| 文件 | 内容 |
|---|---|
| `m5-clean-check.json` | 服务、数据库计数、购票链路、管理统计、HTTP 状态、截图清单 |
| `realtime-check.json` | R1 WebSocket：连接、下单/取消广播、数据边界、断线 REST、Origin 拒绝 8 条 |
| `realtime-ui-check.json` | 管理端概览未点 Refresh，外部支付后 Gross/Tickets/Seats 自动变化 |
| `03-admin-live.png` | 管理端实时刷新后的概览截图（HKD 613,290 / 1,748 / 1,752） |
| `04-admin-live-before.png` | 同一页刷新前的基线截图（HKD 612,810 / 1,747 / 1,751） |
| `ac-coverage.json` | P0 16 条 + AC-25，共 17/17：独立库 `ticketing_ac` + API 3300，逐条断言与运行时长 |
| `recommendation-ui-check.json` | 用户端连座面板实测：默认 2 人/A 区、三张同排无通道卡、选中后不锁座 |
| `05-user-recommendations.png` | 用户端连座推荐控件与结果卡片 |
| `06-user-recommendation-selection.png` | 选中推荐座位后的 2 座/HK$960 与“Sign in to reserve” |
| `region-occupancy.json` | Q-06：API-48 实测场次 1 的区域聚合、SQL 期望值、构建与截图登记 |
| `07-admin-regional-occupancy.png` | 管理端区域上座率面板：A/B/C 三行、合计行与口径说明 |
| `01-user-events.png` | 用户端页面截图 |
| `02-admin-login.png` | 管理端页面截图 |

### 4.1 P0/P1 AC 缺口补测

| 项 | 值 |
|---|---|
| 脚本 | `scripts/ac_coverage_check.js`（`--all` 跑 17 条，`--cases=AC-02,AC-04,AC-25` 跑指定子集） |
| 数据库 | 独立库 `ticketing_ac`，由仓库 `AI/schema.sql`、`AI/seed.sql`（发布包为 `database/schema.sql`、`database/seed.sql`）替换库名后导入 |
| API | `http://127.0.0.1:3300`，与演示实例 3000 隔离 |
| 覆盖 | P0：AC-01/02/03/04/06/07/08/09/10/11/12/13/18/20/21/23；P1：AC-25 |
| 结果 | 2026-11-22：17/17 PASS；AC-06 100 用户并发 1 成功、99×409、0 个 HTTP 5xx、DB 1 单、座位 HELD；AC-25 首推 A-1-8~10，预算不足为空，抢占后整组 409、兄弟座不变，整组成功 3 座全 HELD |
| 输出 | `delivery/evidence/M5/ac-coverage.json`，含每条用例的 `evidence`、`duration_ms` 与失败时的 `error` |

### 4.2 用户端连座面板实测

用户端用生产构建（`VITE_API_BASE=http://127.0.0.1:3300`）在 `http://127.0.0.1:8082` 打开 `performances/1/seats`。默认 2 人、A 区、预算留空；点击 `Find seats together` 返回 `A-1-11/12`、`A-2-8/9`、`A-3-8/9` 三张同排无通道卡。选择首张后本地选中 2 座、合计 HK$960，显示“not held until you press Reserve seats”；匿名用户按钮为 `Sign in to reserve`。点击搜索与选择前后，`performance_id=1` 的 HELD 座位均为 0，确认推荐与选中不写库存。

### 4.3 管理端区域上座率实测

管理端用生产构建（`VITE_API_BASE=http://127.0.0.1:3005`）在 `http://127.0.0.1:8085` 登录后打开 Overview，区域面板选择 `Thunderstorm — 24 Nov 2026`（performance 1，200 座）。API-48 返回 A 区 80 座/2 BLOCKED/可售 78/成交 30/38.46%，B 区 60/1/59/26/44.07%，C 区 60/1/59/25/42.37%，合计 200/4/196/81/41.33%；直接 SQL 聚合得到相同值。面板同时显示核销数（本场为 0）与入场率，并在表尾写明“Occupancy = sold tickets / sellable seats (BLOCKED excluded). Attendance = checked-in tickets / sold tickets.”。证据见 `region-occupancy.json` 与 `07-admin-regional-occupancy.png`。

临时目录中的运行日志（未入包）包括：`api.out.log`、`api.err.log`、`web-user/preview.out.log`、`web-admin/preview.out.log`、各项目 `npm-install.log` 与 `build.log`。

## 5. 结论与待办

- 干净环境已证明：发布包可独立安装、构建、启动，API 与数据库可用，购票链路和管理统计可用，两个前端可加载。
- R1 已证明：`/ws` 可连接；成功写请求后广播 `data.changed`，下单 32 ms、取消 21 ms 到达；帧字段为 `at/order_id/path/performance_id/type`，订单与取消事件的 ID 均正确；断线后 REST 仍 200；非本地 Origin 403。
- R1 限制版已证明：调度器在 1.2 秒连续事件中发出 4 次刷新、最大并发 1；隐藏期间 0 次、回前台 1 次；暂停期间 0 次、恢复后 1 次；管理端概览在未点 Refresh 的情况下随外部支付由 HKD 612,810 更新到 613,290。
- AC-25 已证明：13 条断言覆盖 2/3/4 人、同排连续、通道/区域/停用/占用边界、预算上限、低预算不抬价、推荐不写库、重复调用确定性、抢占后重推、整组 409 原子回滚、整组成功全 HELD，以及 400/404/409 错误码；用户端面板在 8082 实测选中不锁座。
- Q-06 已证明：API-48 在场次 1 返回 A/B/C 三区与合计行，座位、BLOCKED、可售、成交、核销和两项比例均与直接 SQL 聚合一致；管理端生产构建在 8085 实际显示同一组数值。
- 干净环境尚未做登录后的完整浏览器交互截图；API 已覆盖核心购票与管理统计，M1–M4 证据覆盖完整 UI 流程。
- 演示视频按团队安排留待与组员共同录制。
- 正式提交前如需默认端口验收，可在空机器上直接使用 3000/8080/8081；当前替代端口不影响“干净环境可运行”的结论。

