import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (pdf-parse ke andar use hota hai) apna khud ka "worker" file
  // (pdf.worker.mjs) runtime pe load karta hai. Next.js jab isko bundle karta
  // hai (Turbopack/webpack), to worker file ka original path/name badal jaata
  // hai aur pdfjs-dist usko dhoondh nahi paata — isi wajah se
  // "Setting up fake worker failed: Cannot find module ... pdf.worker.mjs" error aata tha.
  // serverExternalPackages inhe bundling se opt-out kar deta hai, taaki Node.js
  // ka normal require() chale aur asli file path sahi resolve ho.
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
