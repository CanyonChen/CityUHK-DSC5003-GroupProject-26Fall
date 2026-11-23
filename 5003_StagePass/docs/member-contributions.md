# 成员贡献记录

版本：v1.1（2026-11-23）

> 本表按 StagePass 的实际交付模块归口，8 位成员平均分配，每人 12.5%，合计 100%。姓名、学号、邮箱取自 `TeamForming.docx`；分工按会议纪要与当前模块整理。名单只保留姓名、学号、邮箱、分工，不列本科专业等扩展字段。

## 1. 分工与模块责任

| 小组 | 人数 | 主要责任 | 对应成员 |
|---|---:|---|---|
| 数据库组 | 2 | 数据模型、ER、关系模式、规范化、DDL、索引、种子与校验 | Xiang LI、Mengqi YAN |
| 前端组 | 2 | 用户购票端、管理端、页面交互与实时刷新 UI | Canyang CHEN、Geyunqing SHI |
| 后端组 | 3 | 认证权限、活动/场次、订单库存、支付票据、退款对账 | Mingxi Zhu、Zijiu HE、Zixuan YAO |
| 扩展功能组 | 1 | R1 实时刷新、AC-25 连座推荐、M4/M5 验收集成 | Songhao ZANG |

## 2. 成员明细

| 序号 | 姓名 | 学号 | 邮箱 | 小组 | 具体任务 | 交付证据 | 贡献比例 | 本人确认 |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Songhao ZANG | 59942743 | szang5-c@my.cityu.edu.hk | 扩展功能组 | R1 实时刷新失效信号、AC-25 连座推荐、M4/M5 验收集成 | `server/src/realtime.js`、`realtime-scope.js`、`seat-recommendations.js`、`scripts/realtime_check.js`、`scripts/ac_coverage_check.js` | 12.5% | [ ] |
| 2 | Zijiu HE | 60961160 | zjjiuhe2-c@my.cityu.edu.hk | 后端组 | 选座预留、订单创建/取消/过期释放、幂等与并发控制 | `server/src/services/orders.js`、`scripts/m1_check.ps1`、`scripts/m4_bench.js`、M4 并发证据 | 12.5% | [ ] |
| 3 | Zixuan YAO | 60922041 | zixuanyao4-c@my.cityu.edu.hk | 后端组 | 测试支付、通知幂等、自动对账、电子票、退款、核销 | `payments.js`、`tickets.js`、`refunds.js`、`reconciliation.js`、`scripts/recon_auto_check.ps1`、`scripts/m4_anomaly_check.js` | 12.5% | [ ] |
| 4 | Canyang CHEN | 60775208 | canyachen2-c@my.cityu.edu.hk | 前端组 | 用户端活动、详情、选座、结算、订单、票夹、退票与移动端适配 | `web-user/`、M1/M2 截图 | 12.5% | [ ] |
| 5 | Mingxi Zhu | 60920926 | mingxizhu4-c@my.cityu.edu.hk | 后端组 | 登录注册、JWT/角色权限、活动/场次/管理统计 API | `server/src/routes/auth.js`、`services/auth.js`、`services/users.js`、`services/catalog.js`、`services/admin.js`、`docs/api-contract.md` | 12.5% | [ ] |
| 6 | Geyunqing SHI | 61028298 | geyunqshi2-c@my.cityu.edu.hk | 前端组 | 管理端 Dashboard、活动、场次、订单、财务、用户、核销与实时刷新 UI | `web-admin/`、`src/liveRefresh.js`、M2/M3 截图 | 12.5% | [ ] |
| 7 | Xiang LI | 61063878 | xli3487-c@my.cityu.edu.hk | 数据库组 | 需求到 ER、关系模式、规范化、数据库设计文档与报告数据库章节 | `docs/database-design.md`、`docs/ER-diagram.png`、报告 §4 | 12.5% | [ ] |
| 8 | Mengqi YAN | 60363933 | mengqiyan5-c@my.cityu.edu.hk | 数据库组 | DDL、索引与约束、演示种子、字段/库校验、查询与索引实验支持 | `database/schema.sql`、`database/seed.sql`、`database/*.py`、`delivery/evidence/M4/` | 12.5% | [ ] |
|  | **合计** |  |  |  |  |  | **100%** |  |

## 3. 比例与确认口径

1. 8 人均分，每人 12.5%，合计 100%；不按代码行数计算。
2. 本表按交付模块归口；如组内实际投入与任务描述有差异，只调整任务描述，比例仍按均分执行。
3. 每位成员在“本人确认”栏勾选；组长汇总后填写确认日期。
4. 报告开头的 Group Information/Contribution Statement 表与本表保持一致。

## 4. 组员确认

| 确认项 | 结果 |
|---|---|
| 8 位成员姓名、学号、邮箱已核对 | [ ] |
| 每人具体任务与证据文件对应 | [ ] |
| 贡献比例合计 100% | [ ] |
| 全体成员无异议 | [ ] |
| 确认日期 | [待填写] |
