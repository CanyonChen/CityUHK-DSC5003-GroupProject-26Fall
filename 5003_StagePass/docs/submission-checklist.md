# M5 最终提交清单

产品名称：StagePass（中文沟通名：舞台通行）

版本：v1.10（2026-11-23）

## 1. 交付状态总览

| 交付项 | 状态 | 位置 / 说明 |
|---|---|---|
| 应用源代码 | 完成 | `server/`、`web-user/`、`web-admin/` |
| DDL、索引与约束 | 完成 | `database/schema.sql` |
| 演示种子 | 完成 | `database/seed.sql`，演示数据 |
| 规模数据生成脚本 | 完成 | `scripts/m4_scale_setup.js` |
| 运行配置示例 | 完成 | `server/.env.example`、`web-user` / `web-admin` 的 `VITE_API_BASE` |
| README（启动/账号/测试/限制） | 完成 | 发布包根 `README.md` |
| 双前端构建与启动说明 | 完成 | README“快速开始”；默认 8080/8081/API 3000 |
| ER 图、关系模式、规范化 | 完成 | 课程报告 §4.3 与 `docs/ER-diagram.png`；字段级说明见 `docs/database-design.md` |
| 状态转换与事务边界 | 完成 | `docs/requirements-spec.md` 第 7–8 节；课程报告第 5–6 节 |
| 代表性 SQL、执行计划、索引实验 | 完成 | 课程报告附录 A 的 Q-01–Q-03；`docs/performance-report.md`、`delivery/evidence/M4/` |
| 验收、并发、异常记录 | 完成；P0 的 AC-01–AC-24 与 P1 的 AC-25/AC-26 均有可复现证据 | `delivery/evidence/M1`–`M4`、`M5/m5-clean-check.json`、`M5/realtime-check.json`、`M5/ac-coverage.json`、`M5/recommendation-ui-check.json`、`M5/region-occupancy.json`；`scripts/ac_coverage_check.js`；`docs/course-report.md` §8.2–8.3 |
| P0/P1 AC 缺口补测 | 完成，17/17 PASS | 独立库 `ticketing_ac` + API 3300；覆盖 P0 16 条 + AC-25；AC-06 100 并发 0 个 5xx；AC-25 含通道/停用/占用/预算/不锁座/抢占后整组 409 |
| 多人连座推荐 | 完成，API-47 + 用户端面板 | `server/src/services/seat-recommendations.js`、`routes/performances.js`、`web-user/src/views/SeatMapView.vue`；只读推荐，下单整组原子重检 |
| 各区域上座率 | 完成，API-48 + 管理端 Dashboard | `server/src/services/admin.js` 的 `regionOccupancy`、`routes/admin.js`、`web-admin/src/views/DashboardView.vue`；按场次/区域显示总座位、可售、成交、核销、上座率与入场率；`M5/region-occupancy.json`、`07-admin-regional-occupancy.png` |
| R1 实时刷新 | 完成，8/8 + 调度器单测 + UI 实测 | `server/src/realtime.js`、`server/src/realtime-scope.js`、两个前端 `src/realtime.js` 与 `src/liveRefresh.js`、`scripts/realtime_check.js`；AC-26 |
| 课程报告 | 内容完成，PDF 待导出 | `docs/course-report.md`（v1.10，含 Group Information/Contribution Statement 表、ER 图、Q-01–Q-06 功能证据、Track 1 证据地图与 Q-01–Q-07 覆盖表）；PDF 需按 brief 命名 `XXXX-report.pdf` |
| 课程报告 PDF | 待导出 | 由 `docs/course-report.md` 导出；导出前确认系统结构图 `docs/system-architecture.png` 已嵌入 |
| 演示数据 | 完成 | `database/seed.sql`；导入计数见 M5 证据 |
| 成员贡献记录 | 已生成，待签字确认 | `docs/member-contributions.md` 与 `docs/team-roster.md`；8 人姓名/学号/邮箱/分工已填，比例均分 12.5%；报告开头表已同步 |
| 演示视频 | 待与组员共同完成 | 按用户要求延后；完成后把可访问链接写入报告 §16 与提交清单 |
| GitHub 代码仓库 | 已上传旧版，Q-06 差异待补传 | <https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>；`Ft-Hawk-patch-1` 远端仍为 170 个 StagePass 文件、M5 文档 v1.8；本地包为 172 个文件、文档 v1.10；`main`/根目录仍为 FilmSys 旧基线 |
| 课程官方要求 | 已取得 brief | 报告 PDF `XXXX-report.pdf`、GitHub repo、5–8 分钟视频；提交平台/仓库命名/截止时间以课程通知为准 |

## 2. 发布包检查

发布包目录：`delivery/5003_StagePass`

当前发布包：172 个文件（约 3.83 MiB）；提交前如再改文件，需重新核对文件数并刷新本清单。

提交前在包内执行：

```powershell
cd delivery
python check_delivery.py
```

要求：`FAIL 0 / WARN 0`。当前包内检查为 FAIL 0 / WARN 0；源目录检查同为 FAIL 0 / WARN 0，历史归档文件只显示 INFO。

再检查：

```powershell
git status --short          # 应为空
git log -1 --oneline        # 记录最终 commit
Get-ChildItem -Recurse -File | Measure-Object | Select-Object Count
```

## 3. 干净环境验收（R1 限制版前基线）

| 检查 | 结果 |
|---|---|
| 从发布包复制到临时目录 | 139 个文件（R1 限制版前历史基线；当前包为 172，提交前需重跑一次） |
| 独立数据库 `ticketing_m5clean` | 16 场次 / 3,630 场次座位 / 594 订单 / 1,751 票 |
| 后端依赖 | 126 packages |
| 用户端依赖 + 构建 | 33 packages；38 modules，673 ms（R1 限制版前基线；最终构建 40 modules） |
| 管理端依赖 + 构建 | 33 packages；37 modules，722 ms（R1 限制版前基线；最终构建 39 modules） |
| API `/health` | `status=ok, db=ok` |
| 用户端 8180 | HTTP 200 |
| 管理端 8181 | HTTP 200 |
| 真实购票 | order 595 PAID；ticket 1752 VALID；A-1-1 |
| 管理统计 | 16 场次；sold 1,752；net 61,177,000 分 |
| 截图 | `evidence/M5/01-user-events.png`、`02-admin-login.png`、`03-admin-live.png`、`04-admin-live-before.png`、`07-admin-regional-occupancy.png` |
| R1 实时刷新 | `realtime_check.js` 8/8；订单/取消事件带正确 `order_id`/`performance_id`；调度器单测 4 次刷新/最大并发 1、隐藏 0/回前台 1、暂停 0/恢复 1；管理端未点 Refresh，外部支付后 Gross/Tickets/Seats 自动更新 |
| AC-25 连座推荐 | `ac_coverage_check.js --all` 17/17；独立库 `ticketing_ac` + API 3300；用户端生产构建在 8082 实测，搜索与选中前后 HELD 不变 |
| Q-06 区域上座率 | API-48 实测场次 1（200 座）：A 区 30/78=38.46%、B 区 26/59=44.07%、C 区 25/59=42.37%，合计 81/196=41.33%；管理端 8085 生产构建实测，与直接 SQL 聚合一致 |

端口说明：干净环境使用 3200/8180/8181，因为默认端口被演示实例占用。提交到空机器时可直接使用 3000/8080/8081；README 的默认配置未改。

该表记录 R1 限制版之前的一次干净环境复现，用于证明发布包可独立安装与启动；R1 限制版新增的 `realtime-scope.js`、`liveRefresh.js` 与节流逻辑已在演示实例上完成构建、服务端 8/8 与 UI 实测，但未重跑整轮临时目录安装。提交前若课程要求完整复现，应按第 4 节第 4 条在空机器重跑一次。

## 4. 提交前必须人工确认

1. **成员贡献记录**：8 位成员姓名、学号、邮箱、分工已填入，比例均分 12.5%，合计 100%；由全体成员在 `docs/member-contributions.md` 与报告开头表确认。
2. **课程官方要求**：brief 已取得，报告必须是 PDF（`XXXX-report.pdf`）、代码必须有 GitHub repo、视频 5–8 分钟且链接写进报告；待确认的是提交平台、仓库命名和截止时间。
3. **演示视频**：与组员确定脚本、录制、剪辑和字幕；视频完成后把链接或文件放入提交包，并在报告/README/清单登记。
4. **默认端口可选验收**：如课程要求必须用 3000/8080/8081 演示，先在空机器或停止占用的演示实例后重跑一次 M5 干净环境。
5. **报告格式**：用 `docs/course-report.md` 导出 PDF，文件名按 brief 使用 `XXXX-report.pdf`；导出后检查中文字体、表格、分页，以及 `system-architecture.png` 是否正常显示。
6. **GitHub 结构**：仓库地址为 <https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>。远端 `Ft-Hawk-patch-1` 仍为 170 个 StagePass 文件、M5 文档 v1.8；本地包为 172 个文件、文档 v1.10。提交前需补传 Q-06 代码与证据，并把 StagePass 合并到 `main`/根目录，或明确使用 StagePass 分支链接；不要提交 `.env`、`node_modules`、日志。

## 5. 建议提交物结构

```text
5003_StagePass/
├─ README.md
├─ Start-StagePass.bat
├─ Reset-StagePass.bat
├─ docs/
│  ├─ local-run-guide.md
│  ├─ requirements-spec.md
│  ├─ database-design.md
│  ├─ api-contract.md
│  ├─ performance-report.md
│  ├─ course-report.md
│  ├─ member-contributions.md
│  ├─ team-roster.md
│  └─ submission-checklist.md
├─ database/
├─ server/
├─ web-user/
├─ web-admin/
├─ scripts/
└─ delivery/
   ├─ delivery.json
   ├─ MANIFEST.md
   ├─ CHECKLISTS.md
   └─ evidence/
      ├─ M1/
      ├─ M2/
      ├─ M3/
      ├─ M4/
      └─ M5/
```

如课程要求把报告、ER 图、数据库设计 Word 单独提交，则从 `DB/` 与 `docs/` 取对应文件，不要混入源码仓库的无关归档。

## 6. GitHub 上传现状（结构待整理）

- 仓库：<https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>
- `Ft-Hawk-patch-1`：远端为 170 个 StagePass 文件，位于 `5003_StagePass/` 子目录；M5 文档为 v1.8，Q-06 代码与证据待补传。`server/.env.example` 与 `server/.gitignore` 已补。
- `main`：仍是 FilmSys 旧基线，248 个文件，0 个 StagePass 文件。
- 仓库根 `README.md` 仍是旧“Show 票务系统”，不是 StagePass 的 README。
- 本轮新增 `docs/team-roster.md`，并修改 `docs/course-report.md`、`docs/member-contributions.md`、`docs/submission-checklist.md`；这些尚未上传。

最终提交前需要选择一种结构：

1. **保留现有仓库**：把 `Ft-Hawk-patch-1` 合并到 `main`，将 `5003_StagePass/` 内容移到根目录，替换根 README，清理旧 `show/`、`show_admin/`、`show_api/`、`db_show.sql`。
2. **新建空仓库**：把 172 个文件按顶层目录分批上传到根目录，避免继承旧 FilmSys 内容。

在结构整理完成前，报告 §16 的仓库链接可能打开到旧项目；提交时至少要把链接指向包含 StagePass 的分支。

## 7. 剩余风险

- 课程 brief 已取得；仍待确认的是提交平台、仓库命名和截止时间。
- GitHub 根目录仍是 FilmSys 旧基线；`main` 没有 StagePass，结构需在提交前整理。
- 8 人姓名、学号、邮箱、分工和 12.5% 均分已填；报告 PDF 与演示视频仍待完成。
- 视频未录制；报告 PDF 未导出。
- 干净环境未做登录后的浏览器交互截图；API 与 M1–M4 UI 证据已覆盖核心流程。
- 默认端口未在本次干净环境使用；构建与启动配置本身支持默认端口。

