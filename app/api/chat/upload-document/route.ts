import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { chunkText } from "@/lib/chunk-text";
import { withTimeout, rejectAfter } from "@/lib/with-timeout";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".txt", ".pdf"];

// pdf-parse v2: PDFParse class (purana pdfParse(buffer) function style ab kaam nahi karta).
// @napi-rs/canvas package.json mein hona chahiye (DOMMatrix error se bachne ke liye).
async function extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        // pdf-parse har page ke baad "-- 1 of 3 --" jaisi line jodta hai, wo context mein kachra hai
        return result.text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, "");
    } finally {
        try {
            await parser.destroy();
        } catch {}
    }
}

// Chhote chunks ke embeddings 4-4 ek saath banate hain (tez, aur API rate limit bhi safe)
async function embedAll(chunks: string[], batchSize = 4): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
        const part = await Promise.all(chunks.slice(i, i + batchSize).map((c) => embedText(c)));
        out.push(...part);
    }
    return out;
}

function isNetworkError(msg: string) {
    return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(msg);
}

export async function POST(req: NextRequest) {
    try {
        // Upload sabse "mehenga" operation hai (embedding API + DB insert), isliye 6 uploads/min/IP.
        const ip = getClientIp(req);
        if (isRateLimited(`upload:${ip}`, 6, 60_000)) {
            return NextResponse.json(
                { error: "Bahut zyada uploads - thoda ruk kar (1 minute) dobara try karo." },
                { status: 429 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const sessionId = formData.get("sessionId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "file is required" }, { status: 400 });
        }

        const lowerName = file.name.toLowerCase();
        if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
            return NextResponse.json(
                { error: `Sirf .txt aur .pdf files supported hain. Ye file type support nahi hai: ${file.name}` },
                { status: 400 }
            );
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json(
                { error: `File bahut badi hai (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max 10MB allowed hai.` },
                { status: 400 }
            );
        }

        const fileName = `${Date.now()}-${file.name}`;

        // 1) Original file Supabase Storage mein backup ke liye save hoti hai — par ye ZAROORI nahi hai
        // (RAG text se chalta hai), isliye parallel chalta hai aur fail ho to upload nahi rukta.
        const storagePromise: Promise<void> = (async () => {
            try {
                const { error } = await supabase.storage.from("documents").upload(fileName, file);
                if (error) console.warn("[upload] storage backup fail (ignore):", error.message);
            } catch (e) {
                console.warn("[upload] storage backup fail (ignore):", e);
            }
        })();

        // 2) Text nikalo
        let text = "";
        if (lowerName.endsWith(".pdf")) {
            const buffer = Buffer.from(await file.arrayBuffer());
            try {
                text = await extractPdfText(buffer);
            } catch (pdfErr: any) {
                console.error("pdf-parse error:", pdfErr);
                return NextResponse.json(
                    { error: `PDF parse nahi ho payi: ${pdfErr?.message || "unknown error"}. Agar ye scanned/image PDF hai to usme text nahi hota (OCR chahiye).` },
                    { status: 400 }
                );
            }
        } else {
            text = await file.text();
        }

        if (!text || !text.trim()) {
            return NextResponse.json(
                { error: "Is file se koi text nahi nikla. Agar PDF scanned image hai to OCR chahiye hoga." },
                { status: 400 }
            );
        }

        // 3) Chhote tukde (chunks) banao aur har ek ka embedding
        const chunks = chunkText(text, 1000, 150, 40);
        const truncated = text.length > chunks.reduce((n, c) => n + c.length, 0) + 2000;
        const embeddings = await rejectAfter(embedAll(chunks), 40_000, "Embedding service");

        // 4) Documents table mein insert — session_id metadata mein, taaki document sirf isi visitor ke RAG mein aaye
        const rows = chunks.map((content, i) => ({
            content,
            embedding: embeddings[i],
            metadata: {
                fileName,
                originalName: file.name,
                session_id: sessionId || null,
                chunkIndex: i,
                totalChunks: chunks.length,
            },
        }));

        const { error: insertError } = await rejectAfter(supabase.from("documents").insert(rows), 25_000, "Supabase insert");
        if (insertError) {
            console.error("insert error:", insertError);
            const msg = insertError.message || "";
            return NextResponse.json(
                {
                    error: isNetworkError(msg)
                        ? "Database (Supabase) se connect nahi ho pa raha. Supabase project paused ho sakta hai ya internet/DNS ka issue hai."
                        : `Database insert failed: ${msg}`,
                },
                { status: 500 }
            );
        }

        await withTimeout(storagePromise, 3000, undefined); // backup zaroori nahi, zyada intezaar nahi
        return NextResponse.json({ ok: true, fileName, chunks: chunks.length, truncated }, { status: 200 });
    } catch (e: any) {
        console.error("upload-document error:", e);
        const msg = e?.message || String(e);
        return NextResponse.json(
            {
                error: isNetworkError(msg)
                    ? "Network / Supabase se connect nahi ho pa raha. Thodi der baad try karo."
                    : `Internal server error: ${msg}`,
            },
            { status: 500 }
        );
    }
}
