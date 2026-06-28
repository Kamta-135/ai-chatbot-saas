import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";
import { createRequire } from "module";

export const runtime = "nodejs";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const require = createRequire(import.meta.url);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "file is required" }, { status: 400 });
        }

        const fileName = `${Date.now()}-${file.name}`;
        const lowerName = file.name.toLowerCase();

        // 1) Supabase Storage me file save karo
        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(fileName, file);

        if (uploadError) {
            console.error("upload error:", uploadError);
            return NextResponse.json({ error: "upload failed" }, { status: 500 });
        }

        // 2) File type ke hisaab se text extract karo
        let text = "";

        if (lowerName.endsWith(".pdf")) {
            // createRequire se true CommonJS require call hota hai —
            // isse pdf-parse ka debug-mode bug trigger nahi hota
            const pdfParse = require("pdf-parse");
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const data = await pdfParse(buffer);
            text = data.text;
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

        // 4) Documents table me insert
        const { error: insertError } = await supabase.from("documents").insert({
            content: text,
            embedding,
            metadata: { fileName, originalName: file.name },
        });

        if (insertError) {
            console.error("insert error:", insertError);
            return NextResponse.json({ error: "insert failed" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, fileName }, { status: 200 });
    } catch (e) {
        console.error("upload-document error:", e);
        return NextResponse.json({ error: "internal server error" }, { status: 500 });
    }
}
