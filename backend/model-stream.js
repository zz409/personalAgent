export async function readModelStream(response, onDelta) {
    const decoder = new TextDecoder();
    const calls = new Map();
    let pending = "";
    let content = "";
    let finished = false;
    let finishReason = null;

    function consume(line) {
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data) return;
        if (data === "[DONE]") {
            finished = true;
            return;
        }

        const event = JSON.parse(data);
        if (event.error) throw new Error("模型流返回错误，请检查服务商状态");
        const choice = event.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta || {};
        if (delta.content) {
            content += delta.content;
            onDelta(delta.content);
        }

        for (const part of delta.tool_calls || []) {
            if (!Number.isInteger(part.index)) throw new Error("工具流缺少索引");
            const call = calls.get(part.index) || {
                id: "",
                type: "function",
                function: { name: "", arguments: "" },
            };
            if (part.id) call.id += part.id;
            if (part.function?.name) call.function.name += part.function.name;
            if (part.function?.arguments)
                call.function.arguments += part.function.arguments;
            calls.set(part.index, call);
        }
    }

    if (!response.body) throw new Error("模型接口未返回响应流");
    for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) consume(line.replace(/\r$/, ""));
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending.replace(/\r$/, ""));
    if (!finished || !finishReason)
        throw new Error("模型流意外中断，已收到的内容已保留，请重试");
    if (!["stop", "tool_calls"].includes(finishReason))
        throw new Error(`模型输出未完成（${finishReason}），请重试或缩小任务范围`);

    const message = { role: "assistant", content: content || null };
    if (calls.size) {
        message.tool_calls = [...calls.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, call]) => call);
        for (const call of message.tool_calls) {
            if (!call.id || !call.function.name)
                throw new Error("模型返回的工具调用不完整");
            JSON.parse(call.function.arguments);
        }
    }
    return message;
}
