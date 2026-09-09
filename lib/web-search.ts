// Tavily ek free web-search API hai jo LLM/RAG apps ke liye specially bani hai
// (free tier: 1000 searches/month, credit card nahi chahiye).
// Docs: https://docs.tavily.com/
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Ye keywords batate hain ki query ke liye "abhi ka" / current jaankari chahiye —
// aisi queries ke liye hi web search call karte hain, har message pe nahi
// (taaki normal chat fast rahe aur free search quota bhi bache).
const LIVE_INFO_KEYWORDS = [
    "current", "latest", "abhi", "aaj", "today", "news", "recent", "kal",
    "yesterday", "this week", "this year", "this month",
    "cm", "pm", "chief minister", "prime minister", "president", "election",
    "score", "match", "price", "rate", "stock", "share market", "weather",
    "mausam", "result", "live", "update", "trending", "hua kya", "kya hua",
];

export function needsLiveSearch(message: string): boolean {
    const lower = message.toLowerCase();
    return LIVE_INFO_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function searchWeb(query: string): Promise<string> {
    if (!TAVILY_API_KEY) return "";

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query,
                search_depth: "basic",
                max_results: 4,
                include_answer: true,
            }),
        });

        if (!res.ok) {
            console.error("Tavily search error:", await res.text());
            return "";
        }

        const json = await res.json();
        const parts: string[] = [];

        if (json.answer) {
            parts.push(`Quick answer: ${json.answer}`);
        }

        for (const r of json.results || []) {
            parts.push(`- ${r.title}: ${String(r.content || "").slice(0, 300)} (source: ${r.url})`);
        }

        return parts.join("\n");
    } catch (error) {
        console.error("searchWeb error:", error);
        return "";
    }
}
