import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { liveSearch } from "@/lib/live-search";
import { embedText } from "@/lib/embeddings";
import { checkEnv } from "@/lib/env-check";
import { DEFAULT_MODEL } from "@/lib/models";
import { TEST_PDF_B64 } from "@/lib/test-pdf";
import { extractPdfText } from "@/lib/pdf-text";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sirf local (npm run dev) mein chalta hai. Live site pe band rehta hai jab tak ENABLE_HEALTH=1 na ho.
// Koi secret key output mein nahi aati — sirf "set / missing", lambai aur status.

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms / 1000}s)`)), ms)),
    ]);
}

async function timed<T>(fn: () => Promise<T>) {
    const t = Date.now();
    try {
        const value = await fn();
        return { ok: true as const, ms: Date.now() - t, value };
    } catch (e) {
        return { ok: false as const, ms: Date.now() - t, error: String((e as any)?.message || e) };
    }
}

async function pdfCheck(): Promise<string> {
    const text = await extractPdfText(Buffer.from(TEST_PDF_B64, "base64"));
    if (!/Madhya Pradesh/.test(text)) throw new Error("PDF se text nahi nikla");
    return "PDF padhna OK";
}

async function ttsBytes(): Promise<number> {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    try {
        await tts.setMetadata("hi-IN-MadhurNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream("नमस्ते, मैं आपका एआई असिस्टेंट हूँ।");
        return await new Promise<number>((resolve, reject) => {
            let bytes = 0;
            let done = false;
            const timer = setTimeout(() => finish(new Error("TTS timeout (20s)")), 20000);
            function finish(err?: Error) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (err) return reject(err);
                bytes > 0 ? resolve(bytes) : reject(new Error("Empty audio"));
            }
            audioStream.on("data", (c: Buffer) => (bytes += c.length));
            audioStream.on("error", (e: Error) => finish(e));
            audioStream.on("end", () => finish());
            audioStream.on("close", () => finish());
        });
    } finally {
        try {
            tts.close();
        } catch {}
    }
}

async function supabaseCheck(): Promise<string> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env variables missing");
    const host = new URL(url).host;
    const client = createClient(url, key);
    const { count, error } = await client.from("documents").select("id", { count: "exact", head: true });
    if (error) throw new Error(`${host}: ${error.message}`);
    return `${host} OK, documents rows = ${count}`;
}

async function embeddingCheck(): Promise<string> {
    const v: any = await embedText("namaste");
    return `embedding OK, dimensions = ${Array.isArray(v) ? v.length : "?"}`;
}

async function chatModelCheck(): Promise<string> {
    const base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: 8, messages: [{ role: "user", content: "Say OK" }] }),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`model ${DEFAULT_MODEL}: HTTP ${res.status} ${(await res.text()).slice(0, 140)}`);
    return `model ${DEFAULT_MODEL} chal raha hai`;
}

export async function GET() {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_HEALTH !== "1") {
        return NextResponse.json({ error: "disabled" }, { status: 404 });
    }

    const tav = process.env.TAVILY_API_KEY || "";
    const or = process.env.OPENROUTER_API_KEY || "";
    const gem = process.env.GEMINI_API_KEY || "";

    const [live, tts, supa, emb, chat, pdf] = await Promise.all([
        timed(() => withTimeout(liveSearch("mp ke cm kon hai"), 20000, "liveSearch")),
        timed(ttsBytes),
        timed(() => withTimeout(supabaseCheck(), 15000, "supabase")),
        timed(() => withTimeout(embeddingCheck(), 15000, "embedding")),
        timed(() => withTimeout(chatModelCheck(), 22000, "chat model")),
        timed(() => withTimeout(pdfCheck(), 15000, "pdf")),
    ]);

    return NextResponse.json({
        env: {
            TAVILY_API_KEY: tav ? `set (length ${tav.length}, starts with ${tav.slice(0, 5)})` : "MISSING",
            OPENROUTER_API_KEY: or ? `set (length ${or.length}, starts with ${or.slice(0, 9)})` : "MISSING",
            AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY ? "set (voice ke liye official Azure pehle try hoga)" : "not set (free msedge-tts use hoga)",
            GEMINI_API_KEY: gem ? `set (length ${gem.length}, starts with ${gem.slice(0, 4)})` : "MISSING",
        },
        envProblems: checkEnv().length ? checkEnv() : "sab theek hai",
        chatModel: chat.ok ? { ok: true, ms: chat.ms, info: chat.value } : chat,
        pdf: pdf.ok ? { ok: true, ms: pdf.ms, info: pdf.value } : pdf,
        liveSearch: live.ok
            ? { ok: true, ms: live.ms, chars: live.value.length, preview: live.value.slice(0, 300) || "(khaali)" }
            : live,
        voice: tts.ok ? { ok: true, ms: tts.ms, audioBytes: tts.value } : tts,
        supabase: supa.ok ? { ok: true, ms: supa.ms, info: supa.value } : supa,
        embeddings: emb.ok ? { ok: true, ms: emb.ms, info: emb.value } : emb,
    });
}
