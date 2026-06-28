import { NextRequest, NextResponse } from "next/server";
import { getRelevantDocuments } from "@/lib/rag-search";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DEFAULT_MODEL = "openai/gpt-4.1-mini";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, model } = body as { message?: string; model?: string };

        if (!message || typeof message !== "string") {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        const userMessage = message.trim();

        // 1) RAG: Supabase se relevant docs
        const docs = await getRelevantDocuments(userMessage, 5);
        const context = docs
            .map((d: any) => String(d.content || "").slice(0, 1500))
            .join("\n\n---\n\n");

        // 2) System Prompt — accurate aur detailed answers ke liye rules
        const systemPrompt = `
You are an expert AI tutor. Explain topics clearly, in a fixed structured format — never mix sections together, never skip headings.

CONTEXT FROM UPLOADED DOCUMENTS:
${context || "No relevant context found in the knowledge base."}

RULES:
- FIRST PRIORITY: Agar answer CONTEXT mein hai, usi se answer do aur mention karo ki yeh documents se hai.
- Agar CONTEXT mein answer nahi hai, apne general knowledge se accurately answer do — "I don't know" mat bolo.
- Kabhi bhi facts invent mat karo jo context se contradict karte hon.

MANDATORY FORMAT — jab bhi koi topic, concept, ya "what/why/how" type sawaal pucha jaye, EXACTLY ye 4 headings use karo, isi order mein, har heading apni alag line pe, beech mein ek blank line chhodo:

## What is [TOPIC]?
(2-3 lines mein simple definition. Phir 3-4 bullet points, har point ek alag line pe, har point chhota aur clear ho.)

## Why [TOPIC] is important?
(3-5 bullet points, har point mein ek reason/use-case, har point 1 line ka ho, bold keyword ke saath start karo.)

## How [TOPIC] works?
(Numbered steps 1, 2, 3... use karo. Har step ek alag line pe, chhota aur clear. Kam se kam 4-5 steps do.)

## Uses
(3-5 bullet points — real-world applications/examples, har point ek line ka.)

STRICT FORMATTING RULES:
- Har heading se pehle aur baad mein ek blank line zaroor chhodo — sections ko kabhi mix mat karo ek hi paragraph mein.
- Har bullet point ya numbered step apni khud ki naye line pe ho — kabhi ek hi line mein multiple points jode mat.
- Lambi paragraph likhna mana hai — sirf chhote, clear, ek-line points likho.
- "## Uses" section sabse last mein ho, summary nahi chahiye, seedha Uses pe khatam karo.
- Agar sawaal simple/casual hai (jaise "hi", "thanks"), to ye format use mat karo — chhota friendly reply hi do.

LANGUAGE: Friendly Hinglish mix mein answer do.
`.trim();

        const selectedModel = (model && String(model)) || DEFAULT_MODEL;

        // 3) OpenRouter ko call karo
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
                model: selectedModel,
                max_tokens: 2048,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error("OpenRouter chat error:", err);
            return NextResponse.json({ error: "LLM request failed" }, { status: 500 });
        }

        const json = await res.json();
        const answer = json.choices?.[0]?.message?.content ?? "No answer from model.";

        // 4) Database mein save karo
        const { error: dbError } = await supabase.from("chat_history").insert([
            { role: "user", content: userMessage },
            { role: "assistant", content: answer },
        ]);

        if (dbError) {
            console.error("Failed to save chat to Supabase:", dbError);
        }

        return NextResponse.json({ answer, context: docs, model: selectedModel }, { status: 200 });
    } catch (e) {
        console.error("Chat route error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}