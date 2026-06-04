import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Optional: public client (agar kabhi client-side use karna ho)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Server-side secure client – isko hi hum RAG ke लिए use karenge
export const supabaseServerClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: { persistSession: false },
  }
);