# 本地运行

CityUHK Events Hub 包含一个公开活动目录和一套带数据库的演示票务应用。开发公告、翻译或静态页面时，只需启动活动目录。开发选座、订单、支付、退款和验票时，启动票务应用。[票务系统架构图](system-architecture.svg)

```sh
git clone https://github.com/CanyonChen/CityUHK-Events-Hub.git CityUHK_Events_Hub
cd CityUHK_Events_Hub
```

## 预览活动目录

在仓库根目录运行以下命令，然后打开 [本地活动目录](http://127.0.0.1:8000/)。目录读取 `pages/data/` 中已保存的公告、译文和演出快照。预览和语言切换都可以在没有票务服务的情况下使用。

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory pages
```

### 管理员登录入口

公开看板导航中的「管理员登录」打开站点的 `./admin/`。默认按钮指向访问者本机的 `http://127.0.0.1:8081/login`。先按下节启动管理端，再从同一台电脑打开按钮。[本地预览的管理员入口](http://127.0.0.1:8000/admin/)

已部署独立管理端时，在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 新增仓库变量 `ADMIN_LOGIN_URL`，填写该管理端完整的 HTTPS 登录地址（例如 `https://admin.example.org/login`）。重新运行 Pages 部署后，公开看板的入口会使用该地址。购票端的登录链接单独通过 `web-user/.env.local` 中的 `VITE_ADMIN_LOGIN_URL` 设置；开发时重启 Vite，上线时重新构建购票端。

## 启动票务应用

### Windows 一键启动

安装 Node.js 20 或更新版本（含 npm）和带 MariaDB 的 XAMPP。启动器使用本机 `127.0.0.1:3306`、XAMPP 默认的 `root` 账号和空密码。Python 3.10 或更新版本可用于导入后的校验。若自行设置了数据库账号或端口，使用下文的手动启动步骤。

双击根目录里的 **`Start-CityUHK Events Hub.bat`**。它会启动或复用 MariaDB，在 `ticketing_system` 中没有数据表时导入结构和种子，首次安装 Node 依赖，并打开两个网页。也可以从 PowerShell 运行：

```powershell
& '.\Start-CityUHK Events Hub.bat'
```

| 服务 | 默认地址 | 演示账号 |
|---|---|---|
| 用户端 | [购票页面](http://127.0.0.1:8080/) | `buyer01` 至 `buyer30` |
| 管理端 | [管理控制台](http://127.0.0.1:8081/) | `admin` 管理所有场次，`checker01` 至 `checker03` 仅核销已分配场次 |
| API | [健康检查](http://127.0.0.1:3000/health) | 公开读取 |

种子账号的密码均为 `Demo@1234`。停止应用时，在 API、用户端和管理端各自的窗口按 `Ctrl+C`。数据库可从 XAMPP 控制面板停止。

### 手动启动（Windows、macOS 或 Linux）

先准备一个可运行 InnoDB 的本地 MySQL 或 MariaDB 实例。以下操作在**空的演示数据库**上执行一次。SQL 文件默认创建或选择 `ticketing_system`。从仓库根目录运行数据库客户端，然后依次导入两个文件：

```sh
mysql --host=127.0.0.1 --port=3306 --user=root --password --default-character-set=utf8mb4
```

```sql
SOURCE database/schema.sql
SOURCE database/seed.sql
```

使用 `mariadb` 客户端的系统可将命令名 `mysql` 换成 `mariadb`。已有演示数据时，可直接启动服务。若数据库账号、密码或端口与默认值不同，将 [server/.env.example](../server/.env.example) 复制为 `server/.env`，填写 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD` 和 `DB_NAME`。API 会自动读取此文件。

分别打开三个终端，各自在仓库根目录执行对应的一行安装命令和一行启动命令：

| 服务 | 首次安装 | 启动 |
|---|---|---|
| API | `npm ci --prefix server` | `npm --prefix server start` |
| 用户端 | `npm ci --prefix web-user` | `npm --prefix web-user run serve` |
| 管理端 | `npm ci --prefix web-admin` | `npm --prefix web-admin run serve` |

前端默认调用 `http://127.0.0.1:3000`。若通过 `server/.env` 更改了 `PORT`，在 `web-user/.env.local` 和 `web-admin/.env.local` 设置 `VITE_API_BASE` 为新的 API 地址，然后重启两个前端。

## 验证与排查

- **页面能打开，目录没有数据。** 打开[健康检查](http://127.0.0.1:3000/health)。服务与数据库均可用时，HTTP 状态为 `200`，`data.db` 为 `ok`。返回 `503` 时核对 MariaDB 是否运行，以及 `server/.env` 中的连接参数。
- **Windows 提示 `mysqld not found`。** 在同一个 PowerShell 窗口设置 `$env:XAMPP_HOME = 'D:\xampp'`（替换为实际目录），确认其中有 `mysql\bin\mysqld.exe` 和 `mysql\bin\mysql.exe`，再运行启动器。
- **端口已被占用。** 用 `Get-NetTCPConnection -State Listen -LocalPort 3000,8080,8081,3306` 核对进程。前端固定使用 8080 和 8081，启动器会复用已监听的端口。
- **需要重新演示验票或恢复种子。** 场次时间按导入时刻生成。先关闭三个应用进程，再双击 `Reset-CityUHK Events Hub.bat`。确认后它会删除本机 `ticketing_system` 数据库并重建，已有订单和账号会被种子数据替换。

日常验收与开发命令见[脚本说明](../scripts/README.md)。
