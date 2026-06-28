import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const { image, question } = await req.json();

        if (!image) {
            return NextResponse.json({ error: "image is required" }, { status: 400 });
        }

        // image data URL se mimeType aur pure base64 nikalo
        // example: "data:image/png;base64,iVBORw0KG..."
        const match = String(image).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        const mimeType = match ? match[1] : "image/png";
        const base64Data = match ? match[2] : String(image); // agar prefix nahi hai to as-is use karo

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: question || "Is image mein kya hai, detail mein batao." },
                                { inlineData: { mimeType, data: base64Data } }
                            ]
                        }
                    ]
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API error:", JSON.stringify(data, null, 2));
            return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
        }

        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, image samajh nahi paaya.";
        return NextResponse.json({ answer });

    } catch (err) {
        console.error("Gemini analyze-image error:", err);
        return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
}