// PDF se text nikalna.
// Pehle pdf-parse tha, jo Vercel par "DOMMatrix is not defined" se toot jaata tha (native @napi-rs/canvas binary nahi milti).
// unpdf serverless ke liye bana hai: koi native part nahi, isliye Vercel par bhi chalta hai.
export async function extractPdfText(buffer: Buffer | Uint8Array): Promise<string> {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
        const { text } = await extractText(pdf, { mergePages: true });
        return Array.isArray(text) ? text.join("\n") : String(text ?? "");
    } finally {
        try {
            await (pdf as any).destroy?.();
        } catch {}
    }
}
