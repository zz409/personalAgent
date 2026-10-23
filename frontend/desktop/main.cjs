const { app, BrowserWindow, dialog, Menu, session } = require("electron");
const path = require("node:path");
const { createGateway } = require("./gateway.cjs");
const { loadDesktopConfig } = require("./config.cjs");

let gateway;
let window;

async function createWindow() {
    window = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 720,
        minHeight: 540,
        title: "Personal Agent",
        backgroundColor: "#101114",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            partition: "persist:personal-agent",
        },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== gateway.origin) event.preventDefault();
    });
    window.webContents.on("will-redirect", (event, url) => {
        if (new URL(url).origin !== gateway.origin) event.preventDefault();
    });
    window.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
    );
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
        window = null;
    });
    await window.loadURL(gateway.origin);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (window?.isMinimized()) window.restore();
        window?.show();
        window?.focus();
    });
    app.whenReady()
        .then(async () => {
            const configPath = path.join(
                app.getPath("userData"),
                "desktop-config.json",
            );
            const { config, changedBackend } = await loadDesktopConfig(
                configPath,
                path.join(__dirname, "..", "config.json"),
            );
            if (changedBackend) {
                await session.fromPartition("persist:personal-agent").clearStorageData({
                    storages: ["cookies", "localstorage"],
                });
            }
            const override = process.argv
                .find((arg) => arg.startsWith("--backend-url="))
                ?.slice(14);
            gateway = await createGateway(
                path.join(__dirname, "..", "public"),
                override ||
                    process.env.DESKTOP_BACKEND_URL ||
                    config.backendUrl,
            );
            Menu.setApplicationMenu(
                Menu.buildFromTemplate([
                    {
                        label: "应用",
                        submenu: [
                            { label: "刷新", role: "reload" },
                            { label: "重置缩放", role: "resetZoom" },
                            { label: "放大", role: "zoomIn" },
                            { label: "缩小", role: "zoomOut" },
                            { type: "separator" },
                            { label: "退出", role: "quit" },
                        ],
                    },
                ]),
            );
            await createWindow();
        })
        .catch((error) => {
            dialog.showErrorBox("Personal Agent 启动失败", error.message);
            app.quit();
        });
    app.on("activate", () => {
        if (!window && gateway)
            createWindow().catch((error) =>
                dialog.showErrorBox("窗口打开失败", error.message),
            );
    });
    app.on("window-all-closed", () => app.quit());
    app.on("before-quit", () => gateway?.close());
}
