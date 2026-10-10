# Show 票务系统 · 用户端

用户购票端，使用 Vue 2、Vue Router、Mint UI、Element UI 和 Webpack 3。保留模板的电影浏览与搜索、影院及场次查询、选座、模拟支付、取票码、个人订单、影评和账户资料功能。

## 本地运行

开发环境已在 macOS arm64 上使用 Node.js 22.23.2、npm 10.9.8 验证。使用已配置的 Conda 环境时先执行 `conda activate showsys`；其他管理工具使用相同版本即可。首次配置及完整依赖版本见[开发环境配置指南](../requirements.md)。

完整业务需要先按[根目录说明](../README.md)初始化 `db_show` 并启动 API。在另一个终端中从项目根目录执行：

```sh
cd show
npm ci
npm start
```

默认访问 <http://localhost:8080/>，页面按移动端布局设计。该终端不要继承 API 使用的 `PORT=3000`。开发代理与页面资源沿用 `http://localhost:3000`；修改 API 端口需同步修改代理和资源地址。

```sh
npm run build
```

构建产物默认写入 `dist/`。已完成依赖安装、生产构建及开发服务器首页/编译脚本的 HTTP 检查。2026-10-10 已导入样例数据库并启动服务，浏览器首页可显示 24 部在排片电影，电影与影院查询代理正常；完整选座、下单及模拟支付流程仍待验证。

## 代码入口

- `src/router/`：页面路由。
- `src/pages/`：首页、电影、影院、个人中心。
- `src/components/`：电影详情、登录、选座、订单确认、支付等组件。
- `src/api/`：接口封装；`config/`、`build/`：开发与构建配置。

支付与手机验证码都是模板模拟流程；本次没有新增退款、验票或服务端库存事务。原样例图片保留。

## 来源与修改

基于 [J1ong/FilmSys](https://github.com/J1ong/FilmSys) 的用户端。2026-10-10 更新目录、包名、页面品牌、文档及本地配置忽略规则，保留业务接口和依赖版本。模板随附完整许可证见 [LICENSE](LICENSE)。
