# 托管票务 API 与两端页面

公开 GitHub Pages 仍为活动看板与只读演示。完整票务应用需要运行 Node.js API 和 MariaDB；本说明不把静态 Pages 当作后端。

## 推荐地址关系

| 服务 | 示例 | 配置 |
|---|---|---|
| 用户端 | https://tickets.example.org/ | 静态目录 web-user/dist |
| 管理端 | https://admin.example.org/ | 静态目录 web-admin/dist |
| API | 两个域名各自的 /api/ 代理到同一个 API | 本机 127.0.0.1:3000 |
| WebSocket | wss://对应域名/api/ws | 同一代理转发到 /ws |

两端托管时默认使用 `/api`。只有 API 单独使用其他域名时，才在各前端构建前设置 `VITE_API_BASE=https://api.example.org`。HTTPS 页面拒绝 HTTP API，WebSocket 自动改用 wss，并保留 API 路径前缀。

## 服务端配置

将 server/.env.example 复制到实际运行环境的 server/.env，配置数据库连接，并设置：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=https://tickets.example.org,https://admin.example.org
JWT_SECRET=在运行环境生成独立随机值
PAYMENT_NOTIFY_SECRET=另一个独立随机值
PAYMENT_MODE=test
```

来源是完整 origin，不含路径、查询或通配符。REST 与 WebSocket 使用同一列表。示例中的密钥值必须替换；环境文件不提交仓库。PAYMENT_MODE=test 沿用课程方案的模拟付款，不接真实资金。

安装、启动 API：

```sh
npm ci --prefix server
npm --prefix server start
```

构建前端：

```sh
npm ci --prefix web-user
npm ci --prefix web-admin
npm --prefix web-user run build
npm --prefix web-admin run build
```

将两个 dist 分别放到对应域名的静态目录。反向代理示例：[nginx.example.conf](../deploy/nginx.example.conf)。替换域名、证书和目录后使用，未自动应用到任何服务器。

## 验证

1. 同一域名访问 /api/health，数据库可用时返回 200。
2. 在两个前端登录，并在网络面板确认请求指向 /api/，WS 指向 /api/ws。
3. 验证页面刷新仍能打开订单或管理端子路由。
4. 未配置来源收到 403；两端配置的来源可以使用 REST 和 WebSocket。
5. 验票使用票码文本，无需摄像头许可。

本地若要验证同源代理，构建时显式设置 VITE_API_BASE=/api；启动 preview 时设置 API_PROXY_TARGET=http://127.0.0.1:3000。未配置 API 地址的本机开发页面保留原 API 默认端口 3000。
