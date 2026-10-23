import { DatabaseSync } from "node:sqlite";
import {
    randomBytes,
    randomUUID,
    scrypt,
    timingSafeEqual,
    createHash,
} from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

export function createAuthStore(filename) {
    const db = new DatabaseSync(filename);
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            expires_at INTEGER NOT NULL
        );
    `);

    async function register(username, password) {
        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            password.length === 0
        )
            throw new Error("账号必须为文本，密码不能为空");
        const salt = randomBytes(16).toString("hex");
        const hash = await deriveKey(password, salt, 64);
        const id = randomUUID();
        try {
            db.prepare("INSERT INTO users VALUES (?, ?, ?, ?)").run(
                id,
                username,
                salt,
                hash.toString("hex"),
            );
        } catch (error) {
            if (error.message.includes("UNIQUE constraint failed")) {
                const duplicate = new Error("账号已存在");
                duplicate.status = 409;
                throw duplicate;
            }
            throw error;
        }
        return { id, username };
    }

    async function login(username, password) {
        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !password.length
        )
            throw new Error("密码不能为空");
        const user = db
            .prepare("SELECT * FROM users WHERE username = ?")
            .get(username);
        const hash = await deriveKey(
            password,
            user?.salt || "missing-user",
            64,
        );
        if (
            !user ||
            !timingSafeEqual(hash, Buffer.from(user.password_hash, "hex"))
        ) {
            const error = new Error("账号或密码错误");
            error.status = 401;
            throw error;
        }
        return { id: user.id, username: user.username };
    }

    function session(userId) {
        const token = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
            Date.now(),
        );
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
            tokenHash(token),
            userId,
            Date.now() + 30 * 24 * 60 * 60 * 1000,
        );
        return token;
    }

    function authenticate(token) {
        if (!token) return null;
        return (
            db
                .prepare(
                    "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?",
                )
                .get(tokenHash(token), Date.now()) || null
        );
    }

    function logout(token) {
        if (token)
            db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
                tokenHash(token),
            );
    }

    return {
        register,
        login,
        session,
        authenticate,
        logout,
        close: () => db.close(),
    };
}
