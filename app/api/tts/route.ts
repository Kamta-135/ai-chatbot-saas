import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
// Indian male neural voices (.env.local mein TTS_VOICE_HI / TTS_VOICE_EN se badal sakte ho)
const VOICE_HI = process.env.TTS_VOICE_HI || "hi-IN-MadhurNeural";
const VOICE_EN = process.env.TTS_VOICE_EN || "en-IN-PrabhatNeural";
const MAX_CHARS = 2500;

const HINGLISH_WORDS = new Set([
    "hai", "hain", "hoon", "tha", "thi", "hoga", "hogi", "nahi", "nahin", "nhi",
    "kya", "kyu", "kyun", "kaise", "kaisa", "kaisi", "kaun", "kon", "kab", "kahan", "kitna", "kitni", "kitne",
    "aap", "tum", "mera", "meri", "mere", "mujhe", "apna", "apni",
    "ka", "ki", "ke", "ko", "mein", "aur", "lekin", "bhi", "toh", "ye", "yeh", "wo", "woh",
    "batao", "bata", "samjhao", "karo", "karna", "dena", "chahiye", "abhi", "aaj", "bhai",
    "bahut", "kuch", "koi", "wala", "wali", "wale", "liye", "kaam", "raha", "rahi",
]);

function looksHinglish(text: string) {
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    return words.filter((w) => HINGLISH_WORDS.has(w)).length >= 2;
}

// Markdown, code, links, emoji hatao taaki awaaz sirf padhne layak text bole
function cleanForSpeech(input: string) {
    const stripped = input
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/^\s{0,3}#{1,6}\s*/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*(\d+)[.)]\s+/gm, "$1, ")
        .replace(/[*_~|>]/g, " ")
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ");

    let t = stripped
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (/[.!?\u0964:;,]$/.test(l) ? l : l + "."))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    if (t.length > MAX_CHARS) {
        const cut = t.slice(0, MAX_CHARS);
        const last = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\u0964"), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
        t = last > 500 ? cut.slice(0, last + 1) : cut;
    }
    return t;
}

// Roman Hinglish ko Devanagari Hindi mein badlo, taaki Hindi voice saaf bole
async function toDevanagari(text: string): Promise<string | null> {
    if (!OPENROUTER_API_KEY) return null;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
                model: process.env.TTS_CONVERT_MODEL || "openai/gpt-4.1-mini",
                temperature: 0,
                max_tokens: 2000,
                messages: [
                    {
                        role: "system",
                        content:
                            "You convert Hinglish (Hindi written in Roman letters) into Hindi written in Devanagari script, for a text-to-speech engine. Keep the meaning and every sentence exactly the same. Write English words in Devanagari phonetically, the way an Indian would pronounce them. Keep numbers as digits. Output ONLY the converted text, nothing else.",
                    },
                    { role: "user", content: text },
                ],
            }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.error("[tts] hinglish convert failed:", res.status);
            return null;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
        console.error("[tts] hinglish convert error:", e);
        return null;
    }
}

// ---- Option 1 (official, zyada bharosemand): Azure Speech. AZURE_SPEECH_KEY + AZURE_SPEECH_REGION set ho to pehle yahi ----
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_BASE_URL = process.env.AZURE_TTS_BASE_URL || (AZURE_REGION ? `https://${AZURE_REGION}.tts.speech.microsoft.com` : "");

function xmlEscape(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function synthesizeAzure(text: string, voice: string): Promise<Buffer> {
    const lang = voice.split("-").slice(0, 2).join("-");
    const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${xmlEscape(text)}</voice></speak>`;
    const res = await fetch(`${AZURE_BASE_URL}/cognitiveservices/v1`, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": AZURE_KEY || "",
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "nexora-chatbot",
        },
        body: ssml,
        signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Azure Speech HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error("Azure Speech: khaali audio aaya");
    return buf;
}

// ---- Option 2 (free, unofficial): msedge-tts. Sirf zaroorat par load hota hai ----
async function synthesizeEdge(text: string, voice: string): Promise<Buffer> {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text);
        return await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let done = false;
            const timer = setTimeout(() => finish(new Error("TTS timeout")), 25000);
            function finish(err?: Error) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (err) return reject(err);
                if (!chunks.length) return reject(new Error("Empty audio"));
                resolve(Buffer.concat(chunks));
            }
            audioStream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
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

async function synthesize(text: string, voice: string): Promise<Buffer> {
    const errors: string[] = [];
    if (AZURE_KEY && AZURE_BASE_URL) {
        try {
            return await synthesizeAzure(text, voice);
        } catch (e) {
            errors.push(String((e as any)?.message || e));
            console.error("[tts] Azure fail, msedge-tts try kar raha hoon:", e);
        }
    }
    try {
        return await synthesizeEdge(text, voice);
    } catch (e) {
        errors.push("msedge-tts: " + String((e as any)?.message || e));
        throw new Error(errors.join(" | "));
    }
}

export async function POST(req: NextRequest) {
    try {
        const ip = getClientIp(req);
        if (isRateLimited(`tts:${ip}`, 150, 60_000)) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const { text } = await req.json();
        if (typeof text !== "string" || !text.trim()) {
            return NextResponse.json({ error: "text is required" }, { status: 400 });
        }

        let speech = cleanForSpeech(text);
        if (!speech) {
            return NextResponse.json({ error: "nothing to speak" }, { status: 400 });
        }

        let voice = VOICE_EN;
        if (/[\u0900-\u097F]/.test(speech)) {
            voice = VOICE_HI;
        } else if (looksHinglish(speech)) {
            const dev = await toDevanagari(speech);
            if (dev && /[\u0900-\u097F]/.test(dev)) {
                speech = dev;
                voice = VOICE_HI;
            }
        }

        console.log(`[tts] voice=${voice} chars=${speech.length}`);
        const audio = await synthesize(speech, voice);
        return new Response(new Uint8Array(audio), {
            status: 200,
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
    } catch (e) {
        console.error("[tts] error:", e);
        // detail se pata chalta hai ki Vercel par awaaz kyun nahi bani (isme koi secret nahi hota)
        return NextResponse.json(
            { error: "TTS failed", detail: String((e as any)?.message || e).slice(0, 300) },
            { status: 500 }
        );
    }
}
