# 后端 API

独立 Node.js 服务，不引用前端目录，不需要 Electron 或第三方 npm 运行依赖。要求 Node.js >= 22.13，推荐 Node.js 24。

## 启动

首次部署将 `.env.example` 复制为 `.env` 并填写模型配置，然后执行：

```powershell
npm start
```

默认监听 `127.0.0.1:3000`，健康检查 `GET /api/health`。根路径 `/` 返回 404，不再提供 HTML。

## 配置

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址；容器或需要直接远程连接时使用 `0.0.0.0` |
| `PORT` | `3000` | API 端口 |
| `PUBLIC_URL` | 空 | 对外访问地址，如 `https://api.example.com`，自动加入 Host、Origin 白名单 |
| `ALLOWED_HOSTS` | 空 | 额外允许的 Host，逗号分隔，非标准端口需包含端口 |
| `ALLOWED_ORIGINS` | 空 | 额外允许的 Origin，逗号分隔 |
| `COOKIE_SECURE` | `false` | HTTPS 浏览器部署可设为 `true`；本地 HTTP 客户端保持 `false` |
| `WORKSPACE_ROOT` | `./workspace` | 工作文件夹，相对后端目录解析 |
| `DATA_DIR` | `./data` | 数据目录，相对后端目录解析 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 支持 Chat Completions 流式输出和工具调用的模型接口 |
| `OPENAI_API_KEY` | 空 | 模型密钥，仅在服务端使用 |
| `OPENAI_MODEL` | `gpt-4.1` | 模型名称 |

环境变量优先于 `.env`。Host/Origin 白名单仍启用，不使用任意来源的跨域授权。前端应通过同源代理访问 API；配置 `ALLOWED_ORIGINS` 本身不会开启 CORS。

## 服务器示例

推荐由 HTTPS 反向代理接收外部连接，Node.js 监听本机 `127.0.0.1:3000`：

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=https://api.example.com
```

反向代理保留实际对外 Host，流式接口关闭缓冲并将读取超时设置为至少 180 秒。只部署网页时也可将静态页面与 API 代理放在同一域名，`PUBLIC_URL` 填写该网页域名。

本地网络直接访问示例：设置 `HOST=0.0.0.0`，并设置 `PUBLIC_URL=http://服务器IP:3000`。不要把 `0.0.0.0` 当成客户端访问地址。

## 数据和运行范围

`data/chats.sqlite` 保存账号、密码哈希、登录会话和历史聊天。停止服务后备份整个 `data/` 文件夹，恢复时一并复制。`.env` 和数据不要放入前端安装包或公开静态目录。

密码只要求非空，账号原样比较且唯一。用户只能查询、继续和删除自己的对话。升级用户系统之前的无主历史仍保留，但不会自动分配给新账号。

Agent 只允许通过文件工具访问工作目录，拒绝越界和符号链接；不支持 shell、自动测试或回滚。工作目录中的文件仍由登录用户共享。全局生成任务锁目前允许一个聊天任务运行。模型读取到的内容会发送给配置的模型服务。
