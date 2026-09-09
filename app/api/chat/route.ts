import { NextRequest, NextResponse } from "next/server";
import { getRelevantDocuments } from "@/lib/rag-search";
import { needsLiveSearch, searchWeb } from "@/lib/web-search";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// .env.local mein OPENROUTER_MODEL set hai to wahi default hoga, warna yeh hardcoded fallback.
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free";
const FALLBACK_MODEL = process.env.OPENROUTER_MODEL_FALLBACK;

type ChatTurn = { role: "user" | "assistant"; content: string };

async function callOpenRouter(model: string, messages: { role: string; content: string }[]) {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            max_tokens: 2048,
            messages,
        }),
    });
}

export async function POST(req: NextRequest) {
    try {
        // Bahut users hone par ek hi user/script chat endpoint ko spam na kar sake (har request
        // OpenRouter/Gemini/Tavily credits kharch karti hai) — 20 messages per minute per IP.
        const ip = getClientIp(req);
        if (isRateLimited(`chat:${ip}`, 20, 60_000)) {
            return NextResponse.json(
                { error: "Bahut zyada messages bhej diye — thoda ruk kar (1 minute) dobara try karo." },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { message, model, history, sessionId } = body as {
            message?: string;
            model?: string;
            history?: ChatTurn[];
            sessionId?: string;
        };

        if (!message || typeof message !== "string") {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        const MAX_MESSAGE_LENGTH = 4000; // itni lambi message ka koi practical use-case nahi, sirf cost/abuse bachane ke liye cap
        if (message.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                { error: `Message bahut lambi hai (max ${MAX_MESSAGE_LENGTH} characters).` },
                { status: 400 }
            );
        }

        const userMessage = message.trim();
        if (!userMessage) {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        // 1) RAG: Supabase se relevant docs (sirf isi session/visitor ke uploaded documents se)
        const docs = await getRelevantDocuments(userMessage, 5, sessionId);
        const context = docs
            .map((d: any) => String(d.content || "").slice(0, 1500))
            .join("\n\n---\n\n");

        // 1b) Agar query "abhi ka / current / latest" type lag rahi hai (CM kaun hai, aaj ka
        // score, news, etc.), to LLM ki purani/frozen training knowledge kaam nahi aayegi —
        // isliye ek live web search (Tavily) bhi kar lete hain. TAVILY_API_KEY set nahi hai
        // to ye chup-chaap skip ho jaata hai (searchWeb khaali string return karta hai).
        let liveInfo = "";
        if (needsLiveSearch(userMessage)) {
            liveInfo = await searchWeb(userMessage);
        }

        // 2) System Prompt — accurate aur detailed answers ke liye rules
        const systemPrompt = `
You are an expert AI tutor. Explain topics clearly, in a fixed structured format — never mix sections together, never skip headings.

CONTEXT FROM UPLOADED DOCUMENTS:
${context || "No relevant context found in the knowledge base."}
${liveInfo ? `\nLIVE WEB SEARCH RESULTS (aaj (${new Date().toISOString().slice(0, 10)}) internet se fetch kiya gaya, current/latest data hai):\n${liveInfo}\n` : ""}

RULES:
- FIRST PRIORITY: Agar answer CONTEXT mein hai, usi se answer do aur mention karo ki yeh documents se hai.
- Agar LIVE WEB SEARCH RESULTS diya gaya hai, to current/latest facts (jaise kaun kisi post pe hai, aaj ka score/price/news) ke liye USI ko sach maano — apni purani training knowledge se zyada trust karo, kyunki training knowledge outdated ho sakti hai.
- Agar CONTEXT aur LIVE WEB SEARCH dono mein answer nahi hai, apne general knowledge se accurately answer do — "I don't know" mat bolo, lekin agar sawaal kisi current/changing cheez ke baare mein hai to bata do ki tumhari knowledge purani ho sakti hai.
- Kabhi bhi facts invent mat karo jo context se contradict karte hon.
- Tumhe pata nahi hota ki user ne koi file upload ki hai ya nahi — sirf CONTEXT section dikhta hai. Isliye KABHI bhi ye mat bolo ki "aapne upload karna bhool gaye" ya "PDF upload karein" — agar CONTEXT khaali hai, seedha apne general knowledge se sawaal ka jawab do, upload ke baare mein koi assumption mat lo.

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

        // 2b) Conversation history — pehle sirf current message OpenRouter ko jaata tha,
        // pichhli baat-cheet bilkul yaad nahi rehti thi. Isi wajah se "hn", "aur batao" jaise
        // chhote follow-up replies kaam nahi karte the — model ko pata hi nahi hota tha ki
        // "hn" kis sawaal ka jawab hai. Ab frontend se aayi history ko bhi conversation mein
        // shaamil karte hain (last 12 messages tak — zyada purani cap kar dete hain taaki
        // token limit cross na ho).
        const MAX_HISTORY_MESSAGES = 12;
        const trimmedHistory: ChatTurn[] = Array.isArray(history)
            ? history
                  .filter(
                      (h): h is ChatTurn =>
                          !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
                  )
                  .slice(-MAX_HISTORY_MESSAGES)
            : [];

        const chatMessages = [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
            { role: "user", content: userMessage },
        ];

        // 3) OpenRouter ko call karo — agar selected model fail ho (rate-limited/down)
        // aur ek FALLBACK_MODEL configured hai, to usse ek baar retry karo.
        let res = await callOpenRouter(selectedModel, chatMessages);
        let modelUsed = selectedModel;

        if (!res.ok && FALLBACK_MODEL && FALLBACK_MODEL !== selectedModel) {
            const firstErr = await res.text();
            console.error(`OpenRouter error on "${selectedModel}", retrying with fallback "${FALLBACK_MODEL}":`, firstErr);
            res = await callOpenRouter(FALLBACK_MODEL, chatMessages);
            modelUsed = FALLBACK_MODEL;
        }

        if (!res.ok) {
            const err = await res.text();
            console.error("OpenRouter chat error:", err);
            return NextResponse.json({ error: "LLM request failed" }, { status: 500 });
        }

        const json = await res.json();
        const answer = json.choices?.[0]?.message?.content ?? "No answer from model.";

        // 4) Database mein save karo — session_id ke saath, taaki /history page sirf isi
        // visitor ki chat dikhaye, sabki shared chat nahi.
        const { error: dbError } = await supabase.from("chat_history").insert([
            { role: "user", content: userMessage, session_id: sessionId || null },
            { role: "assistant", content: answer, session_id: sessionId || null },
        ]);

        if (dbError) {
            console.error("Failed to save chat to Supabase:", dbError);
        }

        return NextResponse.json({ answer, context: docs, model: modelUsed }, { status: 200 });
    } catch (e) {
        console.error("Chat route error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}