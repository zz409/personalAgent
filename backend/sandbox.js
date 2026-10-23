import fs from "node:fs/promises";
import path from "node:path";

export async function createSandbox(directory) {
    await fs.mkdir(directory, { recursive: true });
    const root = await fs.realpath(directory);

    async function resolve(name = "") {
        if (
            typeof name !== "string" ||
            name.includes("\0") ||
            name.includes(":")
        )
            throw new Error("无效路径");
        const target = path.resolve(root, name);
        const relative = path.relative(root, target);
        if (relative.startsWith("..") || path.isAbsolute(relative))
            throw new Error("禁止访问工作目录之外的文件");
        let current = root;
        for (const part of relative.split(path.sep).filter(Boolean)) {
            current = path.join(current, part);
            try {
                const stat = await fs.lstat(current);
                if (stat.isSymbolicLink())
                    throw new Error("禁止访问符号链接或目录联接");
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
        return target;
    }

    async function list(name = "") {
        const entries = await fs.readdir(await resolve(name), {
            withFileTypes: true,
        });
        return entries
            .filter(
                (e) =>
                    !e.isSymbolicLink() &&
                    ![".git", "node_modules", ".env"].includes(e.name),
            )
            .map((e) => ({
                name: e.name,
                path: path.posix.join(name.replaceAll("\\", "/"), e.name),
                directory: e.isDirectory(),
            }))
            .sort(
                (a, b) =>
                    Number(b.directory) - Number(a.directory) ||
                    a.name.localeCompare(b.name),
            );
    }

    async function read(name) {
        const target = await resolve(name);
        if (path.basename(target).startsWith(".env"))
            throw new Error("禁止读取密钥配置文件");
        if ((await fs.stat(target)).size > 1024 * 1024)
            throw new Error("文件超过 1 MB");
        return fs.readFile(target, "utf8");
    }

    async function write(name, content) {
        if (
            typeof content !== "string" ||
            Buffer.byteLength(content) > 1024 * 1024
        )
            throw new Error("文件内容无效或超过 1 MB");
        const target = await resolve(name);
        if (path.basename(target).startsWith(".env"))
            throw new Error("禁止修改密钥配置文件");
        await fs.mkdir(path.dirname(target), { recursive: true });
        await resolve(name);
        await fs.writeFile(target, content, "utf8");
        return { path: name, bytes: Buffer.byteLength(content) };
    }

    return { root, resolve, list, read, write };
}
