// OpenRouter ki streaming (SSE) reply ko seedha plain-text stream mein badalta hai, taaki
// browser mein jawab ChatGPT ki tarah shabd-shabd karke turant dikhne lage (30 sec wait nahi).
// Poora jawab ban jaane par onDone(fullText) chalta hai (Supabase mein save karne ke liye).

export function sseToTextStream(
    upstream: Response,
    onDone: (fullText: string) => void | Promise<void>
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    let cancelled = false;

    function handleLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
        const t = line.trim();
        if (!t.startsWith("data:")) return; // ": OPENROUTER PROCESSING" jaisi comment lines skip
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
                full += delta;
                try {
                    controller.enqueue(encoder.encode(delta));
                } catch {
                    cancelled = true;
                }
            }
        } catch {
            // adhoora ya non-JSON chunk, ignore
        }
    }

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = upstream.body!.getReader();
            try {
                while (!cancelled) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";
                    for (const l of lines) handleLine(l, controller);
                }
                buffer += decoder.decode();
                if (buffer && !cancelled) handleLine(buffer, controller);
            } catch (e) {
                console.error("[stream] read error:", e);
            } finally {
                try {
                    await onDone(full);
                } catch (e) {
                    console.error("[stream] onDone error:", e);
                }
                try {
                    controller.close();
                } catch {}
            }
        },
        cancel() {
            cancelled = true;
        },
    });
}
