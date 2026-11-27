# scripts：一键开发环境与验收

脚本解决“每次开工都要手工起库、导数据、开服务、人工点验证”的问题。

## 前提

- XAMPP/MariaDB 已安装，端口 3306，root 空密码；脚本会自动查找 `C:\xampp`、`D:\xampp`、`D:\_Coding\XAMPP`，也可用 `XAMPP_HOME` 指定。
- 库名 `ticketing_system`，DDL 与种子在本包 `..\database\`。
- Node 20+（后端在 `..\server`，当前 22 已验证）；Python 3.10+ 建议安装，只用于种子校验。

## 常用命令

> 下例假设发布包在 `D:\Projects\CityUHK_Events_Hub`；按你的实际路径替换。

```powershell
Set-Location -LiteralPath "D:\Projects\CityUHK_Events_Hub"

.\scripts\dev.ps1                  # 起数据库 + 后端 + 两个前端（后台运行）
.\scripts\dev.ps1 -ResetSeed -Visible  # 先重置演示数据，再打开三个服务窗口
.\scripts\dev.ps1 -NoApi -NoWeb    # 只检查并起数据库
.\scripts\reset_demo.ps1           # 清库 → 建表 → 导 seed → 校验，全程约 3 秒
.\scripts\reset_demo.ps1 -DryRun   # 只打印将执行的动作
.\scripts\smoke.ps1                # 打 5 条 T1 接口断言，输出 PASS/FAIL
.\scripts\catalog_check.ps1        # 打 32 条 T2 目录接口断言（活动/场次/座位），输出 PASS/FAIL
.\scripts\m1_check.ps1             # 打 19 条 M1 断言（下单/幂等/支付/出票/QR/取消/并发）
.\scripts\m2_check.ps1             # 打 45 条 M2 断言（角色/活动/场次/票价/封座/验票/退款/统计）
.\scripts\m3_check.ps1             # 打 33 条 M3 断言（注册/退出/角色/对账/退款边界）
node .\scripts\realtime_check.js   # R1：WebSocket 连接、下单/取消广播、数据边界、断线兜底 8 条
.\scripts\recon_auto_check.ps1     # 验证定时对账 worker 自动重放（独立 API，10s interval）
.\scripts\perf_smoke.ps1           # 5 条核心读接口冒烟计时，仅记录不冒充 P95
node .\scripts\m4_scale_setup.js   # M4：重建 ticketing_bench，生成 100 场次/20,000 座位/10,000 订单
node .\scripts\m4_bench.js baseline # M4：5 接口 × 500 样本 × 50 并发，输出 P95 与 EXPLAIN
node .\scripts\m4_bench.js indexes  # 创建 4 个候选索引
node .\scripts\m4_bench.js tuned    # 候选索引下重跑
node .\scripts\m4_bench.js drop     # 删除候选索引，恢复 baseline
node .\scripts\m4_bench.js reservation # 50 并发预留
node .\scripts\m4_anomaly_check.js  # AC-14/17/24
node .\scripts\ac_coverage_check.js --all  # P0 16 条 + P1 AC-25，共 17 条，输出 delivery\evidence\M5\ac-coverage.json
node .\scripts\ac_coverage_check.js --cases=AC-02,AC-04,AC-25  # 只跑指定用例
```

M1/M2/M3 都会写入测试订单、账号或通知；演示前再跑一次 `reset_demo.ps1` 即可回到干净种子。M4 只写独立库 `ticketing_bench`，不碰演示库；重跑 `m4_scale_setup.js` 会清除该库之前的压测数据。

`ac_coverage_check.js` 默认面向独立 API `http://127.0.0.1:3300` 与独立库 `ticketing_ac`，不写演示库。运行前需用 `database/schema.sql`、`database/seed.sql` 导入该库（需替换库名）；可用 `BASE`、`DB_NAME`、`PAYMENT_NOTIFY_SECRET` 环境变量覆盖。脚本会创建测试场次、订单、退款与核销记录，适合反复重建独立库后复跑。AC-25 额外创建场次、封锁 2–4 排、设置 SOLD/BLOCKED 座、验证 2/3/4 人窗口、预算上限、通道边界、推荐不写库、抢占后整组 409 与整组成功全 HELD。

## 行为约定

- `dev.ps1` 以发布包根目录为项目根；默认后台启动，加 `-Visible` 会打开 `CityUHK Events Hub API` / `User web` / `Admin web` 三个窗口。API 已在运行则直接跳过启动。
- `reset_demo.ps1` 会 **DROP 整个 `ticketing_system` 库**，只影响这一个库，不碰 `chapter2`、`classicmodels`、`simplebilling`。
- `smoke.ps1` 与 `catalog_check.ps1` 在 API 未启动时输出 SKIP 并 exit 0；接口在跑才逐条断言，任一失败 exit 1。
- 数据库时间相对导入时刻生成，P13 的核销窗口只在导入后约 40 分钟内有效，演示前跑一次 `reset_demo.ps1` 即可重置。

## 与 T1/T2 的衔接

T1 已实现（`server`）：`GET /health`、`POST /auth/login`、`GET /auth/me`。`smoke.ps1` 顶部 `$Paths` 与 `API接口契约.md` 的 API-02/04/05 一致；改路径只改这一处，不动断言逻辑。

T2 已实现只读目录接口：`GET /events`（API-06）、`GET /events/{id}`（API-07）、`GET /performances`（API-08）、`GET /performances/{id}`（API-09）、`GET /performances/{id}/seats`（API-10）。`catalog_check.ps1` 的数据断言基于 `database\seed.sql`（8 活动 / 16 场次 / 1 草稿活动 / 4 已结束场次），改种子后需同步调整期望值。

M1 已实现订单、支付与票据（API-11~14、16~22）。`m1_check.ps1` 用 `buyer01/03/04` 走建单、幂等、支付、出票、QR、取消与并发抢座；期望 19/19 PASS。测试会改动订单与座位状态，结束时只取消并发测试的订单，已支付订单与票据仍在库里，演示前必须 `reset_demo.ps1`。

M2 补齐管理端与退款终态；`m2_check.ps1` 的 45 条断言覆盖角色、活动/场次/票价、单座/批量/整区封座、验票成功/重复/越权、退款成功/失败/重放、对账与统计。

M3 补齐注册、服务端退出、用户角色与自动对账；`m3_check.ps1` 33 条断言，`recon_auto_check.ps1` 单独验证 10 秒定时器在无手动触发时自动把 PENDING 通知重放为成功。`perf_smoke.ps1` 仅做 5 条核心读接口的冒烟计时，P95、`EXPLAIN` 与并发压测归 M4。

M4 的规模数据在独立库 `ticketing_bench`，用 `m4_scale_setup.js` 重建，用 `m4_bench.js` 的 baseline/indexes/tuned/drop 做索引实验与 P95，用 reservation 做 50 并发预留；`m4_anomaly_check.js` 覆盖 AC-17 退票/核销并发、AC-24 退款释放重购、AC-14 重启后通知重放。bench API 需用 `DB_NAME=ticketing_bench`、`PORT=3100`、`DB_POOL=10`、`REFUND_CUTOFF_HOURS=0`、`RECONCILE_INTERVAL_SECONDS=2`、`RECONCILE_MIN_AGE_SECONDS=1` 启动。

R1 的 `realtime_check.js` 连 `ws://127.0.0.1:3000/ws`，用临时账号创建并取消一张订单，验证 `data.changed` 在 3 秒内到达、帧字段只允许 `at/order_id/path/performance_id/type` 且订单与取消事件的 `order_id`、`performance_id` 正确、断线后 REST 仍可用、非本地 Origin 返回 403；结果写入 `delivery/evidence/M5/realtime-check.json`，跑完用 `reset_demo.ps1` 恢复种子。前端另有 `liveRefresh.js` 调度器单测（300 ms 防抖、500 ms 最短间隔、单请求在飞、隐藏暂停、操作暂停），当前为临时脚本，不随发布包交付。

T2 之后新增的端点按同样方式进脚本：先改契约，再加断言，最后跑 `check_delivery.py --impact API-SPEC` 确认同步面。
