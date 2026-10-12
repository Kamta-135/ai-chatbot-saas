// Chalane ka tareeka:  node scripts/patch-next-config.mjs
// next.config mein serverExternalPackages jodta hai. Iske bina production (Vercel / next build) mein
// PDF upload "Setting up fake worker failed ... pdf.worker.mjs" error deta hai. Purani file ka backup (.bak) banta hai.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const NEED = ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas", "msedge-tts"];
const file = ["next.config.ts", "next.config.mjs", "next.config.js"].find(existsSync);

const NEW_TS = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ${JSON.stringify(NEED)},
};

export default nextConfig;
`;

if (!file) {
  writeFileSync("next.config.ts", NEW_TS);
  console.log("next.config nahi mili, nayi next.config.ts bana di.");
  process.exit(0);
}

let src = readFileSync(file, "utf8");
const list = (arr) => `serverExternalPackages: [${arr.map((n) => JSON.stringify(n)).join(", ")}]`;

const existing = src.match(/serverExternalPackages\s*:\s*\[([^\]]*)\]/);
if (existing) {
  const have = [...existing[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  const missing = NEED.filter((n) => !have.includes(n));
  if (!missing.length) {
    console.log(`${file}: serverExternalPackages pehle se theek hai, kuch badla nahi.`);
    process.exit(0);
  }
  src = src.replace(existing[0], list([...have, ...missing]));
} else {
  const openers = [
    /const\s+\w+\s*:\s*NextConfig\s*=\s*\{/,
    /export\s+default\s*\{/,
    /module\.exports\s*=\s*\{/,
    /const\s+nextConfig\s*=\s*\{/,
  ];
  const hit = openers.map((re) => src.match(re)).find(Boolean);
  if (!hit) {
    console.log(`${file} ka format pehchaan nahi paya. Ise haath se badlo: config object ke andar ye line jodo:\n  ${list(NEED)},`);
    process.exit(1);
  }
  src = src.replace(hit[0], `${hit[0]}\n  ${list(NEED)},`);
}

copyFileSync(file, file + ".bak");
writeFileSync(file, src);
console.log(`${file} update ho gayi (purani file ka backup: ${file}.bak).`);
