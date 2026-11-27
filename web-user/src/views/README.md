# views：用户端页面

| 文件 | 路由 | 作用 |
|---|---|---|
| `LoginView.vue` | `/login` | 登录、演示账号快捷填充、`?redirect=` 回跳 |
| `EventsView.vue` | `/events` | 活动列表、搜索、封面卡、起价 |
| `EventView.vue` | `/events/:id` | 活动详情与场次列表 |
| `SeatMapView.vue` | `/performances/:id/seats` | 座位图、四状态、最多 4 座、跨登录恢复选座 |
| `OrderView.vue` | `/orders/:id` | 结算、倒计时、取消、模拟支付、成功自动跳票页 |
| `OrdersView.vue` | `/orders` | 我的订单、状态筛选、分页、支付/取消/票据入口 |
| `TicketsView.vue` | `/tickets` | 票据钱包、状态筛选、分页、支付成功提示 |
| `TicketView.vue` | `/tickets/:id` | 电子票、60 秒轮换 QR、核销信息 |

页面共用 `../styles.css` 的视觉变量，API 调用统一走 `../api.js`。
