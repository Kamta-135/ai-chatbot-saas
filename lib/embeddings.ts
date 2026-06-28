const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
}

export async function embedText(text: string): Promise<number[]> {
    // Embedding model ka token limit hai ~8000 tokens (~32000 chars)
    // Safety ke liye text ko trim karte hain
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 30000);

    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
            model: "openai/text-embedding-3-small",
            input: cleaned,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error("Embedding error:", err);
        throw new Error("Failed to generate embedding");
    }

    const json = await res.json();
    const embedding = json.data?.[0]?.embedding as number[] | undefined;

    if (!embedding) {
        throw new Error("No embedding returned from OpenRouter");
    }

    return embedding;
}
