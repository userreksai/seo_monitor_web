# SEO Monitor Web

基于 Vue 3 + TypeScript + Vite 的 SEO 域名监控页面，对接 `userreksai/seo_monitor` Go 后端。页面默认监听 `8889`，后端默认监听 `10001`。

## 功能

- 按域名、显示名称、网站分类、注册人/机构、注册邮箱模糊查询。
- 按流量、各搜索引擎权重、APPPC 排名、反向链接数、域名年龄精确查询。
- 展示最新流量、百度 PC/移动、搜狗、必应、360、神马、PR、权重总计、排名、分类、注册信息与域名年龄，并可按当前筛选导出全部权重数据。
- 添加/归档域名，手动采集单域名或全部域名。
- 查看最近 90 天流量、权重、反向链接趋势。
- 从页眉进入独立的证书信息页，查看证书到期时间、剩余天数、状态和最近检测时间，并可手动触发全量检测。
- 使用后端 MongoDB 账号登录；后端一键安装会生成随机初始管理员密码。
- 登录成功后使用 `HttpOnly; Secure; SameSite=Strict` 会话 Cookie，令牌不写入 `localStorage`；退出或过期后自动返回登录页。
- 登录后可修改密码；新密码至少 12 字节，修改后注销该账号全部会话。

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
3. 生成只监听 `127.0.0.1:8889` 的前端代理配置，由 Nginx 作为唯一公网入口。
4. 安装依赖、构建 Vue 静态文件。
5. 安装并启动 `seo-monitor-web.service`。
6. 检查 `http://127.0.0.1:8889/frontend-health`。

部署完成后脚本会输出本机上游地址。服务器安全组/防火墙只需放行 TCP `80/443`，不要放行 `8889`、`10001` 或 MongoDB `27017`。

## Nginx 公网 HTTPS

复制 [deploy/nginx-seo-monitor.conf.example](deploy/nginx-seo-monitor.conf.example) 到 Nginx 的 `http` 配置目录，替换域名和证书路径后检查并重载：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

示例配置包含登录接口每 IP 限速、通用 API 限速、并发连接限制、请求体/超时限制、TLS 1.2/1.3、HSTS、CSP 和其他安全响应头，同时禁止公网访问健康检查。请确认 Web 服务仍绑定回环地址，并在云安全组或主机防火墙中关闭 `8889/10001/27017` 的公网入站规则。

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
HOST=127.0.0.1
PORT=8889
BACKEND_API_URL=http://127.0.0.1:10001
```

账号、密码、会话时长和防暴力破解策略由后端 `/usr/local/seo_monitor/.env` 中的 `DEFAULT_ADMIN_USERNAME`、`DEFAULT_ADMIN_PASSWORD`、`AUTH_SESSION_TTL`、`AUTH_LOGIN_*` 控制。默认管理员只在账号不存在时创建，重复启动或更新不会重置已有密码。公网部署必须保持后端 `AUTH_COOKIE_SECURE=true`。

## 本地开发

Node.js 22+：

```sh
pnpm install
VITE_BACKEND_API_URL=http://127.0.0.1:10001 pnpm run dev
```

开发服务器为 `http://127.0.0.1:8889`。生产环境使用 `server.mjs` 转发 API，静态 API Token 不会编译进前端。

## 更新部署

重复执行一键部署命令即可。脚本使用 `git merge --ff-only` 更新源码，保留现有 `.env`，重新构建并重启服务。

本项目不使用 Docker。
