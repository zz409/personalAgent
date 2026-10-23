const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");

async function createGateway(publicDirectory, backendAddress, options = {}) {
    const backend = new URL(backendAddress);
    if (
        !["http:", "https:"].includes(backend.protocol) ||
        backend.username ||
        backend.password
    )
        throw new Error("后端地址必须为不含账号密码的 HTTP 或 HTTPS 地址");
    if (backend.pathname !== "/" || backend.search || backend.hash)
        throw new Error(
            "后端地址仅支持协议、主机和端口，例如 http://127.0.0.1:3000",
        );
    const sockets = new Set();
    let origin;

    const server = http.createServer(async (request, response) => {
        const fail = (status, message) => {
            if (response.headersSent) return response.destroy();
            response.writeHead(status, {
                "Content-Type": "application/json; charset=utf-8",
            });
            response.end(JSON.stringify({ error: message }));
        };
        try {
            const port = new URL(origin).port;
            const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
            const allowedOrigins = allowedHosts.map((host) => `http://${host}`);
            if (!allowedHosts.includes(request.headers.host))
                return fail(403, "不允许的 Host");
            if (
                request.headers.origin &&
                !allowedOrigins.includes(request.headers.origin)
            )
                return fail(403, "不允许跨站请求");
            const url = new URL(request.url, origin);
            if (url.pathname.startsWith("/api/")) {
                const transport = backend.protocol === "https:" ? https : http;
                const headers = { ...request.headers, host: backend.host };
                delete headers.connection;
                delete headers["proxy-authorization"];
                if (headers.origin) headers.origin = backend.origin;
                delete headers.referer;
                const upstream = transport.request(
                    new URL(url.pathname + url.search, backend),
                    {
                        method: request.method,
                        headers,
                    },
                    (incoming) => {
                        const outgoingHeaders = { ...incoming.headers };
                        delete outgoingHeaders.connection;
                        response.writeHead(
                            incoming.statusCode,
                            outgoingHeaders,
                        );
                        incoming.on("error", () => response.destroy());
                        incoming.pipe(response);
                    },
                );
                upstream.setTimeout(150000, () =>
                    upstream.destroy(new Error("后端响应超时")),
                );
                upstream.on("error", () =>
                    fail(
                        502,
                        `无法连接后端 ${backend.origin}，请检查后端地址及服务状态`,
                    ),
                );
                request.on("aborted", () => upstream.destroy());
                response.on("close", () => upstream.destroy());
                request.pipe(upstream);
                return;
            }
            const assets = {
                "/": ["index.html", "text/html"],
                "/app.js": ["app.js", "text/javascript"],
                "/style.css": ["style.css", "text/css"],
            };
            const asset =
                Object.hasOwn(assets, url.pathname) && assets[url.pathname];
            if (request.method !== "GET" || !asset)
                return fail(404, "未找到资源");
            const content = await fs.readFile(
                path.join(publicDirectory, asset[0]),
            );
            response.writeHead(200, {
                "Content-Type": `${asset[1]}; charset=utf-8`,
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy":
                    "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
            });
            response.end(content);
        } catch {
            fail(500, "前端服务处理请求失败");
        }
    });
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    return {
        origin,
        close() {
            server.close();
            for (const socket of sockets) socket.destroy();
        },
    };
}

module.exports = { createGateway };
