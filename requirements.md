# Show 票务系统：开发环境与配置指南

本文面向项目团队成员和开源社区用户，说明从获取源码、准备运行环境到初始化数据库、启动应用及检查结果的完整流程。版本与验证记录更新于 **2026-10-10**。

项目由用户端、管理端和 API 三个独立 Node.js 应用组成，共用一个数据库。三个应用可以共用同一个 Node.js 环境，各自保留自己的 `node_modules/` 和锁文件。

## 1. 选择配置方式

| 使用场景 | 配置方式 |
| --- | --- |
| 团队成员首次参与开发 | 克隆团队仓库，使用本文基准版本，按第 2～7 节配置自己的环境与样例数据库。 |
| 开源用户本地体验 | 克隆仓库后执行相同步骤；`template/` 不随仓库分发，也不是运行所需文件。 |
| 开源用户准备贡献修改 | 可以先 Fork，再克隆自己的仓库；依赖版本、初始化和启动步骤与团队成员一致。 |
| 已完成配置，日常继续开发 | 确认数据库服务可连接，直接按第 7 节启动；无需每天重新安装依赖或导入 SQL。 |
| 已经使用其他 Node.js 管理工具 | 准备相同的 Node.js/npm 版本即可，Conda 是可选方式。 |

本文命令使用 macOS/Linux 的 Bash 或 Zsh。Windows 用户可在 WSL2 的 Linux 环境中执行；Node.js、数据库和项目依赖应安装在同一开发环境内。**当前实际验证平台为 macOS Apple Silicon，Linux、WSL2 和原生 Windows 尚未完成项目运行验证。** PowerShell 不支持直接照搬本文的 `set -a` 和 `. ./.env` 命令。

### 文件分别负责什么

| 文件 | 用途 | 是否共享到 Git |
| --- | --- | --- |
| [requirements.md](requirements.md) | 本指南、运行环境版本和直接依赖清单 | 是 |
| [environment.yml](environment.yml) | 可选的 Conda 环境定义，指定 `showsys` 和 Node.js 版本 | 是 |
| 各应用的 `package.json` | 应用命令及依赖声明范围 | 是 |
| 各应用的 `package-lock.json` | 实际依赖版本、完整依赖树及完整性信息 | 是 |
| [show_api/.npmrc](show_api/.npmrc) | API 安装依赖时的兼容性配置 | 是 |
| [show_api/.env.example](show_api/.env.example) | 数据库连接与 API 端口的配置示例 | 是 |
| `show_api/.env` | 开发者自己的数据库账号、密码和端口 | 否，已被忽略 |
| `node_modules/`、`dist/` | 本机安装及构建产物 | 否，已被忽略 |

应用依赖统一由 npm 安装。本文件是 Markdown 文档，Python 和 pip 不参与项目环境配置。

## 2. 运行环境与版本

### 基准环境

| 组件 | 基准版本或要求 | 说明 |
| --- | --- | --- |
| Node.js | **22.23.2** | 三个应用共用，已在 macOS arm64 验证 |
| npm | **10.9.8** | 本机 Conda 的 Node.js 包附带此版本；支持现有版本 1 锁文件 |
| MariaDB Server | **11.4.13** | 已验证 SQL 导入、API 连接、查询和管理员登录 |
| MySQL Server | 文档参考版本 **8.4.8** | 来自数据库分析文档，尚未进行本项目运行验证；首次复现优先使用上面的 MariaDB 基准 |
| Git | 可正常克隆仓库的版本 | 项目没有固定 Git 版本 |
| Conda 或 nvm | 二选一，或使用已有工具 | 项目固定 Node.js 版本，未固定版本管理工具自身的版本 |
| Python | 无应用运行依赖 | `showsys` 环境无需指定或安装 Python |
| 浏览器 | Chrome、Edge 等现代浏览器 | 用户端按移动端布局设计，可使用浏览器设备模拟视图 |

`environment.yml` 只指定 Node.js 版本及软件源，没有单独锁定 npm 和 Conda 的全部间接依赖。新机器创建后仍需核对 `node --version` 和 `npm --version`。

项目保留 Vue 2、Webpack 3 和历史依赖。前端 `engines` 中的 `node >= 6.0.0`、`npm >= 3.0.0` 是模板原有声明，不能据此认为任意新版或旧版都已经兼容。

### 应用与默认端口

| 应用或服务 | 目录 | 默认地址或端口 |
| --- | --- | --- |
| 用户购票端 | `show/` | <http://localhost:8080/> |
| 管理后台 | `show_admin/` | <http://localhost:8081/> |
| API 与图片资源 | `show_api/` | <http://localhost:3000/> |
| MariaDB | 独立数据库服务 | `127.0.0.1:3306`，数据库名 `db_show` |

两个前端通过开发代理调用 API，图片地址也沿用 `http://localhost:3000`。首次运行保持上述端口；改变 API 端口时，需要同时修改两个前端的代理和资源地址。

## 3. 获取源码并准备 Node.js

### 3.1 获取项目

在准备存放项目的目录执行：

```sh
git clone --branch main https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall.git group_project
cd group_project
```

已经有本地副本的成员直接进入项目根目录。使用 Fork 的贡献者将克隆地址换成自己的仓库地址即可。下面所说的“项目根目录”就是包含本文件、`db_show.sql` 和三个应用目录的位置。

### 3.2 方式 A：Conda

先按 [Conda 安装说明](https://docs.conda.io/projects/conda/en/stable/user-guide/install/index.html) 安装适合操作系统和处理器架构的发行版，并在新终端中确认 `conda --version` 可用。

在项目根目录创建并激活环境：

```sh
conda env create -f environment.yml
conda activate showsys
node --version
npm --version
```

预期 Node.js 为 `v22.23.2`，npm 为 `10.9.8`。如果 `showsys` 已经存在，先检查版本；需要同步 Node.js 定义时执行：

```sh
conda env update -n showsys -f environment.yml
conda activate showsys
```

[environment.yml](environment.yml) 使用 `conda-forge`，并通过 `nodefaults` 排除默认软件源。它只准备 Node.js 环境，应用依赖和数据库按后续步骤分别安装。[Conda 环境管理说明](https://docs.conda.io/projects/conda/en/stable/user-guide/tasks/manage-environments.html)

每个用于安装、构建或启动项目的新终端都要激活环境。可以检查实际命令位置：

```sh
command -v node
command -v npm
node -p "process.execPath"
```

使用 Conda 时，命令应来自当前 `showsys` 环境，而非 Homebrew 或其他全局 Node.js。如果激活后仍指向其他环境，可用 `conda run -n showsys node --version` 对比结果，并检查终端初始化脚本的 PATH 顺序。已有开发机的自定义激活钩子不会自动随 Git 或 `environment.yml` 分发。

### 3.3 方式 B：nvm 或已有 Node.js 管理工具

macOS、Linux 和 WSL 用户可按 [nvm 官方安装说明](https://github.com/nvm-sh/nvm#installing-and-updating) 安装 nvm，重新打开终端后执行：

```sh
nvm install 22.23.2
nvm use 22.23.2
node --version
npm --version
```

如果 nvm 管理的该 Node.js 环境附带的 npm 版本不同，可在确认 `node`、`npm` 均来自 nvm 后，将 npm 调整到基准版本：

```sh
npm install --global npm@10.9.8
npm --version
```

这是对当前 nvm 环境内 npm 工具的调整，不改变项目的依赖锁文件。每个新终端先执行 `nvm use 22.23.2`。使用其他工具时，同样核对 Node.js/npm 版本与实际命令路径。

Conda 与 nvm 两条路线选择一条即可；后续步骤完全相同。nvm 支持的系统和命令见 [nvm 官方文档](https://github.com/nvm-sh/nvm)。

## 4. 安装三个应用的依赖

先激活上一步准备的 Node.js 环境。在项目根目录依次执行，每一步成功后再继续：

```sh
cd show
npm ci --include=dev
cd ../show_admin
npm ci --include=dev
cd ../show_api
npm ci --include=dev
cd ..
```

三个应用分别安装，根目录没有统一的 npm 安装入口。前端启动和构建需要 `devDependencies`，因此显式保留开发依赖。

`npm ci` 按已有锁文件安装；当包文件和锁文件不一致时会报错，也会替换当前应用已有的 `node_modules/`。团队协作时保留锁文件，不通过删除锁文件来解决安装问题。[npm ci 官方说明](https://docs.npmjs.com/cli/v10/commands/npm-ci/)

### API 的安装兼容性配置

[show_api/.npmrc](show_api/.npmrc) 已包含：

```ini
ignore-scripts=true
```

旧版可选依赖 `fsevents 1.x` 在当前 Node.js 22 / Apple Silicon 环境中原生编译失败，因此 API 安装时跳过自动脚本；也会跳过 `nodemon` 的 `postinstall`。本机已验证当前 API 的 12 个直接依赖可加载，文件监听可使用 Node.js 回退机制。

该设置对 `show_api` 项目生效，不依赖 Conda。显式 `npm start` 仍然执行，但 pre/post 自动脚本会跳过。它影响所有相关自动脚本，后续新增需要安装时编译或下载文件的依赖，应重新评估此设置。[npm ignore-scripts 说明](https://docs.npmjs.com/cli/v10/commands/npm-ci/#ignore-scripts)

可在各应用目录执行 `npm ls --depth=0` 检查直接依赖是否安装完整。完整版本表见第 10 节。

## 5. 准备并初始化数据库

### 5.1 准备 MariaDB 服务与客户端

本项目的已验证数据库是 **MariaDB Server 11.4.13**。已有可用服务时先检查版本和连接方式，沿用现有服务即可；Conda 环境不会启动或管理数据库。

新安装可以按平台选择：

| 平台 | 安装方式 | 验证情况 |
| --- | --- | --- |
| macOS | 使用 Homebrew 的 `mariadb@11.4` 软件包 | 本项目已在 macOS arm64 + MariaDB 11.4.13 验证 |
| Linux / WSL2 | 按 MariaDB 官方安装说明配置适合发行版的 11.4 软件源，安装服务端与客户端 | 提供配置路径，尚未进行本项目平台联调 |
| 已有 MySQL | 先单独验证导入、认证与 API 驱动连接 | MySQL 8.4.8 仅为结构参考，不能沿用 MariaDB 的已验证结论 |

**macOS 新安装示例**：已安装 Homebrew 且没有需要复用的数据库服务时执行：

```sh
brew install mariadb@11.4
brew services start mariadb@11.4
export PATH="$(brew --prefix mariadb@11.4)/bin:$PATH"
mariadb --version
```

`mariadb@11.4` 跟随该系列的补丁版本更新，不保证未来始终安装 11.4.13。安装后记录实际版本；若与基准不同，完成第 8 节的检查后再作为自己的验证结果。上面的 PATH 修改只作用于当前终端，新终端需要能再次找到 `mariadb`。[Homebrew 软件包说明](https://formulae.brew.sh/formula/mariadb@11.4)、[MariaDB 的 macOS 安装说明](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-on-macos-using-homebrew)

**Debian/Ubuntu/WSL2 示例**：先按 [MariaDB 软件源配置说明](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/mariadb-package-repository-setup-and-usage) 选择 11.4 系列，再安装：

```sh
sudo apt-get update
apt-cache policy mariadb-server mariadb-client
sudo apt-get install mariadb-server mariadb-client
sudo systemctl start mariadb
mariadb --version
```

在安装前检查 `apt-cache policy` 的候选版本；发行版默认软件源可能提供其他版本。上述启动命令要求系统使用 systemd；未启用 systemd 的 WSL 环境可使用 `sudo service mariadb start`。其他发行版使用对应的官方软件源和服务管理命令。[MariaDB DEB 安装说明](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-deb-files)

`mariadb --version` 显示客户端版本；连接后执行 `SELECT VERSION();` 才是服务端版本。本文后续使用 `mariadb` 客户端命令；如果本机可用的兼容客户端名为 `mysql`，可替换命令名称，连接参数保持一致。

### 5.2 使用有建库权限的账号导入

**仅在首次初始化或明确需要重置样例时执行。** [db_show.sql](db_show.sql) 会创建并使用 `db_show`，删除并重建其中九张同名表。已有开发数据时先备份；普通启动不需要再次导入。

在项目根目录，使用本机数据库管理账号进入客户端。账号采用 TCP 密码认证时：

```sh
mariadb --protocol=TCP --host=127.0.0.1 --port=3306 --user=root --password
```

`--password` 会交互提示输入密码。将 `root` 换成自己的管理账号；此账号需要建库、建表、写入等初始化权限。

如果本机管理账号使用 Unix socket 认证，选择符合本机安装方式的一条命令：

```sh
# macOS Homebrew：尝试使用安装数据库时的本机用户身份
mariadb --protocol=socket --user="$(id -un)"
```

```sh
# Linux：使用通过 sudo 授权的本机数据库管理身份
sudo mariadb --protocol=socket
```

不要因为 socket 管理账号不能通过 TCP 密码登录就重置现有数据库；API 会使用下一节创建的专用 TCP 账号。

在数据库客户端提示符下执行以下 **SQL / 客户端命令**，不要直接粘贴到普通终端：

```sql
SELECT VERSION();
SOURCE db_show.sql;
USE db_show;
SHOW TABLES;
SELECT COUNT(*) AS movie_count FROM t_movie;
SELECT COUNT(*) AS schedule_count FROM t_schedule;
SELECT MIN(STR_TO_DATE(show_date, '%Y-%c-%e')) AS first_show_date,
       DATE_ADD(CURDATE(), INTERVAL 1 DAY) AS expected_first_date
FROM t_schedule;
```

`SOURCE` 从客户端启动目录读取文件，因此应先在项目根目录打开客户端。如果使用图形化数据库工具，则以管理账号打开并执行整个 `db_show.sql`。发现 SQL 错误时先处理错误，再继续配置 API。[MariaDB 客户端说明](https://mariadb.com/docs/server/clients-and-utilities/mariadb-client/mariadb-command-line-client)

首次导入的预期结果为 **9 张表、67 个字段、9 个外键、19 个索引、151 条样例记录**：

| 表 | 初始记录数 |
| --- | ---: |
| `t_admin` | 1 |
| `t_cinema` | 8 |
| `t_comment` | 2 |
| `t_hall` | 8 |
| `t_movie` | 26 |
| `t_order` | 23 |
| `t_schedule` | 40 |
| `t_user` | 18 |
| `t_wishmovie` | 25 |

所有样例主键和关联关系保留。脚本最后按照**数据库服务器的当前日期**整体平移排片，使最早场次落在导入次日，保留日期间隔和放映时间。电影上映日期、历史订单及评论日期保持原值。导入当天，查询结果的 `first_show_date` 与 `expected_first_date` 应相同。

### 5.3 创建本机 API 账号

继续在数据库管理会话中操作。首次配置时，将下面的示例密码替换成自己的本机密码：

```sql
CREATE USER 'showsys_app'@'127.0.0.1'
  IDENTIFIED BY 'CHANGE_ME_LOCAL_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON db_show.* TO 'showsys_app'@'127.0.0.1';

EXIT;
```

该账号用于 API 的日常增删改查；初始化 SQL 仍由管理账号执行。已经配置了可用的专用账号时直接沿用，不需要重复创建。主机部分与 API 使用的 TCP 地址 `127.0.0.1` 对应。[MariaDB 账号说明](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/create-user)

回到普通终端验证应用账号连接：

```sh
mariadb --protocol=TCP --host=127.0.0.1 --port=3306 --user=showsys_app --password db_show --execute="SELECT VERSION(); SELECT COUNT(*) AS movie_count FROM t_movie;"
```

应能返回服务端版本与 `movie_count = 26`。已有数据库被修改后，记录数可以不同。

## 6. 创建 API 本地配置

在项目根目录执行：

```sh
cd show_api
test -f .env || cp .env.example .env
chmod 600 .env
```

用编辑器打开 `show_api/.env`，填写自己的数据库信息。以下示例与第 5 节的本机应用账号对应：

```sh
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=showsys_app
DB_PASSWORD='CHANGE_ME_LOCAL_PASSWORD'
DB_NAME=db_show
PORT=3000
```

将密码替换为创建账号时使用的值。示例中 `CHANGE_ME_LOCAL_PASSWORD` 是占位内容，不是仓库提供的实际数据库密码。

| 配置项 | 代码默认值 | 配置要求 |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | 数据库主机 |
| `DB_PORT` | `3306` | 数据库实际监听端口 |
| `DB_USER` | `root` | 改为自己的应用账号，如 `showsys_app` |
| `DB_PASSWORD` | 空字符串 | 对应数据库账号的密码 |
| `DB_NAME` | `db_show` | 与初始化脚本固定目标一致 |
| `PORT` | `3000` | API 端口，首次运行保持不变 |

`.env` 使用 shell 的 `KEY=value` 语法，等号两侧不要有空格；包含空格或特殊字符的值需要正确引用。常规密码可用单引号包裹，密码本身含单引号时需按 shell 规则转义。

配置文件已被 Git 忽略，每位开发者各自创建。提交可共享的配置项示例时修改 `.env.example`。不要把个人数据库密码写进本文、包文件或锁文件。

**当前 API 不会自动读取 `.env`。** 需要按下一节在启动它的同一个终端显式加载。修改配置后也需要重新加载并重启 API。

## 7. 启动、停止与日常开发

### 7.1 启动三个服务

确认数据库服务已经运行，准备三个独立终端，各自在项目根目录开始。每个终端先执行自己选择的环境命令：Conda 用户执行 `conda activate showsys`，nvm 用户执行 `nvm use 22.23.2`。

**终端一：API**

```sh
cd show_api
set -a
. ./.env
set +a
npm start
```

`set -a` 让加载的变量可以传给 Node.js，`set +a` 恢复普通 shell 行为。API 唯一启动入口为 `npm start` → `node ./bin/www`，`app.js` 只导出 Express 实例。

**终端二：用户端**

```sh
cd show
unset PORT
npm start
```

打开 <http://localhost:8080/>，需要时切换浏览器移动设备视图。

**终端三：管理后台**

```sh
cd show_admin
unset PORT
npm start
```

打开 <http://localhost:8081/>。原样例管理员账号和密码均为 **`admin`**。

两个前端使用自己的默认端口，避免继承 API 的 `PORT=3000`。开发服务器端口被占用时可能选择其他空闲端口，实际地址以终端输出为准。

### 7.2 停止与重新启动

在对应终端按 `Ctrl+C` 停止应用。三个应用进程停止后，数据库数据仍保存在数据库服务中。

重新开发时，确认数据库服务可用，激活 Node.js 环境，再重复第 7.1 节即可。只在首次配置、缺少依赖或依赖锁文件发生变化时重新执行 `npm ci`。

API 当前由普通 Node.js 进程运行，修改后端代码后需要重启；两个前端使用开发服务器处理源码更新。修改 `.env` 后需要先重新加载环境变量，再启动 API。

## 8. 检查配置是否完成

### 8.1 页面与接口

在浏览器检查：

1. 用户端能够显示样例电影和海报。
2. 影院列表和排片详情能够加载。
3. 管理后台可以使用 `admin / admin` 登录并查看电影列表。

也可以在普通终端检查 API 与前端代理：

```sh
curl --noproxy '*' --fail http://localhost:3000/
curl --noproxy '*' --fail http://localhost:8080/api/getMovieList
curl --noproxy '*' --fail http://localhost:8080/api/getCinemaList
```

API 欢迎页应正常返回；两个列表接口应包含 `success_code: 200` 和数据。`--noproxy '*'` 让这些本机检查直接连接服务，避免终端代理影响结果。样例的可见电影数量取决于排片时间筛选，不必等于 `t_movie` 的 26 条记录。

### 8.2 前端构建

在项目根目录执行：

```sh
cd show
npm run build
cd ../show_admin
npm run build
cd ..
```

产物分别写入 `show/dist/`、`show_admin/dist/`。构建成功验证的是前端打包，不代表完整购票流程已经通过；API 没有单独的构建步骤。

### 8.3 已有验证记录与边界

2026-10-10 在 macOS arm64、Node.js 22.23.2、npm 10.9.8、MariaDB 11.4.13 上完成：

- 三个应用依赖安装，包文件与锁定依赖版本保持一致。
- 两个前端生产构建及开发服务器页面和脚本访问。
- API 直接依赖加载、JavaScript 语法及文件监听回退检查。
- `db_show.sql` 导入，表结构、样例记录数和日期平移检查。
- API 数据库连接、用户端代理查询、电影海报、排片详情和后台登录/电影列表接口检查。
- 浏览器用户首页、管理后台登录页显示检查。

完整选座、下单、模拟支付及管理端增删改流程尚未完成验证；其他操作系统和其他数据库版本需在各自环境中检查。

本项目支付与手机验证码沿用模板的模拟实现。上述本地运行步骤不包含真实支付、真实短信接入或生产部署。

## 9. 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `. ./.env` 报文件不存在 | 先进入 `show_api/`，按第 6 节复制 `.env.example` 并填好配置，再加载。 |
| `conda activate` 不可用 | 按 Conda 安装说明初始化所用 shell，重新打开终端；不要把普通 shell 命令直接粘贴到数据库客户端。 |
| 已激活 `showsys`，Node.js 版本仍不正确 | 用 `command -v node`、`command -v npm` 与 `node -p "process.execPath"` 检查路径，处理终端初始化脚本的 PATH 覆盖。 |
| `mariadb` 命令不存在 | 安装数据库客户端或将其 `bin/` 加入当前终端 PATH；客户端不存在不等于数据库服务没有运行。 |
| `Access denied` | 先用第 5.3 节的同一 TCP 地址、账号和密码验证；检查账号授权主机。socket 管理账号与 API 密码账号是不同连接方式。 |
| `ECONNREFUSED` | 检查数据库或 API 是否启动，以及目标端口是否与配置一致。 |
| `Unknown database 'db_show'` 或业务表不存在 | 尚未完成初始化，使用有权限的管理账号执行第 5.2 节。 |
| API 安装时报 `fsevents` / `node-gyp` 编译错误 | 确认在 `show_api/` 运行安装，并用 `npm config get ignore-scripts` 检查结果应为 `true`；检查是否被命令行或环境变量覆盖。 |
| `webpack-dev-server` 找不到 | 在对应前端目录执行 `npm ci --include=dev`，保留构建所需的开发依赖。 |
| `npm ci` 报包文件与锁文件不一致 | 确认检出的两个文件来自同一次依赖修改；由修改依赖的开发者修正并提交，避免为安装而直接删除锁文件。 |
| 端口占用，或前端地址不是 8080/8081 | 检查是否已有同一应用运行，并读取终端打印的实际地址；前端启动前清除继承的 `PORT`。 |
| 页面可打开，但电影为空或海报失败 | 检查 API、数据库和前端代理；确认 API 使用 3000 端口。排片随时间可能过期，可通过后台添加有效排片。 |
| 本地 `curl` 返回 502，但服务已启动 | 尝试第 8.1 节的 `--noproxy '*'`；浏览器也应使用实际启动的本机地址。 |

反馈问题时，提供操作系统/架构、Node.js/npm/数据库版本、应用目录、执行命令和去除账号密码后的错误信息，方便团队与社区复现。

## 10. 完整直接依赖版本

下表由三个应用当前的 `package.json` 和 `package-lock.json` 核对，共 **104 项应用级直接依赖**：用户端 48 项、管理端 44 项、API 12 项。相同包在不同应用中分别计数。

“声明范围”来自包文件，“锁定版本”来自锁文件。完整间接依赖与完整性信息以各应用的 `package-lock.json` 为准。两个前端的 Vue、Element UI 等版本存在差异，应各自安装并保留配套编译器版本。

### `show/`（包名 `show`，48 项）

**dependencies**

| 包名 | 锁定版本 | 声明范围 |
| --- | --- | --- |
| `axios` | `0.18.0` | `^0.18.0` |
| `element-ui` | `2.7.0` | `^2.7.0` |
| `ly-tab` | `2.1.2` | `^2.1.2` |
| `mint-ui` | `2.2.13` | `^2.2.13` |
| `moment` | `2.24.0` | `^2.24.0` |
| `stylus` | `0.54.5` | `^0.54.5` |
| `stylus-loader` | `3.0.2` | `^3.0.2` |
| `swiper` | `4.5.0` | `^4.5.0` |
| `url-loader` | `1.1.2` | `^1.1.2` |
| `vue` | `2.6.8` | `^2.5.2` |
| `vue-cookies` | `1.5.13` | `^1.5.13` |
| `vue-router` | `3.0.2` | `^3.0.1` |
| `vuejs-mobile-datepicker` | `1.0.3` | `^1.0.3` |

**devDependencies**

| 包名 | 锁定版本 | 声明范围 |
| --- | --- | --- |
| `autoprefixer` | `7.2.6` | `^7.1.2` |
| `babel-core` | `6.26.3` | `^6.22.1` |
| `babel-helper-vue-jsx-merge-props` | `2.0.3` | `^2.0.3` |
| `babel-loader` | `7.1.5` | `^7.1.1` |
| `babel-plugin-component` | `1.1.1` | `^1.1.1` |
| `babel-plugin-syntax-jsx` | `6.18.0` | `^6.18.0` |
| `babel-plugin-transform-runtime` | `6.23.0` | `^6.22.0` |
| `babel-plugin-transform-vue-jsx` | `3.7.0` | `^3.5.0` |
| `babel-preset-env` | `1.7.0` | `^1.3.2` |
| `babel-preset-stage-2` | `6.24.1` | `^6.22.0` |
| `chalk` | `2.4.2` | `^2.0.1` |
| `copy-webpack-plugin` | `4.6.0` | `^4.0.1` |
| `css-loader` | `0.28.11` | `^0.28.0` |
| `extract-text-webpack-plugin` | `3.0.2` | `^3.0.0` |
| `file-loader` | `1.1.11` | `^1.1.4` |
| `friendly-errors-webpack-plugin` | `1.7.0` | `^1.6.1` |
| `html-webpack-plugin` | `2.30.1` | `^2.30.1` |
| `node-notifier` | `5.4.0` | `^5.1.2` |
| `optimize-css-assets-webpack-plugin` | `3.2.0` | `^3.2.0` |
| `ora` | `1.4.0` | `^1.2.0` |
| `portfinder` | `1.0.20` | `^1.0.13` |
| `postcss-import` | `11.1.0` | `^11.0.0` |
| `postcss-loader` | `2.1.6` | `^2.0.8` |
| `postcss-url` | `7.3.2` | `^7.2.1` |
| `rimraf` | `2.6.3` | `^2.6.0` |
| `semver` | `5.6.0` | `^5.3.0` |
| `shelljs` | `0.7.8` | `^0.7.6` |
| `uglifyjs-webpack-plugin` | `1.3.0` | `^1.1.1` |
| `vue-loader` | `13.7.3` | `^13.3.0` |
| `vue-style-loader` | `3.1.2` | `^3.1.2` |
| `vue-template-compiler` | `2.6.8` | `^2.5.2` |
| `webpack` | `3.12.0` | `^3.6.0` |
| `webpack-bundle-analyzer` | `2.13.1` | `^2.9.0` |
| `webpack-dev-server` | `2.11.3` | `^2.9.1` |
| `webpack-merge` | `4.2.1` | `^4.1.0` |

### `show_admin/`（包名 `show-admin`，44 项）

**dependencies**

| 包名 | 锁定版本 | 声明范围 |
| --- | --- | --- |
| `axios` | `0.18.0` | `^0.18.0` |
| `element-ui` | `2.8.1` | `^2.8.1` |
| `moment` | `2.24.0` | `^2.24.0` |
| `stylus` | `0.54.5` | `^0.54.5` |
| `stylus-loader` | `3.0.2` | `^3.0.2` |
| `url-loader` | `1.1.2` | `^1.1.2` |
| `vue` | `2.6.10` | `^2.5.2` |
| `vue-cookies` | `1.5.13` | `^1.5.13` |
| `vue-router` | `3.0.6` | `^3.0.1` |

**devDependencies**

| 包名 | 锁定版本 | 声明范围 |
| --- | --- | --- |
| `autoprefixer` | `7.2.6` | `^7.1.2` |
| `babel-core` | `6.26.3` | `^6.22.1` |
| `babel-helper-vue-jsx-merge-props` | `2.0.3` | `^2.0.3` |
| `babel-loader` | `7.1.5` | `^7.1.1` |
| `babel-plugin-component` | `1.1.1` | `^1.1.1` |
| `babel-plugin-syntax-jsx` | `6.18.0` | `^6.18.0` |
| `babel-plugin-transform-runtime` | `6.23.0` | `^6.22.0` |
| `babel-plugin-transform-vue-jsx` | `3.7.0` | `^3.5.0` |
| `babel-preset-env` | `1.7.0` | `^1.3.2` |
| `babel-preset-stage-2` | `6.24.1` | `^6.22.0` |
| `chalk` | `2.4.2` | `^2.0.1` |
| `copy-webpack-plugin` | `4.6.0` | `^4.0.1` |
| `css-loader` | `0.28.11` | `^0.28.0` |
| `extract-text-webpack-plugin` | `3.0.2` | `^3.0.0` |
| `file-loader` | `1.1.11` | `^1.1.4` |
| `friendly-errors-webpack-plugin` | `1.7.0` | `^1.6.1` |
| `html-webpack-plugin` | `2.30.1` | `^2.30.1` |
| `node-notifier` | `5.4.0` | `^5.1.2` |
| `optimize-css-assets-webpack-plugin` | `3.2.0` | `^3.2.0` |
| `ora` | `1.4.0` | `^1.2.0` |
| `portfinder` | `1.0.20` | `^1.0.13` |
| `postcss-import` | `11.1.0` | `^11.0.0` |
| `postcss-loader` | `2.1.6` | `^2.0.8` |
| `postcss-url` | `7.3.2` | `^7.2.1` |
| `rimraf` | `2.6.3` | `^2.6.0` |
| `semver` | `5.7.0` | `^5.3.0` |
| `shelljs` | `0.7.8` | `^0.7.6` |
| `uglifyjs-webpack-plugin` | `1.3.0` | `^1.1.1` |
| `vue-loader` | `13.7.3` | `^13.3.0` |
| `vue-style-loader` | `3.1.2` | `^3.1.2` |
| `vue-template-compiler` | `2.6.10` | `^2.5.2` |
| `webpack` | `3.12.0` | `^3.6.0` |
| `webpack-bundle-analyzer` | `2.13.1` | `^2.9.0` |
| `webpack-dev-server` | `2.11.5` | `^2.9.1` |
| `webpack-merge` | `4.2.1` | `^4.1.0` |

### `show_api/`（包名 `show-api`，12 项）

**dependencies**

| 包名 | 锁定版本 | 声明范围 |
| --- | --- | --- |
| `cookie-parser` | `1.4.4` | `~1.4.3` |
| `debug` | `2.6.9` | `~2.6.9` |
| `ejs` | `2.5.9` | `~2.5.7` |
| `express` | `4.16.4` | `~4.16.0` |
| `express-session` | `1.16.1` | `^1.16.1` |
| `http-errors` | `1.6.3` | `~1.6.2` |
| `morgan` | `1.9.1` | `~1.9.0` |
| `multer` | `1.4.1` | `^1.4.1` |
| `mysql` | `2.16.0` | `^2.16.0` |
| `nodemon` | `1.18.11` | `^1.18.11` |
| `request` | `2.88.0` | `^2.88.0` |
| `svg-captcha` | `1.3.12` | `^1.3.12` |

API 的 `mysql 2.16.0` 是 Node.js 数据库驱动版本，与 MariaDB/MySQL **服务端版本**分别管理。

## 11. 团队与社区维护约定

- 准备环境或正常安装依赖时，保留现有包文件和锁文件；需要升级依赖时，将版本变化作为明确的修改提交。
- 修改依赖后同步更新对应 `package.json`、`package-lock.json` 和本文版本表，并记录实际完成的安装、构建或运行检查。
- 修改 Node.js 基准版本时，同时更新 [environment.yml](environment.yml) 和相关 README。
- `environment.yml`、`show_api/.npmrc`、`.env.example` 随源码共享；个人 `.env`、依赖目录和构建产物遵循 [.gitignore](.gitignore)。
- 新平台或新数据库版本通过验证后，补充平台、版本、步骤和检查范围，避免将单机成功扩大为所有环境都已验证。
- 项目结构、功能与上游来源见 [README.md](README.md)，数据库设计参考见 [FilmSys 数据库结构文档](docs/FilmSys-数据库表结构与字段参考.md)。
