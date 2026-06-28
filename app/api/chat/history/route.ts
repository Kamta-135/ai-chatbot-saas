import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
    try {
        // Supabase database se purani chats nikal rahe hain
        const { data, error } = await supabase
            .from("chat_history")
            .select("*")
            .order("id", { ascending: true }); // Purani chat upar, nayi neeche

        if (error) throw error;

        return NextResponse.json(data || [], { status: 200 });
    } catch (error) {
        console.error("❌ History Error:", error);
        return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
    }
}