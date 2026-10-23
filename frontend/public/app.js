const $ = (id) => document.getElementById(id);
let currentUser = null;
let registering = false;
const activity = document.createElement("div");
activity.id = "activity";
activity.setAttribute("role", "status");
activity.setAttribute("aria-live", "polite");
activity.hidden = true;

function setActivity(text = "") {
    activity.textContent = text;
    activity.hidden = !text;
    if (text) {
        $("messages").append(activity);
        activity.scrollIntoView({ block: "end" });
    } else activity.remove();
}

let activeConversation = null,
    controller = null,
    busy = false;

async function api(url, options) {
    const r = await fetch(url, options);
    const data = await r.json();
    if (r.status === 401 && !url.startsWith("/api/auth/")) showLogin();
    if (!r.ok) throw new Error(data.error || "请求失败");
    return data;
}

function toolMessage(text, error = false) {
    const element = document.createElement("div");
    element.className = error ? "tool error" : "tool";
    element.textContent = text;
    $("messages").append(element);
    return element;
}

async function refreshConversations() {
    const conversations = await api("/api/conversations");
    $("conversations").replaceChildren();
    for (const conversation of conversations) {
        const row = document.createElement("div");
        row.className = "conversation-row";
        const button = document.createElement("button");
        button.className = "conversation";
        button.classList.toggle(
            "active",
            conversation.id === activeConversation,
        );
        button.textContent = conversation.title;
        button.title = conversation.title;
        button.setAttribute(
            "aria-current",
            conversation.id === activeConversation ? "true" : "false",
        );
        button.onclick = () =>
            openConversation(conversation.id).catch((e) => {
                setActivity(e.message);
            });
        const remove = document.createElement("button");
        remove.className = "delete-conversation";
        remove.textContent = "×";
        remove.title = "删除对话";
        remove.setAttribute("aria-label", `删除对话：${conversation.title}`);
        remove.onclick = () => deleteConversation(conversation);
        row.append(button, remove);
        $("conversations").append(row);
    }
    if (!conversations.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = "发送第一条消息，开始记录";
        $("conversations").append(empty);
    }
    return conversations;
}

async function deleteConversation(conversation) {
    if (busy) {
        setActivity("请等待当前操作完成，或停止回复后再删除");
        return;
    }
    if (!await confirmDeletion()) return;
    if (busy || !currentUser) return;
    busy = true;
    $("send").disabled = true;
    $("new").disabled = true;
    try {
        await api(`/api/conversations/${conversation.id}`, {
            method: "DELETE",
        });
        if (activeConversation === conversation.id) {
            activeConversation = null;
            localStorage.removeItem(`activeConversation:${currentUser.id}`);
            $("messages").replaceChildren();
            $("prompt").value = "";
        }
        await refreshConversations();
        setActivity();
    } catch (error) {
        setActivity(error.message);
    } finally {
        busy = false;
        $("send").disabled = false;
        $("new").disabled = false;
    }
}

function confirmDeletion() {
    const dialog = $("delete-dialog");
    if (dialog.open) return Promise.resolve(false);
    dialog.returnValue = "cancel";
    return new Promise((resolve) => {
        dialog.addEventListener("close", () => {
            resolve(dialog.returnValue === "delete");
        }, { once: true });
        dialog.showModal();
    });
}

function renderConversation(conversation) {
    $("messages").replaceChildren();
    for (const entry of conversation.messages) {
        if (["user", "assistant"].includes(entry.role)) {
            message(entry.role, entry.content);
            if (entry.status !== "complete")
                toolMessage("这条回复未完成", true);
        } else toolMessage(entry.content, entry.role === "error");
    }
    $("messages").lastElementChild?.scrollIntoView({ block: "end" });
}

async function openConversation(id) {
    if (busy) return;
    busy = true;
    $("send").disabled = true;
    $("new").disabled = true;
    try {
        const conversation = await api(`/api/conversations/${id}`);
        activeConversation = id;
        localStorage.setItem(`activeConversation:${currentUser.id}`, id);
        renderConversation(conversation);
        setActivity();
        await refreshConversations();
    } finally {
        busy = false;
        $("send").disabled = false;
        $("new").disabled = false;
    }
}

function message(role, text) {
    $("welcome")?.remove();
    const box = document.createElement("div");
    box.className = `message ${role}`;
    const content = document.createElement("div");
    content.textContent = text;
    box.append(content);
    $("messages").append(box);
    box.scrollIntoView({ block: "end" });
    return content;
}

async function tree(parent = $("tree"), path = "", depth = 0) {
    const files = await api(`/api/files?path=${encodeURIComponent(path)}`);
    parent.replaceChildren();
    for (const file of files) {
        const row = document.createElement(file.directory ? "button" : "div");
        row.className = `file ${file.directory ? "folder" : ""}`;
        row.style.paddingLeft = `${8 + depth * 12}px`;
        row.textContent = `${file.directory ? "▸" : "·"} ${file.name}`;
        parent.append(row);
        if (file.directory) {
            const children = document.createElement("div");
            parent.append(children);
            let open = false;
            row.onclick = async () => {
                try {
                    open = !open;
                    row.textContent = `${open ? "▾" : "▸"} ${file.name}`;
                    if (open) await tree(children, file.path, depth + 1);
                    else children.replaceChildren();
                } catch (e) {
                    setActivity(e.message);
                }
            };
        }
    }
}

$("refresh").onclick = () => tree().catch((e) => setActivity(e.message));

$("new").onclick = () => {
    if (busy) return;
    activeConversation = null;
    localStorage.removeItem(`activeConversation:${currentUser.id}`);
    $("messages").replaceChildren();
    setActivity();
    $("prompt").value = "";
    refreshConversations().catch((e) => setActivity(e.message));
};

document.querySelectorAll(".suggestions button").forEach(
    (b) =>
        (b.onclick = () => {
            $("prompt").value = b.textContent;
            $("prompt").focus();
        }),
);

$("stop").onclick = () => controller?.abort();

$("prompt").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $("composer").requestSubmit();
    }
};

$("composer").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("prompt").value.trim();
    if (!text || busy || !currentUser) return;
    busy = true;
    controller = new AbortController();
    $("send").disabled = true;
    $("new").disabled = true;
    $("stop").hidden = false;
    message("user", text);
    $("prompt").value = "";
    setActivity("思考中…");
    let currentMessage = null;
    let completed = false;
    let failure = "";
    try {
        if (!activeConversation) {
            const conversation = await api("/api/conversations", {
                method: "POST",
            });
            activeConversation = conversation.id;
            localStorage.setItem(
                `activeConversation:${currentUser.id}`,
                activeConversation,
            );
        }
        const r = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: activeConversation, text }),
            signal: controller.signal,
        });
        if (!r.ok) {
            const data = await r.json();
            if (r.status === 401) showLogin();
            throw new Error(data.error);
        }
        refreshConversations().catch((e) => setActivity(e.message));
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value || new Uint8Array(), {
                stream: !done,
            });
            const lines = pending.split("\n");
            pending = done ? "" : lines.pop();
            for (const line of lines) {
                if (!line) continue;
                const event = JSON.parse(line);
                if (event.type === "status") setActivity("思考中…");
                if (event.type === "message_start") currentMessage = null;
                if (event.type === "delta") {
                    if (!currentMessage) {
                        currentMessage = message("assistant", "");
                    }
                    currentMessage.append(document.createTextNode(event.text));
                    currentMessage.scrollIntoView({ block: "end" });
                    setActivity();
                }
                if (event.type === "message_end") currentMessage = null;
                if (event.type === "done") completed = true;
                if (event.type === "tool") {
                    setActivity();
                    const el = toolMessage(
                        `${event.name} · ${event.path || "工作目录"}`,
                    );
                    el.scrollIntoView({ block: "end" });
                    setActivity(
                        `正在调用工具：${event.name} · ${event.path || "工作目录"}`,
                    );
                }
                if (event.type === "changed")
                    tree().catch((e) => setActivity(e.message));
                if (event.type === "error") throw new Error(event.text);
            }
            if (done) break;
        }

        if (!completed) throw new Error("连接意外中断，已收到的回复已保留");
        setActivity();
    } catch (e) {
        failure =
            e.name === "AbortError"
                ? "已停止；已完成的文件修改会保留"
                : e.message;
        setActivity(failure);
    } finally {
        if (activeConversation && currentUser) {
            try {
                renderConversation(
                    await api(`/api/conversations/${activeConversation}`),
                );
                await refreshConversations();
            } catch (error) {
                failure = `历史记录加载失败：${error.message}`;
            }
        }
        setActivity(failure);
        busy = false;
        $("send").disabled = false;
        $("new").disabled = false;
        $("stop").hidden = true;
        controller = null;
    }
};

async function initializeWorkspace() {
    await Promise.all([
        api("/api/config").then((c) => {
            $("model").textContent = c.model;
            $("workspace").textContent = c.workspace;
            if (!c.configured)
                setActivity("尚未配置模型密钥，请参考 README 创建 .env");
        }),
        tree(),
        refreshConversations().then(async (conversations) => {
            const saved = localStorage.getItem(
                `activeConversation:${currentUser.id}`,
            );
            const selected =
                conversations.find((entry) => entry.id === saved) ||
                conversations[0];
            if (selected) await openConversation(selected.id);
        }),
    ]);
}

function showLogin() {
    controller?.abort();
    currentUser = null;
    activeConversation = null;
    $("messages").replaceChildren();
    $("conversations").replaceChildren();
    $("tree").replaceChildren();
    $("prompt").value = "";
    $("password").value = "";
    $("current-user").textContent = "";
    setActivity();
    document.body.classList.add("logged-out");
    $("auth-panel").hidden = false;
}

async function enterWorkspace(user) {
    currentUser = user;
    document.body.classList.remove("logged-out");
    $("auth-panel").hidden = true;
    $("current-user").textContent = user.username || "（空账号）";
    $("password").value = "";
    try {
        await initializeWorkspace();
    } catch (error) {
        setActivity(error.message);
    }
}

$("auth-toggle").onclick = () => {
    registering = !registering;
    $("auth-title").textContent = registering ? "创建你的账号" : "登录你的账号";
    $("auth-submit").textContent = registering ? "注册并登录" : "登录";
    $("auth-toggle").textContent = registering
        ? "已有账号？登录"
        : "没有账号？注册";
    $("password").autocomplete = registering
        ? "new-password"
        : "current-password";
    $("auth-error").textContent = "";
};

$("auth-form").onsubmit = async (event) => {
    event.preventDefault();
    $("auth-submit").disabled = true;
    $("auth-toggle").disabled = true;
    $("auth-error").textContent = "";
    try {
        const user = await api(
            registering ? "/api/auth/register" : "/api/auth/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: $("username").value,
                    password: $("password").value,
                }),
            },
        );
        await enterWorkspace(user);
    } catch (error) {
        $("auth-error").textContent = error.message;
    } finally {
        $("auth-submit").disabled = false;
        $("auth-toggle").disabled = false;
    }
};

$("logout").onclick = async () => {
    if (busy) {
        setActivity("请先停止回复或等待当前操作完成，再退出登录");
        return;
    }
    $("logout").disabled = true;
    try {
        await api("/api/auth/logout", { method: "POST" });
        showLogin();
    } catch (error) {
        setActivity(error.message);
    } finally {
        $("logout").disabled = false;
    }
};

api("/api/auth/me")
    .then(enterWorkspace)
    .catch((error) => {
        showLogin();
        if (error.message !== "请先登录")
            $("auth-error").textContent = error.message;
    });
