# CityUHK Events Hub

想报名一场讲座时，学生往往记得主题，却记不起报名链接在哪封邮件里。CityUHK Events Hub 把城大公告平台（CAP）的公开活动整理成一张看板。按活动形式浏览或查看即将截止的报名，就能从活动卡片找到主办方的入口。

**打开活动看板** · [English](https://canyonchen.github.io/CityUHK-Events-Hub/) · [简体中文](https://canyonchen.github.io/CityUHK-Events-Hub/?lang=zh-cn) · [繁體中文](https://canyonchen.github.io/CityUHK-Events-Hub/?lang=zh-hk)

## 找活动，也能办活动

- **学生**可以在同一张卡片上查看活动时间、主办方发布的海报和报名或投稿入口。看板每 12 小时尝试同步一次，并显示最近一次成功同步的时间。[城大公告平台](https://cap.cityu.edu.hk/)
- **主办方**可以沿用公告里的报名表。需要分配座位时，也可以自托管票务应用。学生在同一用户端预留座位、查看订单和出示电子票，工作人员登录后台配置场次、票价和座位，并在入场时验票。
- **想先体验选座？** 打开看板中带 `[Demo]` 的演出，可查看不同场次的座位图和各区上座率。线上示例只读，完整预订和出票流程在自托管应用中运行，付款采用模拟支付。

## 本地运行

只预览活动看板需要 Python。完整票务应用使用 Node.js 20+ 和 MariaDB，默认用户端在 `8080`，管理端在 `8081`，API 在 `3000`。

**票务系统资源** · [安装与本地运行指南](docs/local-run-guide.md) · [票务 API 参考](docs/api-contract.md) · [GitHub 源码](https://github.com/CanyonChen/CityUHK-Events-Hub/tree/main)

### 管理员怎么登录？

1. 在 Windows 上双击仓库根目录的 `Start-CityUHK Events Hub.bat` 启动票务应用。
2. 从活动看板导航选择 **管理员登录 → 打开本机管理后台**，或直接打开[本机登录页](http://127.0.0.1:8081/login)。[看板管理员入口](https://canyonchen.github.io/CityUHK-Events-Hub/admin/?lang=zh-cn)
3. 使用本地演示账号 **`admin`** 和密码 **`Demo@1234`** 登录。打开 **Performances → Seats** 管理某个场次的座位，或打开 **Orders** 查看订单。仅体验验票可使用 `checker01`，密码相同。

后台支持英文、简体中文和繁体中文。从看板进入时会沿用当前语言，登录前后均可切换。也可直接打开本机对应的登录页：[English](http://127.0.0.1:8081/login?lang=en) · [简体中文](http://127.0.0.1:8081/login?lang=zh-cn) · [繁體中文](http://127.0.0.1:8081/login?lang=zh-hk)。

## 开发文档

| 想了解什么 | 从哪里开始 |
| --- | --- |
| 公告来源、活动分类与刷新 | [看板代码](pages/) · [CAP 同步脚本](scripts/sync_cap.py) · [发布流程](.github/workflows/cityuhk-events-hub-pages.yml) |
| 票务系统各部分如何协作 | [架构图](docs/system-architecture.svg) · [用户端](web-user/) · [管理端](web-admin/) · [API 服务](server/) |
| 数据表、关系与约束 | [数据库设计](docs/database-design.md) |
| 验证功能或复现基准 | [脚本指南](scripts/README.md) |

项目代码采用 [MIT 许可证](LICENSE)。
