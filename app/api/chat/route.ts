import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model =
      process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not set on server" },
        { status: 500 }
      );
    }

    const messages = [
      { role: "system", content: "You are a helpful AI assistant." },
      ...history,
      { role: "user", content: message },
    ];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://example.com",
        "X-Title": "AI Chatbot",
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "I could not generate a reply.";

    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}