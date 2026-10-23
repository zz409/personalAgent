# 前端与桌面客户端

本目录可以独立复制、安装依赖和打包，不依赖 `../backend` 中的任何文件。

## 网页模式

```powershell
npm start
```

默认访问 http://localhost:5173 。Node.js 前端服务提供 `public/` 内的页面，将 `/api/*` 代理到 `config.json` 中的 `backendUrl`，不保存聊天数据。API 代理逐段转发流式响应，不需要浏览器配置跨域请求。

覆盖端口或后端地址：

```powershell
$env:FRONTEND_PORT = "5174"
$env:BACKEND_URL = "http://127.0.0.1:3000"
npm start
```

## 桌面开发与打包

```powershell
npm ci
# npm 禁止运行依赖安装脚本时，手动安装 Electron 二进制
node node_modules/electron/install.js
npm run desktop
npm run desktop:build
```

- Windows x64 安装包：`dist/PersonalAgent-Setup-1.0.1.exe`。
- 目录版：`npm run desktop:pack`，生成 `dist/win-unpacked/Personal Agent.exe`，需保留整个文件夹。
- 默认后端地址：`config.json`，打包时会包含该文件。
- 桌面运行时地址优先级：`--backend-url=地址` > `DESKTOP_BACKEND_URL` 环境变量 > 用户配置文件。
- 用户配置文件：首次启动时从安装包的 `config.json` 初始化，Windows 默认位于 `%APPDATA%/personal-agent/desktop-config.json`。
- 普通浏览器和桌面客户端登录状态相互独立。登录 Cookie 由后端验证，桌面端退出不停止后端。

```powershell
& ".\dist\win-unpacked\Personal Agent.exe" --backend-url=https://api.example.com
```

后端地址支持 HTTP/HTTPS 的协议、主机和端口，不包含子路径。远程后端需将该域名配置进后端 `PUBLIC_URL` 或 `ALLOWED_HOSTS`。

## 网页生产部署

`public/` 是无需构建的静态页面。可以通过 Nginx 提供，同时把同一域名下 `/api/` 转发给后端。参考 `nginx.conf.example`；流式接口需要关闭代理缓冲。

本地 Node.js 网页服务仅监听回环地址，用于开发。服务器部署请使用 Nginx 或其他支持流式转发的反向代理；浏览器通过同源 `/api` 使用登录 Cookie，无需将模型密钥放在前端。

## 1.0.1 服务器版

当前默认后端为 `http://api.shouyeren.cloud`。旧客户端保存的本机默认地址（localhost/127.0.0.1 的 3000、3001 端口）会自动迁移到服务器，并清除旧客户端登录状态，需要重新登录服务器账号。自定义远程地址保留。命令行与环境变量仍可临时覆盖连接地址。本地聊天数据不会自动上传到服务器。
