// Live web search (Tavily). Hinglish sawaal ko pehle chhoti English search query mein badalta hai
// (jaise "mp ke cm kon hai" -> "current Chief Minister of Madhya Pradesh 2026"), phir Tavily se
// seedha answer + sources leta hai. Isse purane/galat pages ka asar bahut kam ho jaata hai.

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const TAVILY_BASE_URL = process.env.TAVILY_BASE_URL || "https://api.tavily.com";

// Sirf Hindi / Hinglish sawaal ko English search query chahiye. Seedhe English sawaal par ye extra call skip.
const HINGLISH_HINTS = /\b(hai|hain|kya|kaun|kon|kaise|kab|kahan|kitna|ke|ki|ka|ko|mein|aaj|abhi|batao|bata|nahi|mp|up|cm|pm)\b/i;
function needsRewrite(message: string): boolean {
    return /[\u0900-\u097F]/.test(message) || HINGLISH_HINTS.test(message);
}

async function rewriteQuery(message: string): Promise<string> {
    if (!OPENROUTER_API_KEY) return message;
    if (!needsRewrite(message)) return message;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const year = new Date().getFullYear();
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
                model: process.env.SEARCH_REWRITE_MODEL || "openai/gpt-4.1-mini",
                temperature: 0,
                max_tokens: 40,
                messages: [
                    {
                        role: "system",
                        content: `Rewrite the user's message as ONE short English web search query. Translate Hindi/Hinglish to English. Expand abbreviations (MP = Madhya Pradesh, CM = chief minister, PM = prime minister, UP = Uttar Pradesh). Add the year ${year} when the question is about something current. Output only the query, nothing else.`,
                    },
                    { role: "user", content: message },
                ],
            }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return message;
        const data = await res.json();
        const q = String(data.choices?.[0]?.message?.content ?? "")
            .replace(/^["'\s]+|["'\s]+$/g, "")
            .trim();
        return q || message;
    } catch {
        return message;
    }
}

export async function liveSearch(message: string): Promise<string> {
    if (!TAVILY_API_KEY) {
        console.warn("[live-search] TAVILY_API_KEY set nahi hai (.env.local), live search skip ho gaya");
        return "";
    }

    const t0 = Date.now();
    const query = await rewriteQuery(message);

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(`${TAVILY_BASE_URL}/search`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${TAVILY_API_KEY}`,
            },
            body: JSON.stringify({
                query,
                search_depth: "basic",
                include_answer: true,
                max_results: 4,
                topic: "general",
            }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            const errText = await res.text();
            console.error("[live-search] Tavily error:", res.status, errText.slice(0, 300));
            return "";
        }

        const data = await res.json();
        const results: any[] = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
        const parts: string[] = [];

        if (data.answer) {
            parts.push(`DIRECT ANSWER FROM SEARCH ENGINE: ${String(data.answer).slice(0, 800)}`);
        }
        results.forEach((r, i) => {
            const date = r.published_date ? ` [${r.published_date}]` : "";
            parts.push(`[${i + 1}] ${r.title} (${r.url})${date}\n${String(r.content || "").slice(0, 500)}`);
        });

        console.log(
            `[live-search] query="${query}" | answer=${data.answer ? "yes" : "no"} | sources=${results.length} | ${Date.now() - t0}ms`
        );
        return parts.join("\n\n");
    } catch (e) {
        console.error("[live-search] request failed:", e);
        return "";
    }
}
