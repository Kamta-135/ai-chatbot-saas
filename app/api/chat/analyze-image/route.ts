import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Base64 encoding raw bytes se ~33% bada hota hai, isliye 8MB asli image ke liye
// yeh limit thoda zyada rakhi hai. Pehle koi size check nahi tha — koi bhi bahut badi
// image bhej ke server memory/Gemini API cost badha sakta tha.
const MAX_IMAGE_BASE64_CHARS = 11 * 1024 * 1024; // ~8MB raw image tak allow

export async function POST(req: NextRequest) {
    try {
        // Har image analysis call Gemini API credits use karti hai — abuse na ho isliye
        // 10 images per minute per IP tak limit.
        const ip = getClientIp(req);
        if (isRateLimited(`image:${ip}`, 10, 60_000)) {
            return NextResponse.json(
                { error: "Bahut zyada images — thoda ruk kar (1 minute) dobara try karo." },
                { status: 429 }
            );
        }

        const { image, question } = await req.json();

        if (!image) {
            return NextResponse.json({ error: "image is required" }, { status: 400 });
        }

        if (String(image).length > MAX_IMAGE_BASE64_CHARS) {
            return NextResponse.json(
                { error: "Image bahut badi hai (max ~8MB allowed)." },
                { status: 400 }
            );
        }

        if (!process.env.GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY missing in .env.local");
            return NextResponse.json({ error: "Image analysis is not configured (missing GEMINI_API_KEY)" }, { status: 500 });
        }

        // image data URL se mimeType aur pure base64 nikalo
        // example: "data:image/png;base64,iVBORw0KG..."
        const match = String(image).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        const mimeType = match ? match[1] : "image/png";
        const base64Data = match ? match[2] : String(image); // agar prefix nahi hai to as-is use karo

        const response = await fetch(
            // NOTE: "gemini-3.5-flash" naam ka model exist nahi karta — isse yeh route hamesha
            // 404 deta tha. gemini-2.5-flash ek stable, vision-capable, fast model hai.
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
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