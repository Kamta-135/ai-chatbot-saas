import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    const text = await file.text();

    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, file);

    if (uploadError) {
      console.error("upload error:", uploadError);
      return NextResponse.json(
        { error: "upload failed" },
        { status: 500 }
      );
    }

    const embedding = await embedText(text);

    const { error: insertError } = await supabase.from("documents").insert({
      content: text,
      embedding,
      metadata: { fileName },
    });

    if (insertError) {
      console.error("insert error:", insertError);
      return NextResponse.json(
        { error: "insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, fileName },
      { status: 200 }
    );
  } catch (e) {
    console.error("upload-document error:", e);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}