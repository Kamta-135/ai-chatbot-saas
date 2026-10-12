// Chalane ka tareeka:  node scripts/fix-env.mjs
// .env.local mein NEXT_PUBLIC_SUPABASE_URL ko sahi format (https://<project-ref>.supabase.co) mein badal deta hai.
// Aam galtiyan: aakhir mein /rest/v1/ ya / laga hona, dashboard ka link paste hona, quotes/space. Backup: .env.local.bak
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const file = process.argv[2] || ".env.local";
if (!existsSync(file)) { console.log(`${file} nahi mili.`); process.exit(1); }

const text = readFileSync(file, "utf8");
const eol = text.includes("\r\n") ? "\r\n" : "\n";
let changed = false, found = false, failed = false;

const out = text.split(/\r?\n/).map((line) => {
  const m = line.match(/^(\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*)(.*)$/);
  if (!m) return line;
  found = true;
  const value = m[2].trim().replace(/^["']|["']$/g, "").trim();
  const ref = (value.match(/([a-z0-9]{15,30})\.supabase\.co/i) || value.match(/\/project\/([a-z0-9]{15,30})/i) || [])[1];
  if (!ref) { failed = true; console.log(`NEXT_PUBLIC_SUPABASE_URL ki value se project-ref nahi nikla. Dashboard > Project Settings > API se "Project URL" copy karke daalo (https://xxxx.supabase.co).`); return line; }
  const fixed = `NEXT_PUBLIC_SUPABASE_URL=https://${ref.toLowerCase()}.supabase.co`;
  if (fixed !== line) { changed = true; console.log(`Pehle : ${line.trim()}\nAb    : ${fixed}`); }
  return fixed;
}).join(eol);

if (!found) { console.log("NEXT_PUBLIC_SUPABASE_URL .env.local mein hai hi nahi. Supabase dashboard > Project Settings > API se Project URL daalo."); process.exit(1); }
if (failed) process.exit(1);
if (!changed) { console.log("NEXT_PUBLIC_SUPABASE_URL pehle se sahi format mein hai."); process.exit(0); }
copyFileSync(file, file + ".bak");
writeFileSync(file, out);
console.log(`Theek kar diya (backup: ${file}.bak).`);
