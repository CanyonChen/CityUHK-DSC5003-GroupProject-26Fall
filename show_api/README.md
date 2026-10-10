# Show 票务系统 · 接口服务

Express 与 MySQL 接口服务，为用户端和管理后台提供业务接口及图片资源。接口路径、请求参数、响应结构和九张业务表沿用模板。

## 数据库与配置

先按[根目录说明](../README.md)导入 [db_show.sql](../db_show.sql)。该脚本创建并使用 `db_show`，重建其中九张同名表，保留原样例并整体平移排片日期，使最早场次位于导入次日。

在项目根目录执行：

```sh
cd show_api
cp .env.example .env
```

编辑 `.env`，填写本机连接信息：

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | MySQL 用户 |
| `DB_PASSWORD` | 空字符串 | MySQL 密码，按本机填写 |
| `DB_NAME` | `db_show` | 数据库名称，与初始化脚本一致 |
| `PORT` | `3000` | API 监听端口 |

`.env` 使用 shell 的 `KEY=value` 语法，含空格或特殊字符的值请加引号。配置文件被 Git 忽略，`.env.example` 保留供团队参考。本项目不自动读取 `.env`，也未新增环境配置依赖。

## 启动

在 `show_api` 目录中执行：

```sh
npm ci
set -a
. ./.env
set +a
npm start
```

默认入口为 <http://localhost:3000/>。`npm start` 通过 `bin/www` 创建 HTTP 服务并监听端口；`app.js` 仅配置和导出 Express 应用，`node app.js` 不会启动 HTTP 监听。

前端代理和图片地址沿用 `http://localhost:3000`，首次运行保持此端口。若修改 `PORT`，同步调整两个前端的代理及资源地址；在新的终端分别启动两个前端，避免它们继承 API 的端口变量。

以上是后续运行步骤；本次没有安装依赖、导入数据库或启动服务，MySQL 连接及历史依赖的运行兼容性尚未验证。

## 代码入口与边界

- `bin/www`：唯一的 HTTP 监听入口。
- `app.js`：Express 中间件、会话、路由和错误处理。
- `db/db.js`：从环境变量读取数据库连接参数。
- `routes/index.js`：保留原有用户端与管理端业务接口。
- `public/images/`：原样例海报、头像及管理端图片。

支付是直接写入订单的模拟流程，手机验证码由接口返回。原有认证、订单和座位逻辑未重构；没有新增退款、二维码票据、核销、对账或并发库存机制。

## 来源与修改

基于 [J1ong/FilmSys](https://github.com/J1ong/FilmSys) 的 API。2026-10-10 更新目录、包名、欢迎页和文档；数据库默认改为 `db_show` 并读取环境变量；移除 `app.js` 的重复监听，统一通过 `bin/www` 启动。模板随附完整许可证见 [LICENSE](LICENSE)，数据库脚本也来自同一模板。
