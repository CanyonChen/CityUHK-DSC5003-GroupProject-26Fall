# 交付验收清单

> 自动生成于 2026-11-23，由 `check_delivery.py --checklists` 输出，请勿手改
> 规则：ACTIVE / REVIEW / STALE 节点必须带 checklist；新增模块或交付时先登记清单，否则 check_delivery.py 判 FAIL
> 勾选规则：`[x]` = DONE / ACTIVE，清单已逐项验收；`[ ]` = REVIEW / STALE 等，待复核。

## 一、模块验收

### T0 工程化前置：环境脚本与接口契约

- 状态：DONE　预计：2h　目标：开工前把环境启动、数据重置、冒烟与接口口径固定下来

- [x] dev/reset/smoke 三个脚本在无代码状态下可运行
- [x] reset_demo 实测 3 秒内完成且 13/13 通过
- [x] smoke 对 mock 正常 5/5、异常 5 FAIL
- [x] API 契约 41 端点与 FR/AC 对应

### M1 垂直切片：登录 → 选座 → 下单 → 支付 → 出票

- 状态：DONE　预计：16h　目标：在 8080 用户端完成一笔真实订单，数据落库且满足幂等与库存约束

- [x] 从登录到出票全链路在浏览器走通一次，数据库有对应 orders/tickets 记录
- [x] 并发抢座与重复支付通知两类用例通过
- [x] M1 范围内 API 全部经 Postman 或脚本验证，错误码符合约定
- [x] T1–T8 验收项无未勾选项

#### T1 后端骨架 + MySQL 连接 + 登录（2h）　· DONE

- [x] GET /health 返回 200，含数据库连接状态
- [x] 正确账号密码返回 token 与角色；错误密码 401
- [x] 错误响应不区分“账号不存在”和“密码错误”
- [x] 未带 token 访问受保护接口返回 401

#### T2 活动 / 场次 / 座位只读 API（2h）　· DONE

- [x] 活动列表返回 7 条（8 个活动中 1 个仅含草稿场次，按 AC-03 隐藏）
- [x] 场次详情含销售窗、核销窗、状态、票价区
- [x] 座位接口返回 200/120/350 座，四种状态正确
- [x] 已售与预留座不可选，价格与 tier 一致
- [x] 草稿活动 / 草稿场次对外 404，场次筛选 on_sale/paused/closed 正确
- [x] catalog_check.ps1 32/32 通过

#### T3 下单事务（锁座 + 幂等）（2h）　· DONE

- [x] 并发抢同一座位只有 1 单成功，其余返回 409
- [x] 同幂等键、同内容返回原订单，不新建
- [x] 同幂等键、不同内容返回 409 且不落库
- [x] 订单 expires_at 为创建后 5 分钟内（取创建+5 分钟与售票截止较早者），座位为 HELD 且绑定该单
- [x] 事务失败后无残留 HELD 或半成品订单

#### T4 模拟支付 + 回调幂等 + 出票（2h）　· DONE

- [x] 支付成功后订单变 PAID，票生成且票码哈希唯一
- [x] 同一通知重复投递只处理一次，第二次记 DUPLICATE
- [x] 金额不符的通知记 REJECTED，订单状态不变
- [x] 过期后到账进入 REFUND_PENDING 并生成 PENDING 退款
- [x] 支付失败订单保持 PENDING_PAYMENT，可重试

#### T5 用户端骨架 + 登录页 + 活动列表（2h）　· DONE

- [x] 8080 可启动，路由与 404 正常
- [x] 登录后 token 持久化，刷新不掉线
- [x] 活动卡片显示封面、时间、场馆、起价
- [x] 未登录点击购票跳转登录页

#### T6 场次详情 + SVG 座位图 + 选座（2h）　· DONE

- [x] SVG 正确渲染 1 号场馆 200 座，区域与通道可见（演示种子总计 3 场馆 670 座）
- [x] 四种座位状态颜色区分，图例正确
- [x] 点选与取消正常，最多 4 座
- [x] 合计金额随选择实时变化
- [x] 手机宽度下不横向溢出

#### T7 下单确认 + 支付页 + 电子票（2h）　· DONE

- [x] 确认页显示座位、单价、总额与倒计时
- [x] 支付成功跳转票页，二维码可扫
- [x] 支付失败可重试，不产生重复订单
- [x] 我的订单列表状态与实际一致

#### T8 M1 验收 + 启动文档（2h）　· DONE

- [x] README 从零启动步骤可复制执行
- [x] reset_demo 一条命令恢复演示数据
- [x] 8 条冒烟用例全部通过并留截图
- [x] 新环境 30 分钟内跑通

#### T9 缓冲（2h）　· DONE

- [x] Node 版本、二维码库、图片素材问题已记录处理方式

### M2 双端补全：订单/退票 + 管理端全功能

- 状态：DONE　预计：24h（含追加 4h 补全）　目标：用户端补齐订单/退票/票夹闭环；管理端 8081 提供活动、场次、票价、单座/批量封座、验票、订单、退款申请与终态确认、支付异常与统计对账

- [x] 用户端我的订单、退票、票夹可用
- [x] 管理端活动/场次/票价 CRUD 与权限校验通过
- [x] 管理端座位图可单座、批量与整区封锁/恢复
- [x] 验票工作区只对授权场次开放，输入票码文本，不要求摄像头
- [x] 退款可确认成功/失败并联动票据与座位
- [x] 统计页数据与数据库一致

#### T1 退款服务与用户端退票（3h）　· DONE

- [x] 本人 PAID 且开场前 ≥24h 才可退
- [x] 全部票 VALID 且无 USED
- [x] 同键重放同一退款；新键 409

#### T2 管理端骨架与登录（2h）　· DONE

- [x] 8081 独立启动，ADMIN 全路由 / CHECKER 仅验票
- [x] 非后台角色登录被拒
- [x] 401 自动清理会话

#### T3 活动 CRUD（4h）　· DONE

- [x] 列表含草稿与发布统计
- [x] 新建/编辑后立即回读一致
- [x] 封面只接受预置媒体或 URL

#### T4 场次、票价、座位（5h）　· DONE

- [x] 新建场次按场馆生成全部 session_seats
- [x] 发布/暂停/恢复状态正确
- [x] 单座封锁/恢复即时反映到座位库存
- [x] 批量选择与整区封锁/恢复可用，HELD/SOLD 跳过
- [x] 改价只影响后续订单

#### T5 验票工作区（3h）　· DONE

- [x] 只列已授权场次
- [x] 成功、重复、越窗、错场次错误码正确
- [x] 成功写入 checkins 与审计

#### T6 统计、支付异常、退款、审计（3h）　· DONE

- [x] 统计合计与逐场次求和一致
- [x] 退款列表可按订单查询
- [x] 退款成功/失败联动票据与座位
- [x] 对账只登记结果不改库状态

#### T7 M2 验收与交付（2h）　· DONE

- [x] m2_check.ps1 45/45
- [x] 两个前端 build 成功
- [x] 发布包重建并 0 FAIL

#### T8 M2 补全：退款终态与批量封座（4h）　· DONE

- [x] API-43 成功作废票据并释放座位，失败恢复 PAID/VALID
- [x] 迟到付款退款保持订单 EXPIRED
- [x] API-42 单座/批量/整区封座与恢复通过测试
- [x] 验票界面改为输入票码，不出现摄像头扫码口径

### M3 联调验收：权限、异常、并发、部署

- 状态：DONE　预计：18h

- [x] API-01/03 注册与安全退出通过，退出后旧 token 立即 401
- [x] API-44~46 用户、角色与验票员场次授权通过，非管理员一律 403
- [x] 定时对账 worker 可重放未处理通知并在管理端显示运行状态
- [x] 并发抢座、重复通知、超时释放、退款失败四类用例通过（M2 45 条回归）
- [x] 已核销票退款与截止后退款被拒绝并有证据
- [x] 5 条核心查询有冒烟耗时记录；完整执行计划与 P95 归 M4
- [x] 部署文档与演示脚本可在干净目录复现
- [x] 验收结果与需求 AC 编号一一对应

### M4 正确性与查询评估：规模数据、并发、执行计划

- 状态：DONE　预计：16h　目标：在 100 场次 / 20,000 场次座位 / 10,000 订单上验证代表查询 P95、索引实验、50 并发预留和 AC-14/17/24 异常路径，并留下可复现证据

- [x] ticketing_bench 可重复生成 100 场次、20,000 场次座位、10,000 订单，三项自检通过
- [x] Q-01/Q-02/Q-03/Q-04/Q-05 在 50 并发、500 样本下有平均与 P95，全部达到目标
- [x] Q-01/Q-02/Q-03 有 EXPLAIN，索引实验有 baseline/tuned 对比与删除结论
- [x] 50 并发预留 50/50 HTTP 201，P95 ≤ 1,000 ms，无超卖
- [x] AC-17 退票/核销并发恰好一个 2xx、一个 409、无 500
- [x] AC-24 退款释放座位后重购，旧票持续失效、新票仅核销一次、两订单保留
- [x] AC-14 中断重启后通知重放收敛到唯一正确结果
- [x] 性能报告、证据索引与 delivery/MANIFEST/CHECKLISTS 已登记，check_delivery 为 FAIL 0 / WARN 0

#### T1 规模数据与基准库（4h）　· DONE

- [x] 独立 ticketing_bench 可重复重建 100 场次、20,000 场次座位、10,000 订单
- [x] M4 基准库每场 200 座且四状态合计 200（与演示种子 3 场馆/670 座无关）
- [x] 订单金额与明细不一致 0，已支付订单无票 0
- [x] 输出 dataset-summary.json

#### T2 查询基准、EXPLAIN 与索引实验（5h）　· DONE

- [x] 5 个接口 × 500 样本 × 50 并发，全部 HTTP 200
- [x] Q-01 P95 133.64 ms、Q-02 1,095.12 ms、Q-03 559.67 ms、Q-04 139.17 ms、Q-05 96.44 ms
- [x] Q-01/Q-02/Q-03 有 JSON 与表格 EXPLAIN
- [x] 4 个候选索引 baseline/tuned 对比后删除，恢复 20 个显式索引

#### T3 50 并发预留与死锁修复（4h）　· DONE

- [x] 最终 50/50 HTTP 201，P95 380.77 ms
- [x] 50 个 HELD 座位、50 个不同 holder、无超卖
- [x] createOrder 使用 READ COMMITTED 消除 gap lock 死锁
- [x] loadOrder 复用事务连接，消除连接池死锁

#### T4 AC-14/17/24 异常用例（2h）　· DONE

- [x] AC-17 恰好 1 个 2xx、1 个 409、0 个 500
- [x] AC-24 旧票 VOID、新票 USED、仅 1 次核销、两订单保留
- [x] AC-14 重启后 payment SUCCEEDED、order PAID、notice APPLIED、仅 1 张票
- [x] m4-anomalies.json all_pass=true

#### T5 性能报告与交付登记（1h）　· DONE

- [x] M4-performance-report.md 覆盖环境、数据、P95、EXPLAIN、索引实验、并发与异常
- [x] M4 证据 README 索引全部 JSON/日志
- [x] delivery.json / MANIFEST.md / CHECKLISTS.md 已登记 M4
- [x] check_delivery.py 为 FAIL 0 / WARN 0

### M5 集成与交付：干净环境、课程报告、贡献记录与提交包

- 状态：PARTIAL　预计：12h（视频待与组员共同完成）　目标：从发布包在独立目录与独立库复现双前端和后端，完成课程报告、演示数据说明、成员贡献记录与最终提交清单；视频延后

- [ ] 从发布包复制到独立目录，建立独立库，不复用源目录 node_modules
- [ ] 后端与两个前端依赖安装、构建、启动成功，两个前端 HTTP 200
- [ ] 真实 API 购票链路与管理统计通过，截图与 JSON 证据归档
- [ ] 课程报告覆盖需求、架构、数据库、事务、测试、性能、复现与限制
- [ ] 成员贡献记录按四组八人建立，姓名与比例待组员确认
- [ ] 发布包登记 M5 报告、证据、贡献记录与提交清单，包内检查 FAIL 0 / WARN 0
- [ ] 最终提交清单写明视频、官方通知、默认端口与报告格式等待办

#### T1 干净环境复现（5h）　· DONE

- [x] 139 文件复制到独立临时目录，不含 .git
- [x] ticketing_m5clean 导入后 16/3,630/594/1,751
- [x] server 126、web-user 33、web-admin 33 包安装成功
- [x] 两个前端 build 成功，API/health 与双前端 HTTP 200
- [x] order 595 PAID、ticket 1752 VALID、管理统计 16 场次

#### T2 课程报告（4h）　· DONE

- [x] 报告含摘要、背景、需求、架构、数据库、流程、一致性、安全
- [x] 报告含测试、性能、干净环境、限制、分工与结论
- [x] 关键数字与 M4 证据一致，不把计划值写成实测值

#### T3 成员贡献记录（1h）　· PARTIAL

- [ ] 四组八人角色与任务已列
- [ ] 姓名、学号、比例待组员填写并确认
- [ ] 比例合计 100% 的口径已写明

#### T4 交付登记与发布包（1h）　· DONE

- [x] delivery.json 登记 M5 四节点与模块
- [x] build_release.ps1 复制报告、贡献记录、清单与 M5 证据
- [x] 包内 check_delivery.py 为 FAIL 0 / WARN 0
- [x] Git 提交并记录最终 commit

#### T5 演示视频（0h）　· PENDING

- [ ] 与组员确定脚本、录制、剪辑、字幕
- [ ] 视频完成后登记链接或文件

#### T6 课程官方提交（0h）　· PENDING

- [ ] 取得课程正式通知，确认命名、平台、格式与截止时间
- [ ] 按通知导出 PDF/DOCX 或上传 GitHub

## 二、交付物验收

### API-SPEC · ACTIVE · docs/api-contract.md

- [x] 47 个端点编号连续，方法/路径/角色/错误码齐全；含 API-47 与 9.3 辅助
- [x] 端点组与 FR、AC 映射表覆盖全部端点
- [x] 金额整数分、UTC 时间、分页与幂等约定与 DDL 一致
- [x] 覆盖需求建议的 7 个业务错误码，并登记 ROLE_ALREADY_ASSIGNED / LAST_ADMIN
- [x] smoke.ps1、catalog_check.ps1 与 m3_check.ps1 的路径分别对齐对应 API
- [x] 字段名与 DDL 列名一致（name / event_name / coordinates / adjacent_group）

### CHECKFIELDS · ACTIVE · database/check_fields.py

- [x] 列数统计排除生成列
- [x] 17 张表逐表输出 OK
- [x] 结果与字典字段数一致

### CHECKLIST-M5 · ACTIVE · docs/submission-checklist.md

- [x] 逐项列出源代码、DDL、种子、README、双前端说明、ER/事务、SQL/计划、验收、报告、视频、贡献记录
- [x] 写明发布包检查命令与 FAIL/WARN 要求
- [x] 写明干净环境复现的独立库、依赖、构建、HTTP、购票与统计结果
- [x] 写明成员贡献、官方通知、视频、默认端口、报告格式等待确认项
- [x] 写明 GitHub 直传步骤与提交后核对项

### CHECKSCHEMA · ACTIVE · database/check_schema.py

- [x] sqlglot 解析 41 条语句无错
- [x] 17 表均含主键、22 个外键全部 RESTRICT
- [x] TIMESTAMPTZ 不应出现（存在则 FAIL）
- [x] 独立运行，失败 exit 1

### CONTRIB-M5 · ACTIVE · docs/member-contributions.md

- [x] 按四个小组列出 2+2+2+2 共 8 人
- [x] 每人有具体任务与对应交付证据
- [x] 贡献比例合计为 100%
- [x] 明确姓名、学号、比例需组员确认，不编造
- [x] 包含确认项与确认日期

### DDL · ACTIVE · database/schema.sql

- [x] 17 张表全部 InnoDB + utf8mb4_unicode_ci
- [x] 文件顶部设置严格模式 sql_mode
- [x] 所有外键 ON DELETE/UPDATE RESTRICT
- [x] 每表有主键；seats 唯一键包含 region
- [x] validate_db.py 34/34 通过
- [x] 会话时区固定为 +00:00，DATETIME(3) 按 UTC 存取

### DICT · ACTIVE · docs/database-design.md

- [x] 模块顺序为 1 实体清单、2 关系概述、3 数据字典
- [x] 17 张表字段数与 DDL 逐表一致（122 个业务字段）
- [x] 每个外键写成 xxx表.xxx 形式
- [x] 生成列与组合唯一约束行不计入字段数
- [x] 不出现 TIMESTAMPTZ 等 MySQL/MariaDB 不存在的类型

### EVID-ACCOV · ACTIVE · delivery/evidence/M5/ac-coverage.json

- [x] summary.total=17、passed=17、failed=0
- [x] 覆盖 8 条原先未验证、8 条部分覆盖 AC 与 P1 AC-25
- [x] AC-06 记录 attempts=100、success=1、conflict_409=99、http_5xx=0
- [x] AC-25 记录首推座位、预算不足为空、抢占后 409、整组成功 3 座 HELD
- [x] 保留 duration_ms 与失败时的 error 字段

### EVID-M4 · ACTIVE · delivery/evidence/M4/README.md

- [x] dataset-summary.json 记录 100/20,000/10,000 与三项自检
- [x] bench-baseline.json 每接口 500 样本、50 并发、全部 HTTP 200
- [x] explain-baseline.json 覆盖 Q-01/Q-02/Q-03
- [x] indexes-*.json 记录候选索引创建与删除恢复
- [x] reservation.json 为 50/50 HTTP 201、P95 ≤ 1,000 ms、50 个不同持有人
- [x] m4-anomalies.json 的 all_pass 为 true，AC-14/17/24 全 pass

### EVID-M5 · ACTIVE · delivery/evidence/M5/README.md

- [x] 写明发布包来源、commit、文件数与干净目录
- [x] 写明独立库 ticketing_m5clean 与导入计数
- [x] 写明依赖安装数、构建模块数与服务端口
- [x] 写明 /health、双前端 HTTP、登录、购票链路与管理统计结果
- [x] 索引 m5-clean-check.json、realtime-check.json、realtime-ui-check.json、ac-coverage.json、recommendation-ui-check.json 与六张截图
- [x] 说明替代端口原因与默认端口配置

### EVID-REC-UI · ACTIVE · delivery/evidence/M5/recommendation-ui-check.json

- [x] 记录 8082 页面、3300 API 与 ticketing_ac 库
- [x] 三张推荐卡均为同排、无通道、总价 HK$960
- [x] 选中 A-1-11/12 后显示 2 座、HK$960、not held notice
- [x] 搜索与选择前后 performance_id=1 的 HELD 均为 2、订单 0
- [x] 引用 05/06 两张截图并记录字节数

### REPORT-M4 · ACTIVE · docs/performance-report.md

- [x] 写明硬件、MariaDB 版本、InnoDB buffer pool、数据量、并发量、预热方式、样本数与失败率
- [x] Q-01/Q-02/Q-03/Q-04/Q-05 有平均、P50、P95、P99、目标值与判定
- [x] Q-01/Q-02/Q-03 有 EXPLAIN，索引实验有 baseline/tuned 对比和删除结论
- [x] 50 并发预留为 50/50 HTTP 201，P95 380.77 ms，无超卖
- [x] AC-14/17/24 全部 pass，并记录首次死锁与修复
- [x] 冷缓存 Q-03 2,868.73 ms 与 warm 559.67 ms 的差异已说明

### REPORT-M5 · ACTIVE · docs/course-report.md

- [x] 覆盖项目背景、需求范围、角色与关键业务规则
- [x] 覆盖三层架构、技术栈、目录结构与模块职责
- [x] 含静态系统结构图：双前端、Express API、MySQL 与 WebSocket 失效信号的数据流
- [x] 含数据库 ER 图，并覆盖 17 表、122 字段、关系、规范化、约束与索引
- [x] 含 Q-01 座位图、Q-02 管理端订单检索、Q-03 场次销售统计的代表性 SQL
- [x] 覆盖购票、支付、退款、核销、状态模型与事务边界
- [x] 覆盖 M1-M4 验收、并发、异常、P95、EXPLAIN 与索引实验
- [x] 覆盖 M5 干净环境步骤、结果、端口说明与已知限制
- [x] 含 Challenges/Lessons、References、GitHub 链接与视频/PDF 待补项
- [x] 引用真实证据文件，不把计划值写成实测值

### REQ · ACTIVE · docs/requirements-spec.md

- [x] 16 个二级章节齐全、编号连续
- [x] 第 9 节实体表 17 行，表名与 DDL 完全一致
- [x] 每个 P0 功能都有 AC 编号，可追溯到验收用例
- [x] 两个前端端口 8080/8081 与共用 API 3000 写明
- [x] 全文无“验票端”、sessions、payment_events 等旧命名

### SCRIPT-ACCOV · ACTIVE · scripts/ac_coverage_check.js

- [x] P0 16 条 + AC-25 共 17 条
- [x] 每条用例有独立 PASS/FAIL 与 evidence 字段
- [x] 失败不中断后续用例，最终写 JSON 并以非 0 退出
- [x] 默认不写演示库 ticketing_system
- [x] AC-06 100 并发断言 1 成功、其余 409、0 个 HTTP 5xx
- [x] AC-25 覆盖 2/4 人、预算、通道、停用/占用、不锁座、抢占后整组 409

### SCRIPT-CATALOG · ACTIVE · scripts/catalog_check.ps1

- [x] 覆盖 API-06~10 正常与错误路径
- [x] 期望值与 seed 分布一致（公开活动 7 / 非草稿场次 15 / 1 号场馆 200 座；演示种子总计 3 场馆 670 座）
- [x] API 未启动输出 SKIP exit 0，失败 exit 1

### SCRIPT-COMMON · ACTIVE · scripts/_common.ps1

- [x] 所有路径与端口只在 Cfg 一处定义
- [x] 只放函数，不放流程；三个脚本都 dot-source 它
- [x] 改 XAMPP 路径或库名时只改这里

### SCRIPT-COVERS · ACTIVE · scripts/generate_covers.py

- [x] 可重复运行覆盖输出
- [x] 输出目录为 web-user/public/media

### SCRIPT-DEV · ACTIVE · scripts/dev.ps1

- [x] 库未启动时自动拉起并等待端口就绪
- [x] 代码目录不存在时只 WARN 不 FAIL，T1 之前可安全运行
- [x] 各服务已在运行时跳过，不重复启动
- [x] 结束时打印三个 URL 与下一步命令

### SCRIPT-M1CHECK · ACTIVE · scripts/m1_check.ps1

- [x] 覆盖登录、建单、幂等复放、冲突、支付、出票、QR、取消释放、并发
- [x] API 未启动输出 SKIP exit 0
- [x] 任一断言失败 exit 1

### SCRIPT-M2CHECK · ACTIVE · scripts/m2_check.ps1

- [x] 45 条断言全通过
- [x] 验票成功/重复/越权三类覆盖
- [x] 退款成功/失败/重放/冲突四条覆盖
- [x] 批量与整区封座四条覆盖
- [x] 跑完 reset_demo 恢复干净种子

### SCRIPT-M3CHECK · ACTIVE · scripts/m3_check.ps1

- [x] 33 条断言全通过
- [x] 注册、重复账号、弱密码、403 边界覆盖
- [x] 授权/撤销立即生效与最后管理员保护覆盖
- [x] 退出后旧 token 401 与 token_version 递增覆盖
- [x] 跑完 reset_demo 恢复干净种子

### SCRIPT-M4ANOM · ACTIVE · scripts/m4_anomaly_check.js

- [x] AC-17 恰好 1 个 2xx、1 个 409、0 个 500，最终状态唯一
- [x] AC-24 旧票 VOID、新票 USED、新票仅 1 次核销、两订单保留
- [x] AC-14 重启后 payment SUCCEEDED、order PAID、notice APPLIED、仅 1 张票
- [x] 输出 m4-anomalies.json，all_pass=true
- [x] 3110 测试实例停止后由 finally 清理

### SCRIPT-M4BENCH · ACTIVE · scripts/m4_bench.js

- [x] 50 并发、每接口 500 样本、20 次预热
- [x] 覆盖 Q-01/Q-02/Q-03/Q-04/Q-05 等价 API
- [x] 输出 bench-*.json、explain-*.json、indexes-*.json、reservation.json
- [x] 候选索引可创建、可删除，恢复基线 20 个显式索引
- [x] 50 并发预留检查 201、pending、distinct holder、无超卖

### SCRIPT-M4DATA · ACTIVE · scripts/m4_scale_setup.js

- [x] 重复执行先 DROP 再按 schema.sql 重建
- [x] 只写 ticketing_bench，不改 ticketing_system
- [x] 生成 100 场次、20,000 场次座位、10,000 订单
- [x] 每场 available+held+sold+blocked=200
- [x] 订单金额与明细合计不一致为 0，已支付订单无票为 0
- [x] 输出 dataset-summary.json

### SCRIPT-PERF · ACTIVE · scripts/perf_smoke.ps1

- [x] 覆盖活动列表、座位图、我的订单、后台订单、后台统计
- [x] 只记录 min/median/max，不冒充 P95
- [x] API 未监听时明确报错
- [x] 完整 EXPLAIN 与并发压测留给 M4

### SCRIPT-REALTIME · ACTIVE · scripts/realtime_check.js

- [x] 输出 delivery/evidence/M5/realtime-check.json
- [x] 订单与取消事件的 order_id/performance_id 正确
- [x] 失败时非零退出；结束取消测试订单

### SCRIPT-RECONCHECK · ACTIVE · scripts/recon_auto_check.ps1

- [x] 不调用手动触发接口
- [x] 10s 内自动将 PENDING 重放为 SUCCEEDED
- [x] 检查管理端状态卡 pending/processed/failed
- [x] 结束时关闭辅助 API，不残留进程

### SCRIPT-RESET · ACTIVE · scripts/reset_demo.ps1

- [x] -DryRun 只打印计划，不改数据
- [x] 执行后表数为 17、orders 为 594
- [x] verify_seed.py 13/13 通过
- [x] 重复执行两次结果一致，不残留旧行

### SCRIPT-SMOKE · ACTIVE · scripts/smoke.ps1

- [x] API 未启动时输出 SKIP 并 exit 0
- [x] 断言覆盖 health、正确登录、错误密码、无 token 四条
- [x] 任一断言失败 exit 1 并列出失败项
- [x] T1 路径变更只改 $Paths 一处

### SCRIPTS-README · ACTIVE · scripts/README.md

- [x] 四条常用命令可直接复制执行
- [x] 写明 DROP 只影响 ticketing_system
- [x] 写明 P13 核销窗口需重导重置

### SEED · ACTIVE · database/seed.sql

- [x] 可重复导入，无外键或 CHECK 报错
- [x] 覆盖售罄、可退、核销中、已结束、草稿、暂停六类状态
- [x] 订单总额等于明细之和；每个 SOLD 座位恰好一张票
- [x] verify_seed.py 13/13 通过
- [x] 导入后各表时间戳为 UTC（NOW() 在 +00:00 会话下取值）

### SEEDGEN · ACTIVE · database/build_seed.py

- [x] seed.sql 只由本脚本生成，不手工编辑
- [x] 固定随机种子，重复生成的业务数据一致
- [x] 重新生成的 seed 能一次导入成功

### SRV-APP · ACTIVE · server/src/app.js

- [x] request_id 在 body 解析之前生效，解析失败也带 request_id
- [x] 未知路由返回统一包 404 NOT_FOUND
- [x] 异常统一为 500 INTERNAL，不返回堆栈

### SRV-AUTH-MW · ACTIVE · server/src/middleware/auth.js

- [x] 缺 token、坏 token 均返回 401 UNAUTHORIZED
- [x] 角色不命中返回 403 FORBIDDEN，不泄露资源是否存在
- [x] optionalAuth 对坏 token 不报 401，只按匿名处理
- [x] token_version 不匹配的旧 token 返回 401
- [x] 授权/撤销角色无需重新登录，下一次请求立即生效

### SRV-CONFIG · ACTIVE · server/src/config.js

- [x] 默认值与 XAMPP 本地环境一致
- [x] 生产环境使用默认 JWT 密钥时拒绝启动

### SRV-DB · ACTIVE · server/src/db.js

- [x] 连接建立后 sql_mode 含 STRICT_ALL_TABLES
- [x] SELECT 1 可用，连接失败不阻塞启动

### SRV-HTTP · ACTIVE · server/src/lib/http.js

- [x] 成功包为 {code:OK,message,data,request_id}
- [x] 失败包含 code/message/request_id，HTTP 状态与错误码匹配

### SRV-LIB-AUDIT · ACTIVE · server/src/lib/audit.js

- [x] writeAudit 兼容事务连接与普通 query
- [x] audit_logs.request_id 必填
- [x] 审计失败不得吞掉主事务异常

### SRV-LIB-BODY · ACTIVE · server/src/lib/body.js

- [x] requireInt / requireString / requireArray 失败抛 400
- [x] Idempotency-Key 缺失或超过 100 字符拒绝
- [x] 不信任客户端价格字段

### SRV-LIB-FORMAT · ACTIVE · server/src/lib/format.js

- [x] order_no 为 TIX-YYYYMMDD-######（HKT 日期 + order_id 补零）
- [x] seat_label 为 区域-排-座
- [x] 金额以整数分输出，时间为 ISO UTC

### SRV-LIB-PARAMS · ACTIVE · server/src/lib/params.js

- [x] page/page_size 上限 100，非法值 400 VALIDATION_ERROR
- [x] 日期须为真实存在的 YYYY-MM-DD
- [x] 空参数按默认值处理，不抛异常

### SRV-PKG · ACTIVE · server/package.json

- [x] npm install 后无缺失依赖，Node 20+ 可启动
- [x] start 与 dev 两个脚本可直接运行

### SRV-README · ACTIVE · server/README.md

- [x] 安装启动步骤可从零复制执行
- [x] 已实现端点与契约编号一致

### SRV-REALTIME · ACTIVE · server/src/realtime.js

- [x] 连接后发送 connected；successful mutation 后广播 type/at/path 及可选 order_id/performance_id
- [x] 广播帧不含金额、用户、座位或 token
- [x] 非本地 Origin 在握手阶段 403

### SRV-REALTIME-SCOPE · ACTIVE · server/src/realtime-scope.js

- [x] 只接受整数 ID，不接受对象或字符串
- [x] 下单、支付、退款确认写入正确 order_id/performance_id
- [x] 解析失败不阻塞原响应，广播退化

### SRV-ROUTES-ADMIN · ACTIVE · server/src/routes/admin.js

- [x] ADMIN-only 与 CHECKER_OR_ADMIN 分离
- [x] 验票强制 Idempotency-Key
- [x] buyer/checker 越权均 403

### SRV-ROUTES-AUTH · ACTIVE · server/src/routes/auth.js

- [x] 登录返回 token、token_type、expires_in、user.roles
- [x] 缺字段与非法 JSON 返回 400 VALIDATION_ERROR

### SRV-ROUTES-EVENTS · ACTIVE · server/src/routes/events.js

- [x] GET /events 与 /events/:id 与契约路径一致
- [x] keyword 长度限制 100，分页走公共校验

### SRV-ROUTES-HEALTH · ACTIVE · server/src/routes/health.js

- [x] db 正常返回 200 且 db:ok
- [x] db 不可用返回 503 SERVICE_UNAVAILABLE

### SRV-ROUTES-ORDERS · ACTIVE · server/src/routes/orders.js

- [x] POST /orders 强制 Idempotency-Key
- [x] GET /orders 仅本人
- [x] 详情本人或 ADMIN，其余 403

### SRV-ROUTES-PAYMENTS · ACTIVE · server/src/routes/payments.js

- [x] /payments/notify 不经过用户 JWT，改用 HMAC
- [x] simulate 仅 test 模式
- [x] 参数错误统一 400

### SRV-ROUTES-PERF · ACTIVE · server/src/routes/performances.js

- [x] sales_status 只接受 all/on_sale/paused/closed
- [x] 日期倒置返回 400
- [x] 座位图公开，坏 token 不拦截
- [x] seats 与 seat-recommendations 路由定义在 /:id 之前
- [x] 推荐参数 party_size 2–4、region 必填、budget_cents 可选整数

### SRV-ROUTES-TICKETS · ACTIVE · server/src/routes/tickets.js

- [x] 列表/详情需登录
- [x] QR PNG 以二进制返回，Content-Type image/png
- [x] 无权限返回 403

### SRV-SERVICE-ADMIN · ACTIVE · server/src/services/admin.js

- [x] M2 服务全部 node --check 通过
- [x] 活动/场次 CRUD 与发布/暂停/恢复实测
- [x] 批量与整区封座只改 AVAILABLE/BLOCKED
- [x] 统计与订单查询口径统一

### SRV-SERVICE-AUTH · ACTIVE · server/src/services/auth.js

- [x] bcrypt 校验兼容 Python 端生成的 $2b$ 哈希
- [x] 账号不存在与密码错误同码同文案
- [x] 角色为 USER 加 ADMIN/CHECKER 授权集合
- [x] logout 在事务内递增 users.token_version 并写 AUTH_LOGOUT 审计

### SRV-SERVICE-CATALOG · ACTIVE · server/src/services/catalog.js

- [x] 全部查询参数化，无字符串拼接 SQL
- [x] 草稿活动与草稿场次对外 404
- [x] 金额整数分、时间 UTC ISO 输出
- [x] 只读接口不写库，座位状态原样返回

### SRV-SERVICE-ORDERS · ACTIVE · server/src/services/orders.js

- [x] 同键同 hash 返回原单；不同 hash 409 且不落库
- [x] 整组锁座，任一不可用整单回滚
- [x] expires_at = min(创建+5 分钟, 售票截止)
- [x] 取消/到期释放 HELD 并清空 holder
- [x] 并发抢同一座位仅 1 单成功

### SRV-SERVICE-PAYMENTS · ACTIVE · server/src/services/payments.js

- [x] createPayment 全事务，失败无半成品 attempt
- [x] 重复 SUCCESS 不重复出票
- [x] 通知金额/币种/订单号不符落 REJECTED 并 409
- [x] 过期到账转 EXPIRED + PENDING 退款
- [x] 票码仅存 SHA-256 哈希

### SRV-SERVICE-RECOMMEND · ACTIVE · server/src/services/seat-recommendations.js

- [x] 人数仅 2–4，区域必填，预算只作为上限
- [x] 同一 adjacent_group 且座位号连续，不跨 layout.aisles
- [x] 只考虑 AVAILABLE，不拆散座位、不提高预算
- [x] 推荐不写 session_seats，无结果返回空数组

### SRV-SERVICE-RECON · ACTIVE · server/src/services/reconciliation.js

- [x] 默认 300s / 50 条 / 120s 龄期，可环境变量覆盖
- [x] 单飞锁避免并发重放
- [x] 无 payload_json 的旧 PENDING 标 IGNORED
- [x] 仍失败标 FAILED，不吞异常
- [x] status 返回 pending / processed_24h / failed_24h / last_run_at

### SRV-SERVICE-REFUNDS · ACTIVE · server/src/services/refunds.js

- [x] 同键重放返回同一 refund_id
- [x] 二次新键 409 REFUND_NOT_ALLOWED
- [x] 订单与全部票同事务转退款中
- [x] SUCCEEDED 订单 REFUNDED、票 VOID、座位 AVAILABLE
- [x] FAILED 订单 PAID、票 VALID、座位保持 SOLD
- [x] 同结果重放 replayed，异结果 409 REFUND_ALREADY_RESOLVED
- [x] 迟到付款 EXPIRED 订单只改退款状态

### SRV-SERVICE-TICKETS · ACTIVE · server/src/services/tickets.js

- [x] 票据列表按签发时间倒序、分页
- [x] qr_token 60 秒有效且不可改状态
- [x] QR PNG 320px、no-store
- [x] 核销信息联 checkins 与 checker 显示名

### SRV-SERVICE-USERS · ACTIVE · server/src/services/users.js

- [x] listUsers 支持 keyword/role/page/pageSize 并返回有效授权
- [x] CHECKER 必填场次，ADMIN 不允许场次
- [x] 重复授权 409 ROLE_ALREADY_ASSIGNED
- [x] 撤销只置 revoked_at，下一次请求立即 403
- [x] 最后一个有效 ADMIN 不可撤销，返回 409 LAST_ADMIN

### VERIFYDB · ACTIVE · database/validate_db.py

- [x] 不依赖未提交文件，可独立运行
- [x] 覆盖 NOT NULL、CHECK、UNIQUE、FK 与 token_version 五类约束
- [x] 失败时 exit code 非 0

### VERIFYPWD · ACTIVE · database/verify_password.py

- [x] 34 个演示账号全部 PASS
- [x] 统一密码 Demo@1234 可从数据库哈希验证

### VERIFYSEED · ACTIVE · database/verify_seed.py

- [x] 13 条不变量全部 PASS
- [x] 覆盖金额、库存、票、核销、退款、权限六类
- [x] 失败时 exit code 非 0

### WEB-ADMIN · ACTIVE · web-admin/README.md

- [x] Dashboard/Events/Performances/Check-in/Orders/Finance/Users 可访问
- [x] Performances 可单座、多选和整区封锁/恢复，HELD/SOLD 不可选
- [x] Finance 可对退款标记成功/失败并显示自动对账状态
- [x] Users 可搜索、筛选、授予/撤销 ADMIN 或 CHECKER 场次授权
- [x] 管理端与用户端 token 隔离
- [x] build 成功且无 console 报错

### WEB-ADMIN-LIVEREFRESH · ACTIVE · web-admin/src/liveRefresh.js

- [x] 300 ms 防抖、500 ms 最短间隔、500 ms 最大等待
- [x] 单请求在飞；隐藏暂停；回前台补一次

### WEB-ADMIN-REALTIME · ACTIVE · web-admin/src/realtime.js

- [x] API_BASE 的 http 替换为 ws
- [x] 组件卸载时关闭 socket 与重连定时器

### WEB-ADMIN-USERS · ACTIVE · web-admin/src/views/UsersView.vue

- [x] ADMIN 可搜索账号/姓名并按角色筛选
- [x] CHECKER 授权必须选择场次
- [x] Grant role 与 Revoke 均有确认/反馈
- [x] 最后管理员撤销失败显示 409 文案
- [x] 无摄像头或扫码依赖

### WEB-USER-API · ACTIVE · web-user/src/api.js

- [x] 统一 ApiError 与 401 事件
- [x] createOrder 自动生成 Idempotency-Key
- [x] QR 以带 Authorization 的 blob 获取

### WEB-USER-APP · ACTIVE · web-user/src/App.vue

- [x] Events / My orders / My tickets 导航可用
- [x] 未登录显示 Sign in，已登录显示用户名与 Sign out

### WEB-USER-AUTH · ACTIVE · web-user/src/auth.js

- [x] 登录后刷新不掉线
- [x] 退出清 token 与 user

### WEB-USER-CONFIG · ACTIVE · web-user/vite.config.js

- [x] host 127.0.0.1、port 8080、strictPort
- [x] Vue 插件已注册

### WEB-USER-COVERS · ACTIVE · web-user/public/media/README.md

- [x] 8 个活动各一张，文件名与 seed 对应
- [x] 不含中文，标题单行不溢出

### WEB-USER-ENTRY · ACTIVE · web-user/src/main.js

- [x] 挂载 router
- [x] 监听 stagepass:unauthorized 并清会话

### WEB-USER-LIVEREFRESH · ACTIVE · web-user/src/liveRefresh.js

- [x] 突发事件合并；同一时刻最多一个刷新
- [x] 隐藏时不请求，回前台补一次
- [x] 暂停/恢复不丢失待刷新标记

### WEB-USER-PKG · ACTIVE · web-user/package.json

- [x] npm run serve 固定 8080 strictPort
- [x] vue / vue-router / vite 版本锁定
- [x] build 可产出静态包

### WEB-USER-README · ACTIVE · web-user/README.md

- [x] 从零启动步骤可复制执行
- [x] 写清 8080、VITE_API_BASE 与 Demo@1234
- [x] 注明 Vue 3 + Vite 与课程模板 Vue 2 的差异

### WEB-USER-REALTIME · ACTIVE · web-user/src/realtime.js

- [x] API_BASE 的 http 替换为 ws
- [x] 组件卸载时关闭 socket 与重连定时器

### WEB-USER-ROUTER · ACTIVE · web-user/src/router.js

- [x] 活动/场次/座位公开
- [x] 订单/票据需登录且带 redirect
- [x] 未匹配路由 404 组件

### WEB-USER-STYLES · ACTIVE · web-user/src/styles.css

- [x] 座位 available/selected/held/sold/blocked 颜色可区分
- [x] 窄屏无横向溢出
- [x] 主内容淡入不依赖 opacity 终态（截图与后台标签页可见）

### WEB-USER-VIEWS · ACTIVE · web-user/src/views/README.md

- [x] 登录→选座→下单→支付→票据全链路可点通
- [x] 支付成功 1.4 秒自动跳票据钱包
- [x] 支付失败留在结算页可重试
- [x] 选座跨登录恢复，不可用座位被过滤

