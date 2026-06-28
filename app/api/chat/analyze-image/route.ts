import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const { image, question } = await req.json();

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: question || "Is image mein kya hai, detail mein batao." },
                            { type: "image_url", image_url: { url: image } },
                        ],
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter error:", data);
            return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
        }

        const answer = data.choices?.[0]?.message?.content ?? "Sorry, image samajh nahi paaya.";
        return NextResponse.json({ answer });
    } catch (err) {
        console.error("analyze-image error:", err);
        return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
}
