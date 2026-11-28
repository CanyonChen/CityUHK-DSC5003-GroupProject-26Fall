# 后续优化与验收

本轮在 PR #3 上继续修改，不合并、不部署。结果以 [Project checks](https://github.com/CanyonChen/CityUHK-Events-Hub/pull/3/checks) 的最终提交为准，浏览器截图、trace 和 JSON 摘要保存在该运行的 ticketing-check-evidence 附件。

## 先遵守原方案

原 [requirements-spec.md](requirements-spec.md) v1.2 及 FR-11 已明确：不要求摄像头或硬件扫码，验票员输入或粘贴二维码 JWT 载荷或 64 位票码哈希。此前把“摄像头尚未验收”当作缺口不正确；已撤回新增的摄像头组件、解码器和相关权限请求。

验收链路为：用户端打开电子票 → Copy gate code (demo) → 管理端选择场次 → 粘贴票码 → 核验成功 → 再次核验显示已使用。浏览器测试禁止摄像头调用，并检查这一流程不会调用 getUserMedia。

## 免费票

- 零价座位仍先创建有截止时间的预留订单。
- `POST /orders/:orderId/confirm-free` 由订单本人确认。在同一事务中检查预留归属、截止时间与总额，确认后生成门票并占用座位。重复确认不重复出票。
- 沿用 PAID 表达已确认可履约状态，详情返回 `is_free: true`。免费订单不创建金额为零的 payment_attempts 或 refunds。
- 未使用的免费票可在退票政策截止前通过原取消接口取消；取消后票据 VOID、座位恢复 AVAILABLE。已使用或超出时限时拒绝。
- 非零价订单不能通过免费确认绕过付款；免费订单不能走模拟支付或金额退款入口。
- 页面分别显示 Confirm free booking、Booking confirmed、Cancel free booking。

## 异常退款失败重试

- `POST /admin/refunds/:refundId/retry` 仅供 ADMIN，并要求 Idempotency-Key。
- 仅失败的迟到/多付退款可以重试。原 FAILED 记录保持不变，新请求创建新 PENDING 退款记录并写入审计。
- 同一幂等键重放原重试；不同键在已有 PENDING 时拒绝。付款行锁与累计退款检查防止并发重复退还或退款超过原付款。
- 退款成功保持原订单、门票、转售座位不变。异常退款与正常销售退款分别统计，避免把异常退款从正常净票款中重复扣除。
- Finance 页仅对可重试记录显示 Retry refund，并保留失败记录及新记录的状态。
- 正常整单退款失败后，用户仍按原方案发起新的退款申请。

## 托管 API 配置

REST 与 WebSocket 共用精确来源配置 `CORS_ORIGINS`。生产配置要求 HTTPS 来源及独立 JWT/通知密钥；本地演示继续接受本机来源。两端共享 API 地址与 WebSocket 地址解析，托管时默认同源 `/api`，可显式配置独立 HTTPS API。

部署步骤与反向代理示例见 [hosted-deployment.md](hosted-deployment.md)。本轮仅提交配置与示例，未实际部署外部服务。

## 验收范围

| 测试 | 覆盖 |
|---|---|
| 原有 Node/Python 与 AC 场景 | 权限、库存、付款、原退款、核销、WebSocket 回归 |
| 扩展数据库/API 场景 | 免费确认并发与重放、取消与已使用票保护、过期拒绝；异常退款多次失败后重试、金额上限、原记录与转售保护；REST/WS HTTPS 来源 |
| 浏览器操作 | 注册、手机选座、免费确认与取消、付费失败/超时/成功、电子票 PNG 与复制票码 |
| 管理端操作 | 登录、活动创建和编辑、草稿座位封锁/恢复、发布、退款重试与确认、手机菜单及语言切换 |
| 文本票码核验 | 浏览器剪贴板复制/粘贴、成功核验、重复核验拒绝、验票员菜单与越权页面跳转；无摄像头依赖 |

这些是自动浏览器验收；不将其描述为人工逐按钮认证。真实摄像头不是项目要求，因此不作为未完成项。
