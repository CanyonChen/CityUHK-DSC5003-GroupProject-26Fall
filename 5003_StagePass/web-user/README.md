# StagePass 用户端（8080）

DSC5003 Track 1 的购票用户端：Vue 3 + Vite，调用共用 API `http://127.0.0.1:3000`。

## 启动

```powershell
cd ticketing-app\web-user
npm install
npm run serve
```

打开 `http://127.0.0.1:8080`。如需改 API 地址：

```powershell
$env:VITE_API_BASE = "http://127.0.0.1:3000"
npm run serve
```

## 演示账号

| 账号 | 密码 | 说明 |
|---|---|---|
| `buyer01`–`buyer30` | `Demo@1234` | 购票用户，种子内含历史订单与票据 |
| `admin` | `Demo@1234` | 管理员，可查看任意订单/票据；管理端在 8081 |

登录页提供 **Create account** 切换，可自助注册新账号（默认 `USER` 角色）；注册成功后自动登录。`admin` / `checker01`–`checker03` 的授权由管理端 8081 的 Users 页维护，不在用户端注册。

## 页面与流程

| 路由 | 页面 |
|---|---|
| `/login` | 登录；支持 `?redirect=` 回跳 |
| `/events` | 活动列表：搜索、封面、起价、下一场 |
| `/events/:id` | 活动详情与场次列表 |
| `/performances/:id/seats` | 座位图：按区域/排/座渲染，四状态图例，最多 4 座 |
| `/orders/:id` | 结算：座位、单价、总额、5 分钟倒计时、取消、模拟支付 |
| `/orders` | 我的订单：状态筛选、分页、支付/取消/查看票据 |
| `/tickets` | 票据钱包：状态筛选、分页 |
| `/tickets/:id` | 电子票：票面、60 秒轮换 QR、核销信息 |

主流程：选座 → 未登录时先登录并恢复选座 → 下单 → 支付 → 自动跳票据 → 打开二维码。

## 演示要点

- 支付为测试模式，结算页三个按钮分别模拟成功、失败、超时；不会真实扣款。
- 订单预留 5 分钟；到期后座位自动释放，订单转 `EXPIRED`。
- 同一用户同一场次同时只能有 1 个待支付订单；单笔最多 4 张。
- 支付成功会在 1.4 秒后自动跳转 `/tickets?paid=<order_id>`，并显示成功提示。
- 选座跨越登录会暂存于 `sessionStorage`；登录后只恢复仍可售的座位。

## 构建

```powershell
npm run build
npm run preview
```

Sign out 先调用 `POST /auth/logout`，由服务端递增 `users.token_version` 吊销该账号所有 token，再清理本地 token；旧 token 下一次请求即 401。

`npm run serve` 固定 8080 且 `strictPort`，端口被占用会直接报错而不是换端口。

## 技术栈说明

课程参考模板是 Vue 2 + Mint UI/Element UI + webpack；本项目在 Node 22 下改用 Vue 3 + Vite，原因是旧 webpack 在 Node 17+ 会触发 `ERR_OSSL_EVP_UNSUPPORTED`。页面信息架构、视觉语言与 API 契约保持一致。
