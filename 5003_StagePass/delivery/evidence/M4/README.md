# M4 证据索引

> 版本：-（2026-11-22）
> 对应报告：`delivery/M4-performance-report.md`

## 1. 证据清单

| 文件 | 对应验收 | 关键结果 |
|---|---|---|
| `dataset-summary.json` | AC-22 数据规模 | 100 场次 / 20,000 场次座位 / 10,000 订单；三项自检通过 |
| `bench-baseline.json` | AC-22 查询 P95 | 5 个接口 × 500 样本 × 50 并发；全部 HTTP 200；Q-01 P95 133.64 ms、Q-02 1,095.12 ms、Q-03 559.67 ms、Q-04 139.17 ms、Q-05 96.44 ms |
| `bench-tuned.json` | 索引实验 | 4 个候选索引下 5 个查询的延迟；Q-03 P95 952.81 ms，较 baseline 变差 |
| `explain-baseline.json` | AC-22 执行计划 | Q-01/Q-02/Q-03 的 JSON 与表格 EXPLAIN |
| `explain-tuned.json` | 索引实验 | 候选索引下的执行计划 |
| `indexes-baseline.json` / `indexes-candidates.json` / `indexes-tuned.json` / `indexes-restored.json` | 索引实验 | 候选索引创建、使用与删除恢复记录 |
| `reservation.json` | NFR-03 / AC-22 | 50/50 HTTP 201；P95 380.77 ms；50 个 HELD 座位、50 个不同持有人；无超卖 |
| `m4-anomalies.json` | AC-14 / AC-17 / AC-24 | `all_pass=true`；三组用例全部通过 |
| `bench-api.out.log` / `bench-api.err.log` | 运行日志 | 3100 bench API 当前实例请求日志；首次 AC-17 死锁结论见报告第 8.1 节，日志在重启重跑后已被覆盖 |

编号说明：本目录 `Q-01`–`Q-05` 是 M4 基准作业编号。Q-02（管理端订单检索）与 Q-04（用户订单进展）分别覆盖需求 §12.2 Q-02 的管理端/用户端视角；Q-05 是补充活动列表，不对应需求 Q-05。需求 Q-04/Q-05/Q-06/Q-07 未单独做 HTTP P95。

## 2. 口径说明

- 正式查询结果使用预热后的 warm 轮；每接口 20 次串行预热。冷缓存首轮 Q-03 曾达到 2,868.73 ms，未作为验收值，报告第 3.3 节已说明。
- 50 并发预留的 P95 只统计 `POST /orders`；50 个 `bench_load` 登录在压测前完成，不计入 P95。
- AC-14 使用 3110 独立 bench API 模拟“应用中断/重启”；不是停主 API 3000。原因是需要在同一数据集上控制 `RECONCILE_INTERVAL_SECONDS` 与 `REFUND_CUTOFF_HOURS`，避免影响演示库。
- `m4_scale_setup.js` 可重复执行；每次会 DROP 并重建 `ticketing_bench`，不改 `ticketing_system`。

## 3. 复跑入口

```powershell
cd scripts
node .\m4_scale_setup.js
node .\m4_bench.js baseline
node .\m4_bench.js indexes
node .\m4_bench.js tuned
node .\m4_bench.js drop
node .\m4_bench.js reservation
node .\m4_anomaly_check.js
```

执行 `m4_anomaly_check.js` 前需确保 3100 bench API 在跑，且 3110 未被占用。
