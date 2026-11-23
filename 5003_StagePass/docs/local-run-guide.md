# StagePass 本地运行指南（Windows 小白版）

版本：v1.0（2026-11-23）

适用对象：第一次接触这个项目、只会在 Windows 上双击和复制命令的组员。目标是把项目在本地跑起来，看到用户端和管理端页面。

> 当前一键脚本只支持 Windows。Mac 组员不能直接双击 `.bat`，需要手动安装 Node.js 和 MySQL，或找一台 Windows 电脑演示。

## 1. 先装好 3 个软件

### 1.1 Node.js

1. 打开 <https://nodejs.org>，下载 **LTS 版本**（当前应是 Node.js 20 或 22）。
2. 安装时一路点“Next”，不要取消 “Add to PATH”。
3. 安装完成后打开 PowerShell，输入：

```powershell
node -v
npm -v
```

能显示版本号即可。建议 Node.js 20 及以上。

### 1.2 XAMPP

1. 打开 <https://www.apachefriends.org>，下载 Windows 版 XAMPP。
2. 安装到默认路径 `C:\xampp` 最省事；装到其他盘也可以，脚本会自动查找常见路径。
3. 打开 **XAMPP Control Panel**，点击 **MySQL** 旁边的 **Start**。
4. 看到 MySQL 变成绿色、端口为 `3306` 即可。

默认数据库账号是：

- 用户：`root`
- 密码：空
- 端口：`3306`

不要改 root 密码，除非你确定知道怎么改项目配置。

### 1.3 Python（建议安装）

1. 打开 <https://www.python.org/downloads>，下载 Python 3.10 以上版本。
2. 安装时勾选 **Add Python to PATH**。
3. 检查：

```powershell
python --version
```

Python 只用于导入演示数据后的校验。没装也能启动，但会跳过这一步检查。

## 2. 放项目

把整个 `5003_StagePass` 文件夹复制到本地，例如：

```text
D:\StagePass\5003_StagePass
```

注意：

- 不要在压缩包里直接双击运行，要先解压。
- 路径尽量简单，不要放在 OneDrive 同步目录里。
- 不要只复制 `server` 或 `web-user` 一个子文件夹，要复制整个发布包。

## 3. 一键启动（推荐）

1. 确认 XAMPP 的 MySQL 已经启动。
2. 进入 `5003_StagePass` 文件夹。
3. 双击 **`Start-StagePass.bat`**。
4. 第一次启动会自动安装依赖，可能需要 **2–5 分钟**，不要关闭窗口。
5. 看到 `API`、`User web`、`Admin web` 三个地址后，浏览器会自动打开用户端和管理端。
6. 如果浏览器提示“无法访问”，等 30–60 秒再刷新一次；前端第一次编译比较慢。

启动成功后会打开三个窗口，标题分别是：

- `StagePass API`
- `StagePass User web`
- `StagePass Admin web`

这三个窗口要保留，关掉就停止对应服务。

## 4. 打开页面和登录

用户端：

```text
http://127.0.0.1:8080
```

管理端：

```text
http://127.0.0.1:8081
```

演示账号（密码统一为 `Demo@1234`）：

| 账号 | 用途 |
|---|---|
| `buyer01` | 用户端购票、选座、订单、电子票 |
| `admin` | 管理端全部页面 |
| `checker01` | 管理端验票、授权场次 |

推荐先走一遍：

1. 用 `buyer01` 登录用户端。
2. 打开一个活动，进入选座页。
3. 选 1–2 个座位，进入结算。
4. 点击“Simulate successful payment”，生成订单和电子票。
5. 用 `admin` 登录管理端，查看概览、订单和财务页。

## 5. 怎么停止

关闭这三个窗口即可：

- `StagePass API`
- `StagePass User web`
- `StagePass Admin web`

MySQL 可以继续开着，不影响电脑使用；不用时在 XAMPP Control Panel 点 **Stop**。

## 6. 恢复演示数据

演示数据被改乱、订单太多，或想重新演示时：

1. 先关闭上面三个 StagePass 窗口。
2. 双击 **`Reset-StagePass.bat`**。
3. 等待提示 `Reset complete`。

它会删除并重建 `ticketing_system` 数据库，然后重新导入演示数据。**这个操作会清空你本地的测试订单，不要在有重要数据时运行。**

## 7. 一键启动失败时，用手动方式

如果 `Start-StagePass.bat` 报错，按下面 4 个窗口手动启动。每开一个 PowerShell 窗口，执行一段命令，并保持窗口不关。下面的 `D:\StagePass\5003_StagePass` 要替换成你实际存放项目的路径。

### 窗口 1：建库和演示数据

```powershell
cd D:\StagePass\5003_StagePass\scripts
.\reset_demo.ps1
```

看到 `Reset complete` 再继续。

### 窗口 2：后端 API

```powershell
cd D:\StagePass\5003_StagePass\server
npm install
Copy-Item .env.example .env
npm start
```

看到 API 监听 `3000` 后保持窗口。

### 窗口 3：用户端

```powershell
cd D:\StagePass\5003_StagePass\web-user
npm install
npm run serve
```

### 窗口 4：管理端

```powershell
cd D:\StagePass\5003_StagePass\web-admin
npm install
npm run serve
```

然后分别打开 `http://127.0.0.1:8080` 和 `http://127.0.0.1:8081`。

## 8. 常见问题

### `node` 不是内部或外部命令

Node.js 没装好，或安装时没勾选 PATH。重新安装 Node.js LTS，安装后关掉所有 PowerShell 窗口再打开。

### `mysqld not found` 或找不到 XAMPP

脚本会自动找 `C:\xampp`、`D:\xampp`、`D:\_Coding\XAMPP`。如果都不对，在 PowerShell 里设置一次：

```powershell
setx XAMPP_HOME "你的XAMPP路径"
```

例如：

```powershell
setx XAMPP_HOME "C:\xampp"
```

然后关闭 PowerShell 重新打开，再运行 `Start-StagePass.bat`。

### 端口被占用

项目默认使用：

- MySQL `3306`
- API `3000`
- 用户端 `8080`
- 管理端 `8081`

先关掉占用这些端口的其他程序。最常见的是另一个 MySQL 实例占用了 `3306`，或之前启动过旧项目。

### `npm install` 很慢或失败

第一次安装依赖需要联网。确认网络正常后重试；如果公司/学校网络限制 npm，换一个网络或设置 npm 镜像后再试。

### 页面打不开或空白

1. 确认 `StagePass API` 窗口没有报错。
2. 等 30–60 秒，Vite 第一次编译较慢。
3. 刷新浏览器。
4. 确认地址是 `http://127.0.0.1:8080`，不要写成 `https`。

### 登录提示密码错误

演示账号密码都是 `Demo@1234`，区分大小写。若数据库被改过，双击 `Reset-StagePass.bat` 恢复演示数据。

## 9. 给组员的最短版本

如果只想发一段话到群里，可以复制这段：

> 1. 装 Node.js 20 LTS、XAMPP、Python 3.10+。
> 2. 打开 XAMPP，点 MySQL 的 Start。
> 3. 解压 `5003_StagePass`，双击 `Start-StagePass.bat`，等 2–5 分钟。
> 4. 用户端 <http://127.0.0.1:8080>，账号 `buyer01` / `Demo@1234`。
> 5. 管理端 <http://127.0.0.1:8081>，账号 `admin` / `Demo@1234`。
> 6. 停止就关掉三个 StagePass 窗口；数据乱了双击 `Reset-StagePass.bat`。
