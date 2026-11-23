# StagePass — DSC5003 售票系统（Track 1）

CityU MDS · Semester A · DSC5003 数据库应用 · 小组项目

产品名：**StagePass**（中文沟通名：舞台通行）。校园演出与小剧场固定座位的在线售票系统：两个前端（用户端 8080、管理端 8081）共用一个后端 API（3000），数据库为 MySQL/MariaDB。

**当前状态**：数据库层、文档基线、M1、M2、M3、M4、M5（视频、最终 PDF 除外）已交付，并额外完成 R1 实时刷新、Q-06 区域上座率与 AC-25 连座推荐。M3 完成注册与安全退出、角色授权、自动对账和双端联调；M4 在 100 场次 / 20,000 场次座位 / 10,000 订单上完成 5 类查询 P95、EXPLAIN、索引实验、50 并发预留和 AC-14/17/24 异常用例；M5 从发布包在独立目录与独立库复现双前端 + 后端，完成课程报告、M5 证据、成员贡献记录（8 人均分 12.5%）和提交清单；R1 在 API 3000 增加 `/ws` 失效信号，用户端座位图/订单页与管理端概览/财务页自动重取，并加入广播作用域、300 ms 防抖、500 ms 最短间隔、单请求在飞、隐藏暂停与操作暂停，`realtime_check.js` 8/8，调度器单测与 UI 实测通过；Q-06 新增管理员区域上座率接口 API-48 与管理端区域表，按场次/区域统计可售、成交、核销、上座率与入场率。`smoke.ps1` 5/5、`catalog_check.ps1` 32/32、`m1_check.ps1` 19/19、`m2_check.ps1` 45/45、`m3_check.ps1` 33/33；`m4_bench.js reservation` 为 50/50 HTTP 201、P95 380.77 ms；`m4_anomaly_check.js` 为 3/3。演示视频、报告 PDF 和 GitHub 根目录结构仍需在提交前完成；GitHub 地址为 <https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>。

## 目录结构

| 路径 | 内容 |
|---|---|
| `docs/requirements-spec.md` | 需求规格说明书 v1.6（双前端版，17 实体；含 R1 实时刷新 AC-26 与节流/作用域要求；支持多场馆、演示种子 3 场馆/670 座） |
| `docs/database-design.md` | 数据库表结构与字段 v1.2（实体清单 / 关系概述 / 字段字典） |
| `docs/api-contract.md` | API 接口契约 v1.10（48 条契约 + 4 个管理端辅助 + 11.1 WebSocket 失效信号与作用域 + API-47 连座推荐 + API-48 区域上座率） |
| `docs/performance-report.md` | M4 性能报告：环境、数据规模、5 类查询 P95、EXPLAIN、索引实验、50 并发预留、AC-14/17/24 |
| `docs/course-report.md` | 课程报告 v1.10（Track 1）：Group Information/Contribution Statement 表、需求、架构与静态系统图、数据库 ER 图、3 条代表性 SQL、事务与一致性、测试、Track 1 证据地图与 Q-01–Q-07 覆盖表（含 Q-06 区域上座率）、性能、Challenges/Lessons、References、链接 |
| `docs/system-architecture.svg` / `.png` | 系统结构图静态源文件与 PDF 用位图；报告 §3.1 直接嵌入 PNG |
| `docs/ER-diagram.png` | 数据库 ER 图（17 实体 / 122 业务字段 / 21+1 关系 / 22 外键 / 20 显式索引） |
| `docs/member-contributions.md` | 成员贡献记录：8 人均分 12.5%，姓名/学号/邮箱/分工已填 |
| `docs/team-roster.md` | 小组成员名单：姓名、学号、邮箱、分工 |
| `docs/submission-checklist.md` | M5 最终提交清单 v1.10：交付状态、包内检查、提交步骤与剩余风险 |
| `docs/local-run-guide.md` | Windows 小白本地运行指南：前置软件、双击启动、演示账号、停止与重置、常见问题 |
| `database/schema.sql` | 17 表 DDL，v1.2，含 token_version、payload_json、严格模式与约束 |
| `database/seed.sql` | 演示数据，v1.1-demo |
| `database/*.py` | 种子生成器与四个校验脚本 |
| `server/` | 共用 API（Node 20+ / Express / mysql2）：登录、目录、订单、支付、票据、退款、管理后台 |
| `web-user/` | 用户端（Vue 3 + Vite，8080）：活动、选座、结算、订单、电子票、退票 |
| `web-admin/` | 管理端（Vue 3 + Vite，8081）：概览、活动、场次/票价、验票、订单、对账、用户与角色 |
| `scripts/` | 一键起环境、重置演示数据、T1/T2/M1/M2/M3 验收、R1 实时刷新验证、M4 规模数据/基准/异常用例、对账与性能冒烟、封面生成 |
| `delivery/` | 交付索引、验收清单与一致性检查脚本 |

## 快速开始

前置：Windows、XAMPP（MariaDB 10.4）、Node 20+、Python 3.10+。

> 第一次运行或发给组员，直接看 `docs/local-run-guide.md`；最简方式是双击根目录的 `Start-StagePass.bat`，启动后打开 `http://127.0.0.1:8080`（`buyer01` / `Demo@1234`）和 `http://127.0.0.1:8081`（`admin` / `Demo@1234`）。

```powershell
cd scripts

# 建库 → 建表 → 导入演示数据 → 校验（约 3 秒）
.\reset_demo.ps1

# 安装并启动 API（另开一个窗口保持运行）
cd ..\server
npm install
Copy-Item .env.example .env
npm start

# 安装并启动用户端（再开一个窗口保持运行）
cd ..\web-user
npm install
npm run serve

# 安装并启动管理端（再开一个窗口保持运行）
cd ..\web-admin
npm install
npm run serve

# 回到 scripts 跑验收：T1 5/5，T2 32/32，M1 19/19，M2 45/45，M3 33/33
cd ..\scripts
.\smoke.ps1
.\catalog_check.ps1
.\m1_check.ps1
.\m2_check.ps1
.\m3_check.ps1
node .\realtime_check.js
.\recon_auto_check.ps1
.\perf_smoke.ps1
.\reset_demo.ps1   # 验收会写测试数据，跑完恢复干净种子

# 或一条命令起数据库 + API + 两个前端
cd ..
.\scripts\dev.ps1 -ResetSeed -Visible
```

M4 使用独立基准库 `ticketing_bench`，不碰演示库 `ticketing_system`：

```powershell
cd ..\scripts
node .\m4_scale_setup.js      # 100 场次 / 20,000 场次座位 / 10,000 订单
node .\m4_bench.js baseline   # 50 并发 × 500 样本 × 5 接口
node .\m4_bench.js indexes    # 创建 4 个候选索引
node .\m4_bench.js tuned      # 对比 baseline
node .\m4_bench.js drop       # 删除候选索引，恢复基线
node .\m4_bench.js reservation # 50 并发预留
node .\m4_anomaly_check.js    # AC-14/17/24
```

M4 需要 bench API 在 3100 运行，环境变量为 `DB_NAME=ticketing_bench`、`PORT=3100`、`DB_POOL=10`、`REFUND_CUTOFF_HOURS=0`、`RECONCILE_INTERVAL_SECONDS=2`、`RECONCILE_MIN_AGE_SECONDS=1`。

M5 干净环境复现：把发布包复制到独立目录，不复制 `.git` 与 `node_modules`；建立独立库 `ticketing_m5clean`，替换 `schema.sql` / `seed.sql` 的库名后导入；三个项目分别 `npm install`；两个前端设置 `VITE_API_BASE` 后 `npm run build`；后端用 `DB_NAME=ticketing_m5clean` 启动；两个前端 `vite preview`。M5 证据在 `delivery/evidence/M5/`，详细步骤见 `docs/submission-checklist.md` 与 `delivery/evidence/M5/README.md`。

R1 实时刷新：API 3000 同时提供 `ws://127.0.0.1:3000/ws`。服务端只在成功的写请求后广播 `data.changed`，携带 `type`、`at`、`path` 与可选 `order_id`、`performance_id`，不传金额、用户、座位或票码；两个前端收到后仍用原 REST 接口重取，并按作用域过滤。客户端采用 300 ms 防抖、500 ms 最短间隔、500 ms 最大等待、同一时刻最多一个请求在飞；页面隐藏时暂停、回前台补一次；支付、取消、退款、对账操作中暂停。座位图保留手动 Refresh，订单页保留 15 秒兜底轮询；断线 2 秒后重连。验证脚本 `node .\realtime_check.js` 会注册临时账号、下单并取消，跑完用 `reset_demo.ps1` 恢复种子。证据在 `delivery/evidence/M5/realtime-check.json`、`realtime-ui-check.json`、`03-admin-live.png` 与 `04-admin-live-before.png`。

打开 `http://127.0.0.1:8080`，用 `buyer01` / `Demo@1234` 登录；结算页的“Simulate successful payment”即完成测试支付并出票。管理端打开 `http://127.0.0.1:8081`，用 `admin` / `Demo@1234`（全部页面）或 `checker01` / `Demo@1234`（仅验票、仅授权场次）。脚本会自动查找 `C:\xampp`、`D:\xampp`、`D:\_Coding\XAMPP`，也可以设置 `XAMPP_HOME`；默认 root 空密码、库名 `ticketing_system`。路径或 root 密码不同时，先按 `docs/local-run-guide.md` 处理，不要逐个改脚本。

## 数据规模

- 17 张表、122 个业务字段、22 个外键（全部 `RESTRICT`）
- 3 个场馆共 670 座；8 个活动、16 个场次、3630 条场次座位
- 594 个订单、1761 条明细、1751 张票、593 条支付通知、629 条核销、6 条退款
- 34 个演示账号（buyer01–buyer30、admin、checker01–checker03），密码统一 `Demo@1234`
- M4 基准库另有 100 场次、20,000 条场次座位、10,000 条订单、14,000 条明细、11,200 张票、9,500 条支付尝试、8,000 条通知、2,000 条退款、2,000 条核销；102 个 bench 账号密码统一 `Demo@1234`

## 数据库约定

- 严格模式必须开启；否则 `NOT NULL` 写入 NULL 会被静默转型，CHECK 形同虚设
- 金额一律整数分，时间为 `DATETIME(3)` 按 UTC 存储、展示层转 `Asia/Hong_Kong`
- 外键统一 `ON DELETE RESTRICT / ON UPDATE RESTRICT`，历史数据不删改
- 枚举用 `VARCHAR + CHECK`；座位唯一键含区域，避免 A/B 区同排同号撞键

## 校验脚本

```powershell
cd database
python check_schema.py     # 静态校验 DDL（不依赖数据库）
python validate_db.py      # 33 条约束用例（脚本先清空业务表，跑完用 reset_demo.ps1 恢复）
python check_fields.py     # 实库列数 vs 字典字段数
python verify_seed.py      # 13 项种子不变量
python verify_password.py  # 34 个账号 bcrypt 校验（需 pip install bcrypt）

cd ..\scripts
.\m1_check.ps1             # 19 条 M1 断言：下单/幂等/支付/出票/QR/取消/并发
.\m2_check.ps1             # 45 条 M2 断言：角色/活动/场次/票价/批量封座/验票/退款终态/对账/统计
node .\m4_bench.js baseline  # M4 查询基准（需 3100 bench API）
node .\m4_anomaly_check.js   # M4 AC-14/17/24（需 3100 bench API）
```

## 已知限制

- `seed.sql` 的时间相对导入时刻生成，P13 场次的核销窗口只在导入后约 40 分钟内有效，演示前重跑 `reset_demo.ps1` 即可重置。
- 管理端验票接受票码文本（二维码 JWT 载荷或 64 位票码哈希），不要求摄像头或硬件扫码；座位页支持单座、批量选择和整区封锁/恢复。
- 退款由管理员在管理端确认成功/失败：成功作废票据并释放座位，失败恢复 PAID 与 VALID；不接真实支付网关。
- 支付为测试模式，结算页按钮模拟成功/失败/超时，不接真实支付网关、不产生真实扣款。
- 活动列表的 `venue_name` 在多场馆活动显示 `Multiple venues`；`min_price_cents` 取全部在售场次最低价。
- 座位图一次返回整场座位（最多 350 条），未做分页或增量刷新；R1 只提供失效信号与可选 ID，页面仍需整场重取；窄屏在座位图内部横向滚动，页面本身不横向溢出。
- 实时刷新只在页面可见且不处于支付、取消、退款、对账操作时发起；后台页面不刷新，回前台补一次。
- 角色以登录时的 token 快照为准，撤销授权不会立刻让已发 token 失效（8 小时内仍有效）。
- 用户端为 Vue 3 + Vite；课程模板是 Vue 2 + Mint UI/Element UI + webpack，视觉与信息架构对齐，技术栈差异见 `web-user/README.md`。
- 课程报告、ER 图和系统结构图在 `docs/`；数据库设计说明 Word、属性清单等如课程要求单独提交，从 `DB/` 或 `docs/` 取对应文件，不要混入无关归档。
- 演示视频待与组员共同完成；8 人姓名、学号、邮箱、分工和 12.5% 均分已填；报告 PDF 仍待导出。
- GitHub 仓库：<https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>；当前 `origin/main` 是 FilmSys 模板基线（`b48385d`，248 个文件），与本地 StagePass 历史无共同祖先；先决定替换或合并，再 push，不能直接快进。
- M5 干净环境验收使用 3200/8180/8181，因为默认 3000/8080/8081 被演示实例占用；默认配置未改，空机器可直接用默认端口。

## 文档索引

- 需求：`docs/requirements-spec.md`
- 数据字典：`docs/database-design.md`
- 接口契约：`docs/api-contract.md`
- M4 性能报告：`docs/performance-report.md`
- M5 课程报告：`docs/course-report.md`
- 系统结构图：`docs/system-architecture.png`、`docs/system-architecture.svg`
- 成员贡献记录：`docs/member-contributions.md`
- 成员名单：`docs/team-roster.md`
- 最终提交清单：`docs/submission-checklist.md`
- 交付清单与验收项：`delivery/MANIFEST.md`、`delivery/CHECKLISTS.md`