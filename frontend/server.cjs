const fs = require("node:fs/promises");
const path = require("node:path");
const { createGateway } = require("./desktop/gateway.cjs");

async function start() {
    const config = JSON.parse(
        await fs.readFile(path.join(__dirname, "config.json"), "utf8"),
    );
    const backendUrl = process.env.BACKEND_URL || config.backendUrl;
    const port = Number(process.env.FRONTEND_PORT || 5173);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("FRONTEND_PORT 必须为 1 到 65535 的整数");
    const gateway = await createGateway(
        path.join(__dirname, "public"),
        backendUrl,
        { port },
    );
    console.log(`Frontend: ${gateway.origin}\nBackend: ${backendUrl}`);
    const stop = () => {
        gateway.close();
        process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
}

start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
