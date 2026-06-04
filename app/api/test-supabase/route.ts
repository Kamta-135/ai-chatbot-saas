import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { count, error } = await supabaseServerClient
      .from("documents")
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      documentsCount: count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content, title } = await req.json();

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "content is required" },
        { status: 400 }
      );
    }

    // Demo embedding: abhi dummy vector (sab 0) daal rahe hain
    // Later yahi pe actual LLM embedding aayega
    const embeddingSize = 1536;
    const dummyEmbedding = Array(embeddingSize).fill(0);

    const { data, error } = await supabaseServerClient
      .from("documents")
      .insert({
        content,
        embedding: dummyEmbedding,
        title: title || "Demo document",
        source: "manual-test",
      })
      .select();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}