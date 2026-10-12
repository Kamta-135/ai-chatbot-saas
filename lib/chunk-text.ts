// Lambe document ko chhote tukdon (chunks) mein todta hai, taaki RAG sirf sawaal se milte-julte
// hisse chat model ko de sake (pehle poora document ek hi row mein jaata tha aur sirf
// shuru ke 1500 akshar hi context mein pahunchte the).

export function chunkText(text: string, size = 1000, overlap = 150, maxChunks = 40): string[] {
    const clean = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const chunks: string[] = [];
    let start = 0;

    while (start < clean.length && chunks.length < maxChunks) {
        let end = Math.min(start + size, clean.length);

        if (end < clean.length) {
            // paragraph / vaakya ki seema par todo, beech shabd mein nahi
            const slice = clean.slice(start, end);
            const cut = Math.max(
                slice.lastIndexOf("\n\n"),
                slice.lastIndexOf(". "),
                slice.lastIndexOf("\n"),
                slice.lastIndexOf("\u0964")
            );
            if (cut > size * 0.5) end = start + cut + 1;
        }

        const piece = clean.slice(start, end).trim();
        if (piece) chunks.push(piece);

        if (end >= clean.length) break;
        start = Math.max(end - overlap, start + 1);
    }

    return chunks;
}
