# SEO Monitor Web

基于 Vue 3 + TypeScript + Vite 的 SEO 域名监控页面，对接 `userreksai/seo_monitor` Go 后端。页面默认监听 `8889`，后端默认监听 `10001`。

## 功能

- 按域名、显示名称、网站分类、注册人/机构、注册邮箱模糊查询。
- 按流量、各搜索引擎权重、APPPC 排名、反向链接数、域名年龄精确查询。
- 展示最新流量、百度 PC/移动、搜狗、必应、360、神马、PR、排名、分类、注册信息与域名年龄。
- 添加/归档域名，手动采集单域名或全部域名。
- 查看最近 90 天流量、权重、反向链接趋势。
- 服务端代理后端 API，后端 Token 不会发送到浏览器。
- 8889 端口使用 HTTP Basic 登录保护，安装脚本自动生成密码。

## 服务器一键部署（Debian/Ubuntu）

先确保 Go 后端已安装在 `/usr/local/seo_monitor`，并已更新为监听 `127.0.0.1:10001`。然后执行：

```sh
curl -fsSL https://raw.githubusercontent.com/userreksai/seo_monitor_web/main/install.sh \
  -o /tmp/install-seo-monitor-web.sh
sudo sh /tmp/install-seo-monitor-web.sh
```

脚本会自动：

1. 安装 Git、Node.js 22、pnpm 11 等依赖；检测到 Node.js 20 时自动升级。
2. 拉取或快进更新 `/usr/local/seo_monitor_web`。
3. 从 `/usr/local/seo_monitor/.env` 读取 `API_TOKEN`。
4. 生成前端管理用户名和随机密码。
5. 安装依赖、构建 Vue 静态文件。
6. 安装并启动 `seo-monitor-web.service`。
7. 检查 `http://127.0.0.1:8889/frontend-health`。

部署完成后脚本会输出访问地址、用户名和密码。服务器安全组/防火墙需要放行 TCP `8889`。

## 常用命令

```sh
sudo systemctl status seo-monitor-web
sudo systemctl restart seo-monitor-web
sudo journalctl -u seo-monitor-web -f
```

修改 `/usr/local/seo_monitor_web/.env` 后需要重启服务：

```sh
sudo systemctl restart seo-monitor-web
```

配置字段：

```dotenv
HOST=0.0.0.0
PORT=8889
BACKEND_API_URL=http://127.0.0.1:10001
BACKEND_API_TOKEN=与后端API_TOKEN一致
WEB_USERNAME=admin
WEB_PASSWORD=强密码
```

## 本地开发

Node.js 22+：

```sh
pnpm install
VITE_BACKEND_API_URL=http://127.0.0.1:10001 \
VITE_BACKEND_API_TOKEN=后端API_TOKEN \
pnpm run dev
```

开发服务器为 `http://127.0.0.1:8889`。生产环境使用 `server.mjs`，不要把 `VITE_BACKEND_API_TOKEN` 编译进前端。

## 更新部署

重复执行一键部署命令即可。脚本使用 `git merge --ff-only` 更新源码，保留现有 `.env`，重新构建并重启服务。

本项目不使用 Docker。
