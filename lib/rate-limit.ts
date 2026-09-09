// Bahut simple, in-memory per-IP rate limiter — bina kisi paid service (Redis/Upstash) ke
// basic abuse-protection ke liye. Ye Vercel jaisi serverless deployment pe PERFECT nahi hai:
// har naya "cold start" instance apna khud ka alag counter shuru karta hai, isliye determined
// attacker isko bypass kar sakta hai. Lekin normal cheezein — koi galti se button spam kar de,
// ya koi script se bar-bar hit kare ek hi warm instance pe — usse zaroor bachata hai, aur
// tumhare free-tier API quota (OpenRouter/Gemini/Tavily/Supabase) ko jaldi khatam hone se rokta hai.
const buckets = new Map<string, { count: number; resetAt: number }>();

// Purane buckets ko cleanup karte rehte hain taaki memory leak na ho lambe time tak chalte server mein.
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) buckets.delete(key);
    }
}, 5 * 60 * 1000);

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }

    bucket.count += 1;
    return bucket.count > limit;
}

export function getClientIp(req: Request): string {
    // Vercel/proxies "x-forwarded-for" header mein asli client IP bhejte hain (comma-separated
    // list ho sakti hai agar multiple proxies hon — pehli value asli client ki hoti hai).
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}
