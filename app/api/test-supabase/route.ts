import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Yeh route ab ek diagnostic health-check hai — Supabase env vars, connectivity,
// tables (chat_history, documents) aur match_documents RPC sab ek saath check karta hai.
// Isse hit karke turant pata chal jaayega ki .env.local sahi hai ya nahi,
// bina poore chat/upload flow se guzre.

export const runtime = "nodejs";

function looksLikeRealSupabaseKey(key: string | undefined): { ok: boolean; reason?: string } {
    if (!key) return { ok: false, reason: "missing" };
    if (key.trim().endsWith("...")) return { ok: false, reason: "truncated placeholder (ends with '...')" };
    if (key.split(".").length !== 3) return { ok: false, reason: "not a valid JWT (expected header.payload.signature)" };
    if (key.length < 100) return { ok: false, reason: `too short (${key.length} chars) for a real Supabase key` };
    return { ok: true };
}

export async function GET(req: NextRequest) {
    // Ye ek diagnostic/debug endpoint hai — kisi bhi visitor ko ye nahi dikhna chahiye ki
    // internally Supabase kaise use ho raha hai, table names kya hain, wagaira. Deploy hone
    // ke baad (NODE_ENV=production) isko ek secret key ke bina band kar dete hain. Local
    // "npm run dev" mein (NODE_ENV=development) pehle jaisa hi khula rehta hai, testing ke liye.
    if (process.env.NODE_ENV === "production") {
        const key = req.nextUrl.searchParams.get("key");
        if (!process.env.DEBUG_KEY || key !== process.env.DEBUG_KEY) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const checks: Record<string, unknown> = {
        env: {
            NEXT_PUBLIC_SUPABASE_URL: url ? "set" : "MISSING",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: looksLikeRealSupabaseKey(anonKey),
            SUPABASE_SERVICE_ROLE_KEY: looksLikeRealSupabaseKey(serviceKey),
        },
    };

    if (!url || !serviceKey) {
        return NextResponse.json(
            { ok: false, message: "Supabase URL ya service role key .env.local mein missing/invalid hai.", checks },
            { status: 500 }
        );
    }

    const supabase = createClient(url, serviceKey);

    try {
        const [chatHistory, documents, rpc] = await Promise.all([
            supabase.from("chat_history").select("id", { count: "exact", head: true }),
            supabase.from("documents").select("id", { count: "exact", head: true }),
            supabase.rpc("match_documents", {
                query_embedding: new Array(1536).fill(0),
                match_threshold: 0.3,
                match_count: 1,
            }),
        ]);

        checks.chat_history_table = chatHistory.error ? { ok: false, error: chatHistory.error.message } : { ok: true };
        checks.documents_table = documents.error ? { ok: false, error: documents.error.message } : { ok: true };
        checks.match_documents_rpc = rpc.error ? { ok: false, error: rpc.error.message } : { ok: true };

        const allOk = !chatHistory.error && !documents.error && !rpc.error;

        return NextResponse.json(
            { ok: allOk, message: allOk ? "Supabase se sab kuch connect ho raha hai ✅" : "Kuch checks fail hue — neeche details dekho.", checks },
            { status: allOk ? 200 : 500 }
        );
    } catch (e: any) {
        console.error("test-supabase health-check error:", e);
        return NextResponse.json(
            { ok: false, message: "Supabase se connect nahi ho paaya (network/URL issue ho sakta hai).", error: String(e?.message || e), checks },
            { status: 500 }
        );
    }
}
