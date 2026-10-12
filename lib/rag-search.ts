import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// "explain this pdf" / "iska summary do" jaise vague sawaal ka embedding document se match nahi
// karta, isliye semantic search ke saath sabse recent upload ke SHURUAATI chunks bhi hamesha
// shaamil karte hain (user ka matlab almost hamesha last uploaded file hota hai).
const RECENT_CHUNKS = 3;

// sessionId diya ho to sirf usi visitor ke documents; warna sab shared.
export async function getRelevantDocuments(userQuery: string, limit = 5, sessionId?: string) {
    const results = new Map<string | number, any>();

    // 1) Semantic similarity search (RPC match_documents), baad mein JS mein session_id se filter
    const semantic = async () => {
        try {
            const queryEmbedding = await embedText(userQuery);
            const { data, error } = await supabase.rpc("match_documents", {
                query_embedding: queryEmbedding,
                match_threshold: 0.3,
                match_count: limit * 3,
            });
            if (error) {
                console.error("match_documents RPC error:", error);
                return;
            }
            for (const doc of data || []) {
                if (!sessionId || doc.metadata?.session_id === sessionId) {
                    results.set(doc.id, doc);
                }
            }
        } catch (error) {
            console.error("getRelevantDocuments (semantic) error:", error);
        }
    };

    // 2) Sabse recent file ke pehle RECENT_CHUNKS chunks (chunkIndex ke order mein)
    const recent = async () => {
        try {
            let q = supabase
                .from("documents")
                .select("id, content, metadata")
                .order("created_at", { ascending: false })
                .limit(60);
            if (sessionId) q = q.contains("metadata", { session_id: sessionId });

            const { data, error } = await q;
            if (error) {
                console.error("recent documents fetch error:", error);
                return;
            }
            const rows = (data || []) as any[];
            if (!rows.length) return;

            const latestFile = rows[0].metadata?.fileName;
            const sameFile = rows
                .filter((r) => r.metadata?.fileName === latestFile)
                .sort((a, b) => (a.metadata?.chunkIndex ?? 0) - (b.metadata?.chunkIndex ?? 0))
                .slice(0, RECENT_CHUNKS);

            for (const doc of sameFile) {
                if (!results.has(doc.id)) results.set(doc.id, doc);
            }
        } catch (error) {
            console.error("getRelevantDocuments (recent) error:", error);
        }
    };

    // Dono ek saath (pehle ek ke baad ek chalte the)
    await Promise.all([semantic(), recent()]);

    return Array.from(results.values()).slice(0, limit + RECENT_CHUNKS);
}
