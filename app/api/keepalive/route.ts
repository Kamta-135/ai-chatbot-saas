import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rejectAfter } from "@/lib/with-timeout";

export const runtime = "nodejs";
export const maxDuration = 30;

// Supabase free project 7 din koi activity na ho to pause ho jaata hai (isi se PDF/RAG bar-bar toot raha tha).
// vercel.json ka cron roz ek baar yahan aata hai aur DB ko ek halka sa query bhejta hai, to project kabhi pause nahi hota.
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
    }

    try {
        const supabase = createClient(url, key);
        const { error } = await rejectAfter(supabase.from("documents").select("id").limit(1), 10_000, "Supabase");
        if (error) {
            console.error("[keepalive] supabase error:", error.message);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, at: new Date().toISOString() });
    } catch (e) {
        console.error("[keepalive] failed:", e);
        return NextResponse.json({ ok: false, error: String((e as any)?.message || e) }, { status: 500 });
    }
}
