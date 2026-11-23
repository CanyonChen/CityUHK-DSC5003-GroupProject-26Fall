# M5 最终提交清单

产品名称：StagePass（中文沟通名：舞台通行）

版本：v1.7（2026-11-23）

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
| 验收、并发、异常记录 | 完成；P0 的 AC-01–AC-24 与 P1 的 AC-25/AC-26 均有可复现证据 | `delivery/evidence/M1`–`M4`、`M5/m5-clean-check.json`、`M5/realtime-check.json`、`M5/ac-coverage.json`、`M5/recommendation-ui-check.json`；`scripts/ac_coverage_check.js`；`docs/course-report.md` §8.2–8.3 |
| P0/P1 AC 缺口补测 | 完成，17/17 PASS | 独立库 `ticketing_ac` + API 3300；覆盖 P0 16 条 + AC-25；AC-06 100 并发 0 个 5xx；AC-25 含通道/停用/占用/预算/不锁座/抢占后整组 409 |
| 多人连座推荐 | 完成，API-47 + 用户端面板 | `server/src/services/seat-recommendations.js`、`routes/performances.js`、`web-user/src/views/SeatMapView.vue`；只读推荐，下单整组原子重检 |
| R1 实时刷新 | 完成，8/8 + 调度器单测 + UI 实测 | `server/src/realtime.js`、`server/src/realtime-scope.js`、两个前端 `src/realtime.js` 与 `src/liveRefresh.js`、`scripts/realtime_check.js`；AC-26 |
| 课程报告 | 内容完成，PDF 待导出 | `docs/course-report.md`（v1.7，含 Group Information/Contribution Statement 表、ER 图、Q-01–Q-03、Track 1 证据地图与 Q-01–Q-07 覆盖表）；PDF 需按 brief 命名 `XXXX-report.pdf` |
| 课程报告 PDF | 待导出 | 由 `docs/course-report.md` 导出；导出前确认系统结构图 `docs/system-architecture.png` 已嵌入、成员信息已填 |
| 演示数据 | 完成 | `database/seed.sql`；导入计数见 M5 证据 |
| 成员贡献记录 | 待组员确认 | `docs/member-contributions.md`，姓名/学号/比例待填；报告开头的 Group Information/Contribution Statement 表也需同步 |
| 演示视频 | 待与组员共同完成 | 按用户要求延后；完成后把可访问链接写入报告 §16 与提交清单 |
| GitHub 代码仓库 | 已提供 | <https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>；需确认 `main` 分支包含当前发布包内容 |
| 课程官方要求 | 已取得 brief | 报告 PDF `XXXX-report.pdf`、GitHub repo、5–8 分钟视频；提交平台/仓库命名/截止时间以课程通知为准 |

## 2. 发布包检查

发布包目录：`delivery/5003_StagePass`

当前发布包：169 个文件（约 3.73 MiB）；最终 commit 以包内 `git log -1 --oneline` 为准。提交前如再改文件，需重新 commit 并核对文件数。

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
| 从发布包复制到临时目录 | 139 个文件，不含 `.git` |
| 独立数据库 `ticketing_m5clean` | 16 场次 / 3,630 场次座位 / 594 订单 / 1,751 票 |
| 后端依赖 | 126 packages |
| 用户端依赖 + 构建 | 33 packages；38 modules，673 ms（R1 限制版前基线；最终构建 40 modules） |
| 管理端依赖 + 构建 | 33 packages；37 modules，722 ms（R1 限制版前基线；最终构建 39 modules） |
| API `/health` | `status=ok, db=ok` |
| 用户端 8180 | HTTP 200 |
| 管理端 8181 | HTTP 200 |
| 真实购票 | order 595 PAID；ticket 1752 VALID；A-1-1 |
| 管理统计 | 16 场次；sold 1,752；net 61,177,000 分 |
| 截图 | `evidence/M5/01-user-events.png`、`02-admin-login.png`、`03-admin-live.png`、`04-admin-live-before.png` |
| R1 实时刷新 | `realtime_check.js` 8/8；订单/取消事件带正确 `order_id`/`performance_id`；调度器单测 4 次刷新/最大并发 1、隐藏 0/回前台 1、暂停 0/恢复 1；管理端未点 Refresh，外部支付后 Gross/Tickets/Seats 自动更新 |
| AC-25 连座推荐 | `ac_coverage_check.js --all` 17/17；独立库 `ticketing_ac` + API 3300；用户端生产构建在 8082 实测，搜索与选中前后 HELD 不变 |

端口说明：干净环境使用 3200/8180/8181，因为默认端口被演示实例占用。提交到空机器时可直接使用 3000/8080/8081；README 的默认配置未改。

该表记录 R1 限制版之前的一次干净环境复现，用于证明发布包可独立安装与启动；R1 限制版新增的 `realtime-scope.js`、`liveRefresh.js` 与节流逻辑已在演示实例上完成构建、服务端 8/8 与 UI 实测，但未重跑整轮临时目录安装。提交前若课程要求完整复现，应按第 4 节第 4 条在空机器重跑一次。

## 4. 提交前必须人工确认

1. **成员贡献记录**：填入 8 位成员姓名、本科专业、学号、具体任务和贡献比例，合计 100%，全体确认；同步填报告开头的 Group Information/Contribution Statement 表。
2. **课程官方要求**：brief 已取得，报告必须是 PDF（`XXXX-report.pdf`）、代码必须有 GitHub repo、视频 5–8 分钟且链接写进报告；待确认的是提交平台、仓库命名和截止时间。
3. **演示视频**：与组员确定脚本、录制、剪辑和字幕；视频完成后把链接或文件放入提交包，并在报告/README/清单登记。
4. **默认端口可选验收**：如课程要求必须用 3000/8080/8081 演示，先在空机器或停止占用的演示实例后重跑一次 M5 干净环境。
5. **报告格式**：用 `docs/course-report.md` 导出 PDF，文件名按 brief 使用 `XXXX-report.pdf`；导出后检查中文字体、表格、分页，以及 `system-architecture.png` 是否正常显示。
6. **GitHub 直传**：仓库地址为 <https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall>。发布包当前没有配置 remote；先 `git remote add origin https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall.git`，再 `git push -u origin main`；不要提交 `.env`、`node_modules`、日志。

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

## 6. GitHub 同步（阻塞：远端是另一套基线）

远端与本地不是同一历史，当前不能直接 `git push`：

- `origin/main` = `b48385d`，9 个提交、248 个文件，内容是 FilmSys 模板基线（`show/`、`show_admin/`、`show_api/`、`db_show.sql`）。
- 本地 `main` = 本轮文档提交后的 StagePass 发布包，49 个提交、164 个受跟踪文件；与远端没有 merge-base。
- 因此普通 push 会 non-fast-forward；必须先决定策略，并让组员确认远端没有需要保留的作业内容。

两种可选策略：

1. **替换远端为 StagePass**：先给远端现状打备份标签，再 `git push --force-with-lease`；这会改写远端 `main`，只适合确认远端是废弃模板的情况。
2. **合并两条历史**：`git merge --allow-unrelated-histories origin/main`，手工处理 `README.md`、`docs/` 等重名文件；工作量大，容易把 FilmSys 模板残留带进提交。

策略确定前，只做只读核对：

```powershell
cd "D:\_Study\CityU_MDS\Courses\SemesterA\5003\Assignment\GP\delivery\5003_StagePass"
git remote -v
git fetch origin
git log -1 --oneline origin/main
git rev-list --left-right --count HEAD...origin/main
```

不要把下面的旧命令直接运行；它假设远端为空或可直接快进：

```powershell
git remote add origin https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall.git
git push -u origin main
```

确定策略并完成推送后，刷新 GitHub 页面，确认仓库根目录能看到 `README.md`、`docs/`、`database/`、`server/`、`web-user/`、`web-admin/`、`scripts/` 与 `delivery/`，且 `docs/course-report.md` 是本轮版本。

## 7. 剩余风险

- 课程 brief 已取得；仍待确认的是提交平台、仓库命名和截止时间，报告 PDF/视频格式不会变化。
- GitHub 远端是 FilmSys 模板基线，与本地 StagePass 历史无共同祖先；需组员确认后选择“替换远端”或“合并历史”，不能直接 push。
- 成员姓名、专业和比例未提供，贡献记录与报告开头表仍是占位。
- 视频未录制；报告 PDF 未导出。
- 干净环境未做登录后的浏览器交互截图；API 与 M1–M4 UI 证据已覆盖核心流程。
- 默认端口未在本次干净环境使用；构建与启动配置本身支持默认端口。

