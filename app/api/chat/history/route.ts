import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Table bina limit ke hamesha ke liye badhti rahegi (bahut users, bahut messages) — poori
// history har baar fetch karna slow aur costly ho jaata, isliye sirf recent 200 messages
// (100 Q&A pairs) laate hain.
const HISTORY_LIMIT = 200;

export async function GET(req: NextRequest) {
    try {
        // sessionId ke bina koi bhi history mangwaye to KHAALI list do — pehle ye har visitor
        // ko SABKI (poore app ki) chat history dikha deta tha, jo ek badi privacy problem thi.
        const sessionId = req.nextUrl.searchParams.get("sessionId");
        if (!sessionId) {
            return NextResponse.json([], { status: 200 });
        }

        // Supabase database se recent chats nikal rahe hain (sabse nayi pehle, fir reverse
        // karke purani-upar/nayi-neeche order mein bhejte hain jaisa frontend expect karta hai)
        const { data, error } = await supabase
            .from("chat_history")
            .select("*")
            .eq("session_id", sessionId)
            .order("id", { ascending: false })
            .limit(HISTORY_LIMIT);

        if (error) throw error;

        return NextResponse.json((data || []).reverse(), { status: 200 });
    } catch (error) {
        console.error("❌ History Error:", error);
        return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
    }
}