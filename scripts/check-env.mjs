// Chalane ka tareeka:  node scripts/check-env.mjs
// .env.local ki jaanch + Supabase / OpenRouter / Tavily ka internet (DNS) check.
import { readFileSync, existsSync } from "node:fs";
import { lookup } from "node:dns/promises";

const file = process.argv[2] || ".env.local";
const G = (s) => `\x1b[32m${s}\x1b[0m`, R = (s) => `\x1b[31m${s}\x1b[0m`, Y = (s) => `\x1b[33m${s}\x1b[0m`;
let errors = 0, warns = 0;
const ok = (m) => console.log(G("  OK   ") + m);
const err = (m) => { errors++; console.log(R("  FAIL ") + m); };
const warn = (m) => { warns++; console.log(Y("  WARN ") + m); };

if (!existsSync(file)) {
  console.log(R(`${file} nahi mili. .env.example ko copy karke ${file} banao.`));
  process.exit(1);
}

const env = {};
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m || line.trim().startsWith("#")) continue;
  env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const broken = (v) => v.includes("...") || /\s/.test(v);

console.log(`\n${file} ki jaanch:\n`);

const or = env.OPENROUTER_API_KEY || "";
if (!or) err("OPENROUTER_API_KEY missing hai (openrouter.ai/keys se key banao)");
else if (!or.startsWith("sk-or-")) err("OPENROUTER_API_KEY OpenRouter ki key nahi lag rahi (sk-or- se shuru honi chahiye)");
else if (or.length < 40 || broken(or)) err("OPENROUTER_API_KEY adhoori/kati hui lag rahi hai, poori key dobara copy karo");
else ok(`OPENROUTER_API_KEY theek lag rahi hai (length ${or.length})`);

const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url) err("NEXT_PUBLIC_SUPABASE_URL missing hai");
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) err("NEXT_PUBLIC_SUPABASE_URL ka format galat hai (https://xxxx.supabase.co)");
else ok(`NEXT_PUBLIC_SUPABASE_URL theek hai (${new URL(url).host})`);

const sr = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!sr) err("SUPABASE_SERVICE_ROLE_KEY missing hai (document upload ke liye zaroori)");
else if (!(sr.split(".").length === 3 && sr.startsWith("eyJ")) && !sr.startsWith("sb_secret_")) err("SUPABASE_SERVICE_ROLE_KEY ka format galat hai");
else if (broken(sr)) err("SUPABASE_SERVICE_ROLE_KEY mein space ya ... hai");
else ok("SUPABASE_SERVICE_ROLE_KEY theek lag rahi hai");

if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) warn("NEXT_PUBLIC_SUPABASE_ANON_KEY missing hai");
else ok("NEXT_PUBLIC_SUPABASE_ANON_KEY maujood hai");

const tav = env.TAVILY_API_KEY || "";
if (!tav) warn("TAVILY_API_KEY missing: 'abhi ka' sawaalon (CM, score, news) ke jawab purane ho sakte hain");
else if (!tav.startsWith("tvly-")) err("TAVILY_API_KEY Tavily ki key nahi lag rahi (tvly- se shuru honi chahiye). Shayad koi link paste ho gaya hai");
else if (tav.length < 20 || broken(tav)) err("TAVILY_API_KEY adhoori lag rahi hai");
else ok(`TAVILY_API_KEY theek lag rahi hai (length ${tav.length})`);

if (!env.GEMINI_API_KEY) warn("GEMINI_API_KEY missing: image analysis ka backup nahi rahega");
else ok("GEMINI_API_KEY maujood hai");

console.log("\nInternet / DNS check:\n");
const hosts = [["openrouter.ai", "OpenRouter"], ["api.tavily.com", "Tavily"]];
if (/^https:\/\/[a-z0-9]+\.supabase\.co/.test(url)) hosts.push([new URL(url).host, "Supabase project"]);
for (const [host, name] of hosts) {
  try { await lookup(host); ok(`${name} (${host}) mil raha hai`); }
  catch {
    if (name === "Supabase project") err(`${name} (${host}) nahi mil raha: project PAUSED ho sakta hai. supabase.com/dashboard par jaake Resume project dabao`);
    else err(`${name} (${host}) nahi mil raha: internet ya DNS ka issue`);
  }
}

console.log(`\nResult: ${errors} fail, ${warns} warning`);
console.log(errors ? R("Pehle upar ke FAIL theek karo, phir server chalao.") : G("Sab theek hai. npm run dev chalao."));
process.exit(errors ? 1 : 0);
