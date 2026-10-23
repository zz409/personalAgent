const fs = require("node:fs/promises");
const path = require("node:path");

async function loadDesktopConfig(configPath, defaultsPath) {
    const defaults = JSON.parse(await fs.readFile(defaultsPath, "utf8"));
    let config;
    let changedBackend = false;
    let save = false;
    try {
        config = JSON.parse(await fs.readFile(configPath, "utf8"));
        const legacyBackends = new Set([
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:3001",
            "http://localhost:3001",
        ]);
        if (legacyBackends.has(new URL(config.backendUrl).origin)
            && new URL(defaults.backendUrl).origin !== new URL(config.backendUrl).origin) {
            config.backendUrl = defaults.backendUrl;
            changedBackend = true;
            save = true;
        }
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        config = defaults;
        save = true;
    }

    if (save) {
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(config, null, 4));
    }
    return { config, changedBackend };
}

module.exports = { loadDesktopConfig };
