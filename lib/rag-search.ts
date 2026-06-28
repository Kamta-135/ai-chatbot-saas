import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getRelevantDocuments(userQuery: string, limit = 5) {
    try {
        const queryEmbedding = await embedText(userQuery);

        const { data: documents, error } = await supabase.rpc("match_documents", {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: limit,
        });

        if (error) {
            console.error("match_documents RPC error:", error);
            return [];
        }

        return documents || [];
    } catch (error) {
        console.error("getRelevantDocuments error:", error);
        return [];
    }
}