// Env variables ki jaanch: galat key / adhoori key / URL paste ho jaana jaise sabse common
// galtiyan pehle hi pakad leta hai (is project mein yahi baar-baar problem bani thi).

export type EnvIssue = { level: "error" | "warn"; name: string; message: string };

const clean = (v: string | undefined) => (v ?? "").trim();
const looksBroken = (v: string) => /^["']|["']$/.test(v) || v.includes("...") || /\s/.test(v);

export function checkEnv(env: Record<string, string | undefined> = process.env): EnvIssue[] {
    const issues: EnvIssue[] = [];
    const add = (level: EnvIssue["level"], name: string, message: string) => issues.push({ level, name, message });

    // OpenRouter (chat, image, search-query rewrite)
    const or = clean(env.OPENROUTER_API_KEY);
    if (!or) add("error", "OPENROUTER_API_KEY", "Missing hai. openrouter.ai/keys se key banao (sk-or-v1-... se shuru hoti hai).");
    else if (!or.startsWith("sk-or-")) add("error", "OPENROUTER_API_KEY", "Ye OpenRouter ki key nahi lag rahi (sk-or- se shuru honi chahiye). OpenAI ya kisi aur ki key yahan kaam nahi karegi.");
    else if (or.length < 40 || looksBroken(or)) add("error", "OPENROUTER_API_KEY", "Key adhoori ya kati hui lag rahi hai (... ya space/quotes hain). Poori key dobara copy karo.");

    // Supabase (documents, chat history)
    const url = clean(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!url) add("error", "NEXT_PUBLIC_SUPABASE_URL", "Missing hai. Supabase dashboard > Project Settings > API se Project URL lo.");
    else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url))
        add("error", "NEXT_PUBLIC_SUPABASE_URL", "URL ka format galat hai. Aisa hona chahiye: https://xxxxxxxx.supabase.co");

    const sr = clean(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!sr) add("error", "SUPABASE_SERVICE_ROLE_KEY", "Missing hai (document upload ke liye zaroori). Supabase > Project Settings > API > service_role / secret key.");
    else if (!(sr.split(".").length === 3 && sr.startsWith("eyJ")) && !sr.startsWith("sb_secret_"))
        add("error", "SUPABASE_SERVICE_ROLE_KEY", "Key ka format galat hai (eyJ... ya sb_secret_... se shuru honi chahiye).");
    else if (looksBroken(sr)) add("error", "SUPABASE_SERVICE_ROLE_KEY", "Key mein space/quotes/... hain, poori key dobara copy karo.");

    if (!clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) add("warn", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "Missing hai (service role key ke bina backup ke liye kaam aati hai).");

    // Tavily (live web search)
    const tav = clean(env.TAVILY_API_KEY);
    if (!tav) add("warn", "TAVILY_API_KEY", "Missing hai: 'abhi ka / latest' sawaalon (CM kaun hai, score, news) ke jawab purane ho sakte hain. app.tavily.com se free key lo.");
    else if (!tav.startsWith("tvly-")) add("error", "TAVILY_API_KEY", "Ye Tavily ki key nahi lag rahi (tvly- se shuru honi chahiye). Shayad koi link paste ho gaya hai.");
    else if (tav.length < 20 || looksBroken(tav)) add("error", "TAVILY_API_KEY", "Key adhoori lag rahi hai, dobara copy karo.");

    if (!clean(env.GEMINI_API_KEY)) add("warn", "GEMINI_API_KEY", "Missing hai: image analysis ka backup nahi rahega (aur agar lib/embeddings.ts Gemini use karta hai to document search bhi nahi chalega).");

    return issues;
}
