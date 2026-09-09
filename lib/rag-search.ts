import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// "explain this pdf" / "iska summary do" jaise generic/vague queries ka embedding
// uploaded document ke actual content se semantically match nahi karta (cosine similarity
// match_threshold 0.3 se neeche reh jaati hai), isliye pehle match_documents khaali result
// deta tha aur LLM ko lagta tha ki koi document hai hi nahi — isi wajah se wo hallucinate
// karke bol deta tha "aapne upload karna bhool gaye", jabki upload successfully ho chuka hota tha.
//
// Fix: semantic search ke saath-saath hamesha sabse recent upload(s) bhi zabardasti context
// mein shaamil karo — kyunki jab user "is document/pdf ka" jaisa reference karta hai, uska
// matlab (almost) hamesha sabse last uploaded file hi hota hai, chaahe semantic score kam ho.
const RECENT_DOCS_COUNT = 2;

// sessionId diya gaya ho to sirf usी visitor ke documents return karte hain — taaki ek user
// ka upload dusre user ke jawabon mein na aaye. sessionId na diya gaya ho (backward-compat)
// to purana (sabke liye shared) behaviour hi chalta hai.
export async function getRelevantDocuments(userQuery: string, limit = 5, sessionId?: string) {
    const results = new Map<string | number, any>();

    // 1) Semantic similarity search (jo topic se related ho). Ye Supabase RPC function hai jo
    // seedhe SQL mein likha hua hai — usko chhede bina, result aane ke BAAD JS mein hi
    // session_id se filter kar dete hain (safe, koi DB migration/RPC change nahi chahiye).
    try {
        const queryEmbedding = await embedText(userQuery);

        const { data: semanticDocs, error } = await supabase.rpc("match_documents", {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: limit * 3, // filter karne ke baad bhi enough results bachein isliye zyada mangwao
        });

        if (error) {
            console.error("match_documents RPC error:", error);
        } else {
            for (const doc of semanticDocs || []) {
                if (!sessionId || doc.metadata?.session_id === sessionId) {
                    results.set(doc.id, doc);
                }
            }
        }
    } catch (error) {
        console.error("getRelevantDocuments (semantic) error:", error);
    }

    // 2) Recent uploads hamesha shaamil karo (vague "this pdf" type references ke liye) —
    // yahan seedhe query mein hi (usी visitor ke) session_id se filter kar dete hain.
    try {
        let recentQuery = supabase
            .from("documents")
            .select("id, content, metadata")
            .order("created_at", { ascending: false })
            .limit(RECENT_DOCS_COUNT);

        if (sessionId) {
            recentQuery = recentQuery.contains("metadata", { session_id: sessionId });
        }

        const { data: recentDocs, error: recentError } = await recentQuery;

        if (recentError) {
            console.error("recent documents fetch error:", recentError);
        } else {
            for (const doc of recentDocs || []) {
                if (!results.has(doc.id)) results.set(doc.id, doc);
            }
        }
    } catch (error) {
        console.error("getRelevantDocuments (recent) error:", error);
    }

    return Array.from(results.values()).slice(0, limit + RECENT_DOCS_COUNT);
}