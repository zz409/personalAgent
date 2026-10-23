# Personal Agent

项目已拆分为可独立使用的前端和后端。要求 Node.js 22.13 或更新版本，推荐 Node.js 24。

```text
personalAgent/
    frontend/             网页界面与 Electron 桌面端，可单独复制和打包
        public/           HTML、CSS、JavaScript 界面
        desktop/          Electron 窗口和 API 代理
        server.cjs        网页开发服务
        config.json       默认后端地址，不含密钥
        package.json
        dist/             新生成的安装包
    backend/              独立 Node.js API 服务，可单独部署
        server.js         API 入口，不再提供前端页面
        auth-store.js     账号与登录会话
        chat-store.js     聊天数据库
        model-stream.js   模型流式响应解析
        sandbox.js        文件访问限制
        .env              模型密钥和服务器配置
        data/             SQLite 账号、会话、聊天数据
        workspace/        Agent 可操作的工作目录
    package.json          开发便利命令，不参与桌面打包
```

## 本地运行

分别打开两个终端，在项目根目录运行：

```powershell
# 终端一：后端 API，端口 3000
npm run backend

# 终端二：网页前端，端口 5173；本地联调时指定本机后端
$env:BACKEND_URL = "http://127.0.0.1:3000"
npm run frontend
```

浏览器打开 http://localhost:5173 。http://localhost:3000 只提供 API，不再显示页面。健康检查为 http://localhost:3000/api/health 。

使用桌面端时，只需保持后端运行，再执行：

```powershell
$env:DESKTOP_BACKEND_URL = "http://127.0.0.1:3000"
npm run desktop
```

首次安装前端开发依赖：`npm --prefix frontend ci`。网页模式和后端不需要第三方运行依赖；Electron 开发、打包需要前端开发依赖。如果 npm 未执行 Electron 安装脚本，运行 `node frontend/node_modules/electron/install.js`。

## 只打包前端

```powershell
npm run desktop:build
```

安装包输出：`frontend/dist/PersonalAgent-Setup-1.0.1.exe`。也可进入 `frontend` 独立运行 `npm ci`、`npm run desktop:build`。安装包仅包含前端界面、Electron 入口和 `config.json`，不包含后端源码、模型密钥、数据库或工作区。

以后修改界面请编辑 `frontend/public/`。桌面程序的旧安装包不会自动更新，需要重新构建并安装。根目录原有 `dist/` 是拆分前的旧产物，不是新的打包输出。

## 只部署后端

将 `backend/` 单独复制到服务器，按 [后端说明](backend/README.md) 配置 `.env`，执行 `npm start`。不需要上传 `frontend/`、Electron 依赖或安装包。

当前 1.0.1 桌面端和网页服务默认连接 `http://api.shouyeren.cloud`。将 `frontend/config.json` 的 `backendUrl` 改为后端域名，再打包，即可为新安装的客户端设置服务器地址。旧版本默认的 localhost/127.0.0.1:3000、3001 地址会自动迁移到服务器，迁移后需重新登录。自定义远程地址仍保留在 `%APPDATA%/personal-agent/desktop-config.json`，可以修改该文件并重启。

详细配置和命令见 [前端说明](frontend/README.md) 与 [后端说明](backend/README.md)。

## 数据迁移

拆分前的 `.env`、`data/` 和 `workspace/` 已迁入 `backend/`。账号、会话和历史记录保留，默认文件工作区变为 `backend/workspace/`。备份时先停止后端，再备份整个 `backend/data/` 目录；部署新机器时需一起迁移数据才能保留账号和聊天记录。

账号历史按用户隔离，工作区文件仍由已登录用户共享。文件操作限制是应用级路径校验，禁止越界和符号链接，不提供 shell 执行。当前聊天请求仍使用全局任务锁，同一时间只能运行一个生成任务。
