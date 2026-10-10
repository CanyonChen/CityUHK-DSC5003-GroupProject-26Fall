# Show 票务系统 · 管理后台

管理端使用 Vue 2、Vue Router、Element UI 和 Webpack 3，保留用户、电影、影院、影厅、排片、评论及订单七类管理页面。

## 本地运行

先按[根目录说明](../README.md)初始化 `db_show` 并启动 API。在另一个终端中从项目根目录执行：

```sh
cd show_admin
npm ci
npm start
```

默认访问 <http://localhost:8081/>。原样例的管理员账号和密码均为 `admin`。该终端不要继承 API 使用的 `PORT=3000`。开发代理与页面资源沿用 `http://localhost:3000`；修改 API 端口需同步修改代理和资源地址。

```sh
npm run build
```

构建产物默认写入 `dist/`。上述命令是后续运行步骤；本次没有安装依赖、构建或启动服务，历史依赖与当前 Node.js/npm 的兼容性尚未验证。

## 代码入口与边界

- `src/pages/Login/`：管理员登录。
- `src/pages/Home/children/`：七类管理页面。
- `src/router/`、`src/api/`：路由与接口调用。
- `config/`、`build/`：开发与构建配置。

订单删除沿用模板的删除记录与释放座位操作，没有接入退款。此次没有新增验票、销售统计或权限改造。

## 来源与修改

基于 [J1ong/FilmSys](https://github.com/J1ong/FilmSys) 的管理端。2026-10-10 更新目录、包名、页面标题及品牌、文档和本地配置忽略规则，保留管理功能、样例资源及依赖版本。模板随附完整许可证见 [LICENSE](LICENSE)。
