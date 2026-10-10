# Show 票务系统

DSC5003 小组项目的开发基线，基于 FilmSys 模板整理。当前保留电影浏览、影院与排片、选座、模拟支付、个人订单、影评及管理后台功能，后续在此基础上开发团队自己的业务。

## 项目结构

| 目录／文件 | 用途 | 技术／默认端口 |
| --- | --- | --- |
| [show/](show/) | 用户购票端，移动端页面 | Vue 2、Mint UI、Element UI；8080 |
| [show_admin/](show_admin/) | 用户、电影、影院、影厅、排片、评论、订单管理 | Vue 2、Element UI；8081 |
| [show_api/](show_api/) | 两个前端共用的接口及静态图片服务 | Express、MySQL；3000 |
| [db_show.sql](db_show.sql) | 独立数据库初始化与原始样例 | MySQL 数据库 `db_show` |
| [requirements.md](requirements.md) | 团队与社区开发环境配置指南、完整依赖版本表 | 环境管理工具由开发者自行选择 |
| [environment.yml](environment.yml) | 可选的 Conda 环境定义 | `showsys`；Node.js 22.23.2 |
| [数据库结构参考](docs/FilmSys-数据库表结构与字段参考.md) | 模板数据库的字段、关系和建表说明 | 9 张表、67 个字段、9 个外键、19 个索引 |

`template/` 是本地参考副本，按现有忽略规则不纳入 Git；新应用运行不依赖该目录。`movie`、`cinema` 等业务命名、接口路径和表结构沿用模板。

## 本地准备与启动

2026-10-10 已在 macOS arm64 的 `showsys` Conda 环境中完成依赖安装、前端构建、API 依赖与语法检查，以及 MariaDB 11.4.13 的 SQL 导入和基础接口联调。该记录代表已验证的开发环境；首次克隆项目的开发者仍需在自己的机器上完成配置。

开发环境使用 **Node.js 22.23.2、npm 10.9.8**；运行完整业务还需可连接的 MySQL。项目沿用模板的 Vue 2、Webpack 3 及历史依赖锁文件，没有升级应用依赖；现有 `engines` 声明来自模板，不代表所有满足最低版本的环境均兼容。

首次配置请阅读 [requirements.md](requirements.md)：包含团队与社区使用方式、Conda/nvm 环境准备、数据库安装与初始化、`.env` 配置、启动与验证、常见问题及全部直接依赖版本。开发者可以自行选择工具准备相同版本。当前已验证 MariaDB 11.4.13 的 SQL 导入及 API 查询；数据库结构参考文档中的 MySQL 8.4.8 尚未进行运行验证。

应用依赖通过各目录的 `npm ci` 安装，完整依赖树以对应的 `package-lock.json` 为准；更新依赖时同步更新指南中的版本表。下面保留常用启动步骤，数据库初始化仅在首次配置或明确重置样例时执行。

使用本机已配置的 Conda 环境时，每个开发终端先执行：

```sh
conda activate showsys
node --version   # v22.23.2
npm --version    # 10.9.8
```

新机器可在项目根目录通过 `conda env create -f environment.yml` 创建环境，已有环境可用 `conda env update -n showsys -f environment.yml` 安装指定 Node.js。环境不需要安装 Python。其他平台安装后应核对 Node.js/npm 版本，再执行依赖安装和构建验证。

`command -v node` 和 `command -v npm` 应指向当前 Conda 环境的 `bin/`。如果激活后仍指向 Homebrew 或其他 Node.js，按配置指南检查终端 PATH 顺序；个人机器的激活钩子不会随仓库分发。

### 1. 初始化独立数据库

在项目根目录执行，按本机情况调整主机、端口及用户名；`--password` 会提示输入 MySQL 密码：

```sh
mysql --host=127.0.0.1 --port=3306 --user=root --password < db_show.sql
```

脚本创建并选中 `db_show`，会重建其中的九张同名表与样例记录。它不针对原模板数据库执行修改。执行前应确认 `db_show` 中没有需要保留的开发数据；执行账号需要建库、建表及写入权限。

所有原样例、记录 ID、订单、评论及配套图片保留。导入末尾使用数据库服务器的当前日期，将最早排片移到次日，其余排片应用相同的天数偏移，保持日期间隔和放映时间。电影上映日期、订单日期及评论日期保留原值。重复初始化会重新导入样例，并以新的导入日期计算偏移。

### 2. 配置并启动 API

在一个新终端中，从项目根目录执行：

```sh
cd show_api
test -f .env || cp .env.example .env
```

编辑 `.env`，填写本机数据库连接信息。默认值与用途见 [API 说明](show_api/README.md)。数据库密码示例为空，不包含模板作者的连接密码。

```sh
npm ci
set -a
. ./.env
set +a
npm start
```

`.env` 使用 shell 的 `KEY=value` 语法，含空格或特殊字符的值请加引号。`npm start` 不会自动读取 `.env`，需要先在同一终端显式加载。API 默认入口是 <http://localhost:3000/>；应用由 `bin/www` 统一监听，勿使用 `node app.js` 启动。

### 3. 启动用户端和管理端

另开两个终端，各自从项目根目录执行，避免继承 API 的 `PORT=3000`：

用户端：

```sh
cd show
npm ci
npm start
```

打开 <http://localhost:8080/>，可使用浏览器的移动设备视图。

管理端：

```sh
cd show_admin
npm ci
npm start
```

打开 <http://localhost:8081/>。原样例中的管理员账号和密码均为 `admin`。

两个前端沿用访问 `http://localhost:3000` 的代理和图片地址，首次运行请保持默认 API 端口。修改 API 端口时，需要同步调整两个前端的代理配置和页面中的资源地址。前端端口被占用时，开发服务器可能另选端口，以终端输出为准。

两个前端各自支持 `npm run build`，本机已构建通过。安装和构建生成的 `node_modules/`、`dist/` 已被 Git 忽略。

API 的旧版可选文件监听扩展 `fsevents` 无法在本机 Node.js 22 / Apple Silicon 环境中编译，因此 [show_api/.npmrc](show_api/.npmrc) 设置了 `ignore-scripts=true`。该配置跳过依赖安装脚本；当前 API 的直接依赖加载和文件监听回退机制均已验证。显式 `npm start` 仍会执行，后续新增需要安装脚本的依赖时应重新检查此设置。详见 [API 说明](show_api/README.md)。

安装和构建期间会出现模板历史依赖的弃用、循环依赖等提示；本轮保留原依赖版本，没有执行依赖升级或安全修复。

## 当前功能边界

- 支付为页面确认后直接创建订单的模拟流程，没有连接微信或支付宝；手机验证码由接口返回，没有发送短信。
- 座位图为固定的 6 排 × 10 座。座位占用保存在排片的文本字段中，倒计时与释放依赖页面，没有新增服务端并发预留或自动过期任务。
- 保留取票码与历史订单展示；本次没有新增退款、二维码电子票、验票核销、支付对账或销售统计。
- 保留模板的认证、权限及业务逻辑。已验证服务启动、浏览查询及后台登录；选座、下单、模拟支付和管理端增删改等完整业务流程仍待验证。

## 来源与本次改动

上游参考：[J1ong/FilmSys](https://github.com/J1ong/FilmSys)。2026-10-10 从本地模板复制，更新项目品牌、包名、启动说明、数据库名称及环境配置，并移除 API 重复监听。

三个复制应用分别保存模板随附的完整许可证：[用户端 LICENSE](show/LICENSE)、[管理端 LICENSE](show_admin/LICENSE)、[API LICENSE](show_api/LICENSE)，内容为 GNU GPL version 3。数据库脚本也来自同一模板。根目录已有的 `LICENSE` 保持原样；复制部分的来源与随附许可由上述文件记录。

基线静态验收覆盖文件完整性、依赖锁定、源码语法、命名和 SQL 结构。后续已完成依赖安装、前端构建、数据库导入、API 数据库连接与基础页面检查。导入结果为 9 张表、67 个字段、9 个外键、19 个索引、151 条样例记录；本次导入后的最早场次为 2026-10-11。未执行完整购票流程或管理端数据修改测试。
