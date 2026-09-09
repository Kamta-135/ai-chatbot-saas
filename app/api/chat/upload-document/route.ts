import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — isse bada file embed karne ka koi fayda nahi (text truncate ho jaayega)
const ALLOWED_EXTENSIONS = [".txt", ".pdf"];

// pdf-parse v2 internally pdfjs-dist use karta hai jisko canvas rendering ke liye
// DOMMatrix/ImageData/Path2D chahiye — Node.js server mein ye globals exist nahi karte
// bina "@napi-rs/canvas" package ke, isliye "DOMMatrix is not defined" crash hota tha
// (ab package.json mein add kar diya hai).
// NOTE: pdf-parse v2 ka API v1 se bilkul alag hai — ab ek PDFParse CLASS hai,
// purana "pdfParse(buffer)" function call style ab kaam nahi karta.
async function extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
}

export async function POST(req: NextRequest) {
    try {
        // Upload sabse "mehenga" operation hai (storage + embedding API call + DB insert),
        // isliye limit tight rakhi hai — 6 uploads per minute per IP.
        const ip = getClientIp(req);
        if (isRateLimited(`upload:${ip}`, 6, 60_000)) {
            return NextResponse.json(
                { error: "Bahut zyada uploads — thoda ruk kar (1 minute) dobara try karo." },
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
                { error: `Sirf .txt aur .pdf files supported hain. Yeh file type support nahi hai: ${file.name}` },
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

        // 1) Supabase Storage me file save karo
        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(fileName, file);

        if (uploadError) {
            console.error("upload error:", uploadError);
            return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
        }

        // 2) File type ke hisaab se text extract karo
        let text = "";

        if (lowerName.endsWith(".pdf")) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            try {
                text = await extractPdfText(buffer);
            } catch (pdfErr: any) {
                console.error("pdf-parse error:", pdfErr);
                return NextResponse.json(
                    { error: `PDF parse nahi ho payi: ${pdfErr?.message || "unknown error"}. Agar ye scanned/image PDF hai, OCR chahiye hoga.` },
                    { status: 400 }
                );
            }
        } else {
            text = await file.text();
        }

        if (!text || !text.trim()) {
            return NextResponse.json(
                { error: "Could not extract any text from this file. Agar PDF scanned image hai, toh OCR chahiye hoga." },
                { status: 400 }
            );
        }

        // 3) Embedding banao
        const embedding = await embedText(text);

        // 4) Documents table me insert — session_id metadata mein daal dete hain taaki ye
        // document sirf isi visitor ke RAG context mein use ho, doosron ke nahi.
        const { error: insertError } = await supabase.from("documents").insert({
            content: text,
            embedding,
            metadata: { fileName, originalName: file.name, session_id: sessionId || null },
        });

        if (insertError) {
            console.error("insert error:", insertError);
            return NextResponse.json({ error: `Database insert failed: ${insertError.message}` }, { status: 500 });
        }

        return NextResponse.json({ ok: true, fileName }, { status: 200 });
    } catch (e: any) {
        console.error("upload-document error:", e);
        return NextResponse.json({ error: `Internal server error: ${e?.message || String(e)}` }, { status: 500 });
    }
}
