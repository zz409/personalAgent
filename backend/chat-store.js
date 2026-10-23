import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export function createChatStore(filename) {
    const db = new DatabaseSync(filename);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'complete',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
        UPDATE messages SET status = 'interrupted' WHERE status = 'streaming';
    `);

    if (
        !db
            .prepare("PRAGMA table_info(conversations)")
            .all()
            .some((column) => column.name === "user_id")
    )
        db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT");
    db.exec(
        "CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id, updated_at)",
    );

    function create(userId = null) {
        const id = randomUUID();
        db.prepare(
            "INSERT INTO conversations (id, title, updated_at, user_id) VALUES (?, ?, ?, ?)",
        ).run(id, "新对话", Date.now(), userId);
        return get(id, userId);
    }

    function list(userId = null) {
        return db
            .prepare(
                "SELECT * FROM conversations WHERE user_id IS ? ORDER BY updated_at DESC, rowid DESC",
            )
            .all(userId);
    }

    function get(id, userId = null) {
        const conversation = db
            .prepare(
                "SELECT * FROM conversations WHERE id = ? AND user_id IS ?",
            )
            .get(id, userId);
        if (!conversation) return null;
        conversation.messages = db
            .prepare(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id",
            )
            .all(id);
        return conversation;
    }

    function append(id, role, content, status = "complete") {
        const now = Date.now();
        db.exec("BEGIN");
        try {
            const result = db
                .prepare(
                    "INSERT INTO messages (conversation_id, role, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
                )
                .run(id, role, content, status, now);
            if (role === "user") {
                db.prepare(
                    "UPDATE conversations SET title = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = ? AND role = 'user' AND id <> ?)",
                ).run(
                    content.replace(/\s+/g, " ").trim().slice(0, 48),
                    id,
                    id,
                    result.lastInsertRowid,
                );
            }
            db.prepare(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
            ).run(now, id);
            db.exec("COMMIT");
            return Number(result.lastInsertRowid);
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    function update(id, content, status) {
        db.prepare(
            "UPDATE messages SET content = ?, status = ? WHERE id = ?",
        ).run(content, status, id);
    }

    function remove(id, userId = null) {
        if (!get(id, userId)) return false;
        db.exec("BEGIN");
        try {
            db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(
                id,
            );
            const result = db
                .prepare("DELETE FROM conversations WHERE id = ?")
                .run(id);
            db.exec("COMMIT");
            return result.changes > 0;
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    return {
        create,
        list,
        get,
        append,
        update,
        remove,
        close: () => db.close(),
    };
}
