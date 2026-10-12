// Koi bhi bahari service (Supabase, OpenRouter, Tavily, embeddings) atak jaaye to poora app na atke.

// ms mein jawab na aaye to `fallback` return karo (error nahi)
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([p, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

// ms mein jawab na aaye to error throw karo (label ke saath)
export function rejectAfter<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout (${ms / 1000}s)`)), ms);
    });
    return Promise.race([Promise.resolve(p), timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}
