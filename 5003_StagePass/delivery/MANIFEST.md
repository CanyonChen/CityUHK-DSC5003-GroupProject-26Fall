# 交付物清单与依赖索引

> 版本 v1.0（2026-11-23）｜由 `check_delivery.py --manifest` 自动生成，请勿手改
> 项目：StagePass — DSC5003 Ticketing System (Track 1, dual frontend) - GitHub release

## 状态定义

| 状态 | 含义 | 处理方式 |
|---|---|---|
| ACTIVE | 当前基线，所有修改以它为准 | 可以改，改前先算影响面 |
| REVIEW | 结构接近基线但未逐项核对 | 核对后转 ACTIVE 或 STALE |
| STALE | 内容对应旧模型，未同步 | 重生成或归档 |
| LEGACY | 被取代的历史版本 | 只读，移入 `_archive/` |
| DUPLICATE | 重复副本 | 删除或归档 |
| EXTERNAL | 外部链接（飞书表） | 与本地源同步 |

## 清单

| ID | 文件 | 版本 | 状态 | 直接上游 | 直接下游 | 说明 |
|---|---|---|---|---|---|---|
| API-SPEC | docs/api-contract.md | v1.9 | ACTIVE | REQ | SCRIPT-SMOKE、SRV-ROUTES-AUTH、SRV-ROUTES-HEALTH、SRV-SERVICE-AUTH、SRV-AUTH-MW、SRV-SERVICE-CATALOG、SRV-ROUTES-EVENTS、SRV-ROUTES-PERF、SRV-SERVICE-RECOMMEND、SCRIPT-CATALOG、SRV-SERVICE-ORDERS、SRV-SERVICE-PAYMENTS、SRV-SERVICE-TICKETS、SRV-SERVICE-USERS、SRV-SERVICE-RECON、SCRIPT-M3CHECK | API 契约 v1.9：47 条契约 + 4 个管理端辅助 + 11.1 WebSocket 失效信号；新增 API-47 多人连座推荐 |
| CHECKFIELDS | database/check_fields.py | - | ACTIVE | DICT、DDL | — | 逐表列数与字典核对 |
| CHECKLIST-M5 | docs/submission-checklist.md | v1.7 | ACTIVE | CONTRIB-M5、REPORT-M5 | — | M5 提交清单 v1.7：报告补 Group Information/Contribution Statement 与静态系统图；课程 brief 已取得（PDF/GitHub/视频）；成员信息、视频与 PDF 待补 |
| CHECKSCHEMA | database/check_schema.py | - | ACTIVE | DDL | — | schema.sql 静态校验（sqlglot 解析 + 结构断言），不依赖数据库 |
| CONTRIB-M5 | docs/member-contributions.md | v1.0 | ACTIVE | — | CHECKLIST-M5 | M5 成员贡献记录：四组八人角色、任务与证据；姓名/学号/比例待组员确认 |
| DDL | database/schema.sql | v1.2 | ACTIVE | REQ、DICT | SEED、VERIFYDB、CHECKFIELDS、SCRIPT-RESET、CHECKSCHEMA、SRV-DB、SRV-SERVICE-CATALOG、SRV-SERVICE-ORDERS、SRV-SERVICE-PAYMENTS、SRV-SERVICE-TICKETS、SCRIPT-M4DATA | 17 表 DDL；users 增加 token_version，payment_notifications 增加 payload_json；已实库建表并通过约束用例 |
| DICT | docs/database-design.md | v1.2 | ACTIVE | REQ | DDL、CHECKFIELDS、SRV-SERVICE-USERS、REPORT-M5 | 数据字典：实体清单 / 关系概述 / 逐表字段；新增 token_version 与通知原文列 |
| EVID-ACCOV | delivery/evidence/M5/ac-coverage.json | v1.0 | ACTIVE | SCRIPT-ACCOV、EVID-M5、REPORT-M5 | — | 2026-11-22 独立库运行结果：17/17 PASS（P0 16 + AC-25），含 run_id、base、database、summary 与逐条 evidence |
| EVID-M4 | delivery/evidence/M4/README.md | - | ACTIVE | SCRIPT-M4DATA、SCRIPT-M4BENCH、SCRIPT-M4ANOM | REPORT-M4 | M4 证据索引：规模数据、benchmark、EXPLAIN、索引实验、reservation、异常用例与日志 |
| EVID-M5 | delivery/evidence/M5/README.md | v1.3 | ACTIVE | REPORT-M5 | EVID-ACCOV、EVID-REC-UI | M5 证据索引 v1.3：在干净环境与 R1 证据上增加 P0/P1 17/17、AC-25 连座推荐面板实测与两张截图 |
| EVID-REC-UI | delivery/evidence/M5/recommendation-ui-check.json | v1.0 | ACTIVE | EVID-M5 | WEB-USER-VIEWS | AC-25 用户端生产构建实测：默认 2 人/A 区，三张同排无通道卡，选中不锁座，HELD 前后均为 2 |
| REPORT-M4 | docs/performance-report.md | v1.0 | ACTIVE | SCRIPT-M4BENCH、EVID-M4 | REPORT-M5 | M4 性能报告：环境、数据规模、5 类查询 P95、EXPLAIN、索引实验、50 并发预留、AC-14/17/24 与复现步骤 |
| REPORT-M5 | docs/course-report.md | v1.7 | ACTIVE | REQ、DICT、REPORT-M4 | EVID-M5、CHECKLIST-M5、EVID-ACCOV | M5 课程报告 v1.7（2026-11-23 修订）：新增 Group Information/Contribution Statement、静态系统图、DDL 字段名修正、NFR 目标表与 GitHub 链接；保留 Track 1 证据地图与 17/17 缺口补测 |
| REQ | docs/requirements-spec.md | v1.6 | ACTIVE | — | DICT、DDL、API-SPEC、SCRIPT-M3CHECK、REPORT-M5 | 需求基线：双前端 + 共用 API，支持多场馆、演示种子 3 场馆/670 座；含 R1 广播作用域、前端节流、可见性与操作暂停（FR-04、AC-26） |
| SCRIPT-ACCOV | scripts/ac_coverage_check.js | - | ACTIVE | — | EVID-ACCOV | P0/P1 AC 补测：16 条 P0 + AC-25 可单跑或 --all，默认独立 API 3300 / 库 ticketing_ac，输出 delivery/evidence/M5/ac-coverage.json |
| SCRIPT-CATALOG | scripts/catalog_check.ps1 | - | ACTIVE | API-SPEC、SEED、SRV-SERVICE-CATALOG | — | T2 32 条目录接口验收断言 |
| SCRIPT-COMMON | scripts/_common.ps1 | - | ACTIVE | — | — | 共享常量与函数：数据库启动、SQL 导入、端口探测、Node 启动 |
| SCRIPT-COVERS | scripts/generate_covers.py | - | ACTIVE | — | WEB-USER-COVERS | M1 活动封面生成器 |
| SCRIPT-DEV | scripts/dev.ps1 | - | ACTIVE | SCRIPT-RESET | — | 一条命令起数据库、API、两个前端 |
| SCRIPT-M1CHECK | scripts/m1_check.ps1 | - | ACTIVE | SRV-SERVICE-ORDERS、SRV-SERVICE-PAYMENTS、SRV-SERVICE-TICKETS | — | M1 订单/支付/票据 HTTP 冒烟（8 组 19 条断言） |
| SCRIPT-M2CHECK | scripts/m2_check.ps1 | - | ACTIVE | — | — | M2 验收：角色、活动/场次/票价、批量封座、验票、退款终态、对账、统计 |
| SCRIPT-M3CHECK | scripts/m3_check.ps1 | - | ACTIVE | REQ、API-SPEC | — | M3 验收：9 组 33 条断言，覆盖注册/退出/角色/对账/退款边界 |
| SCRIPT-M4ANOM | scripts/m4_anomaly_check.js | - | ACTIVE | SRV-SERVICE-REFUNDS | EVID-M4 | M4 异常用例：AC-17 退票/核销并发、AC-24 退款释放重购、AC-14 重启后通知重放 |
| SCRIPT-M4BENCH | scripts/m4_bench.js | - | ACTIVE | SRV-SERVICE-ORDERS | EVID-M4、REPORT-M4 | M4 查询基准：baseline/indexes/tuned/drop/reservation 五种模式，输出 EXPLAIN 与 P95 |
| SCRIPT-M4DATA | scripts/m4_scale_setup.js | - | ACTIVE | DDL | EVID-M4 | M4 规模数据生成器：DROP/重建 ticketing_bench，生成 100 场次、20,000 场次座位、10,000 订单 |
| SCRIPT-PERF | scripts/perf_smoke.ps1 | - | ACTIVE | — | — | M3 核心读接口冒烟计时：5 个端点 × 5 次，curl 计时 |
| SCRIPT-REALTIME | scripts/realtime_check.js | - | ACTIVE | — | — | R1 验证：连接、下单/取消广播、帧作用域、数据边界、断线 REST、Origin 拒绝 8 条 |
| SCRIPT-RECONCHECK | scripts/recon_auto_check.ps1 | - | ACTIVE | — | — | M3 定时对账自动触发验收：独立 API 10s interval，插入 PENDING 后等待自动重放 |
| SCRIPT-RESET | scripts/reset_demo.ps1 | - | ACTIVE | DDL、SEED | SCRIPT-DEV | 清库 → 建表 → 导 seed → 13 项不变量校验 |
| SCRIPT-SMOKE | scripts/smoke.ps1 | - | ACTIVE | SEED、API-SPEC、SRV-ROUTES-AUTH、SRV-ROUTES-HEALTH | — | T1 五条接口断言；接口路径集中在 $Paths |
| SCRIPTS-README | scripts/README.md | - | ACTIVE | — | — | 脚本用法、前提与行为约定 |
| SEED | database/seed.sql | v1.1-demo | ACTIVE | DDL、SEEDGEN | VERIFYSEED、SCRIPT-RESET、SCRIPT-SMOKE、SCRIPT-CATALOG | 演示种子数据，可重复导入 |
| SEEDGEN | database/build_seed.py | - | ACTIVE | — | SEED | 种子生成器；改 seed 结构必须先改这里 |
| SRV-APP | server/src/app.js | - | ACTIVE | SRV-HTTP、SRV-ROUTES-ORDERS、SRV-ROUTES-PAYMENTS、SRV-ROUTES-TICKETS | SRV-ROUTES-EVENTS、SRV-ROUTES-PERF | 中间件装配：CORS、request_id、日志、404、错误处理 |
| SRV-AUTH-MW | server/src/middleware/auth.js | - | ACTIVE | API-SPEC | SRV-ROUTES-PERF | JWT 校验、可选鉴权与角色校验；每次请求比对 users.token_version 并重读角色（401/403） |
| SRV-CONFIG | server/src/config.js | - | ACTIVE | — | SRV-DB、SRV-SERVICE-AUTH | 环境变量与常量：端口、数据库、JWT 8 小时、sql_mode |
| SRV-DB | server/src/db.js | - | ACTIVE | DDL、SRV-CONFIG | SRV-ROUTES-HEALTH、SRV-SERVICE-AUTH、SRV-SERVICE-CATALOG | mysql2 连接池，每条连接设严格模式，DATETIME 按 UTC 解析 |
| SRV-HTTP | server/src/lib/http.js | - | ACTIVE | — | SRV-APP、SRV-ROUTES-AUTH、SRV-ROUTES-HEALTH、SRV-LIB-PARAMS | 统一响应包、ApiError、request_id、错误处理 |
| SRV-LIB-AUDIT | server/src/lib/audit.js | - | ACTIVE | — | SRV-SERVICE-PAYMENTS | M1 审计写入；兼容连接对象与 query 函数两种执行器 |
| SRV-LIB-BODY | server/src/lib/body.js | - | ACTIVE | — | SRV-SERVICE-ORDERS | M1 请求体校验与 Idempotency-Key 读取 |
| SRV-LIB-FORMAT | server/src/lib/format.js | - | ACTIVE | — | SRV-SERVICE-ORDERS | M1 订单号派生、座位标签、金额与时间格式化 |
| SRV-LIB-PARAMS | server/src/lib/params.js | - | ACTIVE | SRV-HTTP | SRV-ROUTES-EVENTS、SRV-ROUTES-PERF | 查询参数校验：分页、正整数、日期 |
| SRV-PKG | server/package.json | - | ACTIVE | — | — | 服务依赖与启动命令（npm start / npm run dev） |
| SRV-README | server/README.md | - | ACTIVE | — | — | 服务启动、端点、M3 注册/退出/角色/对账说明与已知限制 |
| SRV-REALTIME | server/src/realtime.js | - | ACTIVE | — | — | R1 WebSocket `/ws`：仅本地 Origin、1 KB 帧、30 秒心跳；广播 data.changed 失效信号与可选整数作用域 |
| SRV-REALTIME-SCOPE | server/src/realtime-scope.js | - | ACTIVE | — | — | R1 广播作用域解析：从 res.locals.realtime、请求体、路径与数据库关联取订单/场次 ID；失败退化为仅 path |
| SRV-ROUTES-ADMIN | server/src/routes/admin.js | - | ACTIVE | — | — | M2/M3 /admin 路由与 ADMIN/CHECKER 分权；含用户、角色与自动对账辅助 |
| SRV-ROUTES-AUTH | server/src/routes/auth.js | - | ACTIVE | API-SPEC、SRV-HTTP | SCRIPT-SMOKE | API-01/02/03/04 注册、登录、服务端退出与当前用户 |
| SRV-ROUTES-EVENTS | server/src/routes/events.js | - | ACTIVE | API-SPEC、SRV-LIB-PARAMS、SRV-SERVICE-CATALOG、SRV-APP | — | API-06 活动列表、API-07 活动详情 |
| SRV-ROUTES-HEALTH | server/src/routes/health.js | - | ACTIVE | API-SPEC、SRV-DB、SRV-HTTP | SCRIPT-SMOKE | API-05 健康检查，真实 ping 数据库 |
| SRV-ROUTES-ORDERS | server/src/routes/orders.js | - | ACTIVE | SRV-SERVICE-ORDERS | SRV-APP | M1 挂载 API-11~14，默认要求登录 |
| SRV-ROUTES-PAYMENTS | server/src/routes/payments.js | - | ACTIVE | SRV-SERVICE-PAYMENTS | SRV-APP | M1 挂载 API-16~19；notify 在鉴权前 |
| SRV-ROUTES-PERF | server/src/routes/performances.js | - | ACTIVE | API-SPEC、SRV-SERVICE-RECOMMEND、SRV-LIB-PARAMS、SRV-SERVICE-CATALOG、SRV-APP、SRV-AUTH-MW | — | API-08 场次列表、API-09 详情、API-10 座位图、API-47 连座推荐 |
| SRV-ROUTES-TICKETS | server/src/routes/tickets.js | - | ACTIVE | SRV-SERVICE-TICKETS | SRV-APP | M1 挂载 API-20~22 |
| SRV-SERVICE-ADMIN | server/src/services/admin.js | - | ACTIVE | — | — | M2 管理服务：活动/场次/票价、单座与批量/整区封座、验票、统计、支付异常、退款、审计 |
| SRV-SERVICE-AUTH | server/src/services/auth.js | - | ACTIVE | API-SPEC、SRV-CONFIG、SRV-DB | — | 注册、登录、服务端退出、当前用户、角色聚合（USER + 未撤销授权） |
| SRV-SERVICE-CATALOG | server/src/services/catalog.js | - | ACTIVE | DDL、API-SPEC、SRV-DB | SRV-ROUTES-EVENTS、SRV-ROUTES-PERF、SCRIPT-CATALOG | API-06~10 的查询层：活动/场次/座位图 |
| SRV-SERVICE-ORDERS | server/src/services/orders.js | - | ACTIVE | API-SPEC、DDL、SRV-LIB-BODY、SRV-LIB-FORMAT | SRV-ROUTES-ORDERS、SCRIPT-M1CHECK、SCRIPT-M4BENCH | M1 下单事务、幂等、CFG-04 单待支付单、取消与到期释放 |
| SRV-SERVICE-PAYMENTS | server/src/services/payments.js | - | ACTIVE | API-SPEC、DDL、SRV-LIB-AUDIT | SRV-ROUTES-PAYMENTS、SCRIPT-M1CHECK、SRV-SERVICE-RECON | M1 支付尝试、模拟支付、HMAC 通知、出票与迟到退款；M3 为通知保存 payload_json 供对账重放 |
| SRV-SERVICE-RECOMMEND | server/src/services/seat-recommendations.js | - | ACTIVE | API-SPEC、WEB-USER-API | SRV-ROUTES-PERF | API-47 的只读连座推荐：相邻分组、通道/区域/状态边界与确定性排序 |
| SRV-SERVICE-RECON | server/src/services/reconciliation.js | - | ACTIVE | API-SPEC、SRV-SERVICE-PAYMENTS | — | M3 自动对账 worker：PENDING 通知按 payload_json 重放，写审计与状态 |
| SRV-SERVICE-REFUNDS | server/src/services/refunds.js | - | ACTIVE | — | SCRIPT-M4ANOM | API-15 退款申请 + API-43 终态确认：本人、PAID、开场前 24h、全票 VALID、支付成功且金额一致；成功释放座位、失败回滚 |
| SRV-SERVICE-TICKETS | server/src/services/tickets.js | - | ACTIVE | API-SPEC、DDL | SRV-ROUTES-TICKETS、SCRIPT-M1CHECK | M1 票据列表/详情/60 秒 QR 与核销信息 |
| SRV-SERVICE-USERS | server/src/services/users.js | - | ACTIVE | API-SPEC、DICT | WEB-ADMIN-USERS | M3 用户列表、授予/撤销角色、最后管理员保护与审计 |
| VERIFYDB | database/validate_db.py | - | ACTIVE | DDL | — | 34 条结构与约束用例 |
| VERIFYPWD | database/verify_password.py | - | ACTIVE | — | — | 演示账号 bcrypt 校验 |
| VERIFYSEED | database/verify_seed.py | - | ACTIVE | SEED | — | 种子数据不变量校验 |
| WEB-ADMIN | web-admin/README.md | - | ACTIVE | — | — | 管理端 8081：7 页 + 深蓝/金主题；含 Users 角色页、自动对账卡、退款终态、批量与整区封座；Vue3 + Vite |
| WEB-ADMIN-LIVEREFRESH | web-admin/src/liveRefresh.js | - | ACTIVE | — | — | 管理端刷新调度器：与用户端同参数；概览只收统计路径，财务只收支付/退款/对账路径 |
| WEB-ADMIN-REALTIME | web-admin/src/realtime.js | - | ACTIVE | — | — | 管理端 WS 客户端：概览与财务页收到信号后重取；返回可调用 stop() |
| WEB-ADMIN-USERS | web-admin/src/views/UsersView.vue | - | ACTIVE | SRV-SERVICE-USERS | — | M3 Users & roles：搜索、角色筛选、授权、撤销、最后管理员提示 |
| WEB-USER-API | web-user/src/api.js | - | ACTIVE | — | WEB-USER-ROUTER、SRV-SERVICE-RECOMMEND | M1 前端 API 封装与自动幂等键 |
| WEB-USER-APP | web-user/src/App.vue | - | ACTIVE | WEB-USER-AUTH | — | M1 品牌头部、导航、登录状态与页脚 |
| WEB-USER-AUTH | web-user/src/auth.js | - | ACTIVE | — | WEB-USER-APP | M1 会话 token 与 localStorage 持久化 |
| WEB-USER-CONFIG | web-user/vite.config.js | - | ACTIVE | — | — | M1 Vite 8080 配置 |
| WEB-USER-COVERS | web-user/public/media/README.md | - | ACTIVE | SCRIPT-COVERS | — | 8 张 1600×900 SVG 活动封面索引，封面文件在同目录 |
| WEB-USER-ENTRY | web-user/src/main.js | - | ACTIVE | — | — | M1 应用入口与 401 全局跳登录 |
| WEB-USER-LIVEREFRESH | web-user/src/liveRefresh.js | - | ACTIVE | — | — | 用户端刷新调度器：300 ms 防抖、500 ms 最短间隔/最大等待、单请求在飞、隐藏暂停、操作暂停 |
| WEB-USER-PKG | web-user/package.json | - | ACTIVE | — | — | M1 用户端 Vue 3 + Vite 依赖与 8080 启动脚本 |
| WEB-USER-README | web-user/README.md | - | ACTIVE | — | — | M1 用户端启动、演示账号、页面流程与技术栈说明 |
| WEB-USER-REALTIME | web-user/src/realtime.js | - | ACTIVE | — | — | 用户端 WS 客户端：2 秒重连；只回调 data.changed；返回可调用 stop() |
| WEB-USER-ROUTER | web-user/src/router.js | - | ACTIVE | WEB-USER-API | — | M1 公开页与需登录页路由守卫 |
| WEB-USER-STYLES | web-user/src/styles.css | - | ACTIVE | — | WEB-USER-VIEWS | M1 深蓝+金色视觉、座位四状态、响应式 |
| WEB-USER-VIEWS | web-user/src/views/README.md | - | ACTIVE | WEB-USER-STYLES、EVID-REC-UI | — | M1 8 个页面（登录/活动/场次/座位/结算/订单/票据）索引，页面文件在同目录 |

## 模块与验收清单

| 模块 | 内容 | 状态 | 预计 | 任务数 | 验收项 |
|---|---|---|---|---|---|
| T0 | 工程化前置：环境脚本与接口契约 | DONE | 2h | 0 | 4 |
| M1 | 垂直切片：登录 → 选座 → 下单 → 支付 → 出票 | DONE | 16h | 9 | 42 |
| M2 | 双端补全：订单/退票 + 管理端全功能 | DONE | 24h（含追加 4h 补全） | 8 | 34 |
| M3 | 联调验收：权限、异常、并发、部署 | DONE | 18h | 0 | 8 |
| M4 | 正确性与查询评估：规模数据、并发、执行计划 | DONE | 16h | 5 | 28 |
| M5 | 集成与交付：干净环境、课程报告、贡献记录与提交包 | PARTIAL | 12h（视频待与组员共同完成） | 6 | 26 |

逐项清单见 `CHECKLISTS.md`（`--checklists` 生成）；单项查询用 `--checklist M1` / `--checklist DDL`。

## 变更操作流程

1. 明确要改的是哪个 ID（例如 `DICT`）。
2. 先算影响面：`python check_delivery.py --impact DICT`，按输出逐项同步。
3. 新增交付或新模块时，先在 `delivery.json` 登记 nodes/modules **并写明 checklist**；没有清单的条目会被判 FAIL。
4. 改完跑 `python check_delivery.py`，直到没有 FAIL；WARN 逐条判断。
5. 更新 `delivery.json` 的 `version` / `updated`，再跑 `--manifest` 与 `--checklists`。

## 口径锚点

- 实体名、字段名只以 `DICT` 为准，DDL 与 seed 必须与它逐列对齐。
- 业务规则与验收口径只以 `REQ` 为准，其它文档引用时不要复述数值。
- 时间统一 `DATETIME(3)` 按 UTC 存储，展示层转 `Asia/Hong_Kong`；金额统一整数分。
- 旧版文件不删除，移入 `_archive/` 并在本表标 LEGACY，避免“旧版本还在被引用”。

## 当前待处理

- `DOC-DB` / `DOC-REL` / `DOC-OPS` / `ER-HTML` / `ATTR-XLSX` / `FEISHU` 已按 17 实体、122 业务字段同步为 v2.0；当前检查为 FAIL 0 / WARN 0。
- `REQ-V10`、`REQ-V10-AI`、`REQ-DUP`、`V0-*` 已归档到 `_archive/`，不参与发布。
