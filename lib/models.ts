// Ek hi jagah par model ke naam. (Purana default "deepseek ... :free" ab chalta nahi tha, isliye chat 500 deti thi.)
export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
export const FALLBACK_MODEL = process.env.OPENROUTER_MODEL_FALLBACK || "openai/gpt-4o-mini";

export function describeOpenRouterError(status: number): string {
    if (status === 401) return "OpenRouter key galat ya expire hai (openrouter.ai/keys par nayi key banao)";
    if (status === 402) return "OpenRouter ke credits khatam ho gaye hain (openrouter.ai/credits)";
    if (status === 404 || status === 400) return "Ye AI model abhi available nahi hai";
    if (status === 429) return "AI service par abhi bahut load hai, thodi der baad try karo";
    return "AI service se jawab nahi aaya";
}
