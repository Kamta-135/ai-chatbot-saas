import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ text: "" });
    }
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Convert the given Hinglish text (Hindi written in Roman letters) into Hindi Devanagari script for text-to-speech. Write English words in Devanagari too (example: document -> डॉक्यूमेंट). Remove markdown, emojis, URLs and code. Keep the meaning exactly the same. Output ONLY the converted text.",
          },
          { role: "user", content: text.slice(0, 1500) },
        ],
      }),
    });
    if (!res.ok) { console.error("speak-text OpenRouter error:", res.status, await res.text()); return NextResponse.json({ text: "" }, { status: 502 }); }
    const data = await res.json();
    return NextResponse.json({ text: data.choices?.[0]?.message?.content?.trim() ?? "" });
  } catch {
    return NextResponse.json({ text: "" }, { status: 500 });
  }
}