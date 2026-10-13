// Chalane ka tareeka (server chalte hue, doosre terminal mein):  node scripts/smoke-test.mjs
// Ya live site:  node scripts/smoke-test.mjs https://tumhari-site.vercel.app
// Har feature ek-ek karke test hota hai, aur fail hone par seedha batata hai ki kya check karna hai.
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const G = (s) => (color ? `\x1b[32m${s}\x1b[0m` : s), R = (s) => (color ? `\x1b[31m${s}\x1b[0m` : s), Y = (s) => (color ? `\x1b[33m${s}\x1b[0m` : s);
let pass = 0, fail = 0, warn = 0;

async function step(name, fn, tip) {
  const t = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t;
    if (r && r.warn) { warn++; console.log(Y("WARN ") + `${name} (${ms}ms) - ${r.warn}`); }
    else { pass++; console.log(G("PASS ") + `${name} (${ms}ms)${r && r.info ? " - " + r.info : ""}`); }
  } catch (e) {
    fail++;
    console.log(R("FAIL ") + `${name} - ${e.message}`);
    if (tip) console.log("      Fix: " + tip);
  }
}

const post = (path, body, extra = {}) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...extra });
const sid = "smoke-" + Date.now();
const TEST_PDF_B64 = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMDMgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MDAgVGQgKEJob3BhbCBpcyB0aGUgY2FwaXRhbCBvZiBNYWRoeWEgUHJhZGVzaC4gSXQgaXMgY2FsbGVkIHRoZSBDaXR5IG9mIExha2VzLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzOTUgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0NjUKJSVFT0YK";

// Jawab khaali ya JSON na ho tab bhi crash nahi hota; seedha dikhata hai ki server ne kya bheja
async function readBody(r) {
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  const brief = json ? (json.error || json.detail ? `${json.error || ""} ${json.detail || ""}`.trim() : JSON.stringify(json).slice(0, 160)) : (text ? text.replace(/\s+/g, " ").slice(0, 160) : "(khaali jawab)");
  return { json, text, brief };
}

// JSON jawab chahiye; khaali / HTML jawab par saaf message ("Unexpected end of JSON" nahi)
async function J(r) {
  const b = await readBody(r);
  if (!b.json) throw new Error(`status ${r.status}: ${b.brief}`);
  return b.json;
}

console.log(`\nSmoke test: ${BASE}\n`);

await step("Server / page khul raha hai", async () => {
  const r = await fetch(BASE + "/");
  if (!r.ok) throw new Error("status " + r.status);
}, "npm run dev chalu hai? URL sahi hai?");

await step("Health check (keys + services)", async () => {
  const r = await fetch(BASE + "/api/health");
  if (r.status === 404) return { warn: "health band hai (live site par normal). Local par npm run dev se chalta hai" };
  const j = await J(r);
  const bad = [];
  if (j.envProblems && j.envProblems !== "sab theek hai") for (const p of j.envProblems) if (p.level === "error") bad.push(`${p.name}: ${p.message}`);
  for (const k of ["chatModel", "liveSearch", "voice", "pdf", "supabase", "embeddings"]) if (j[k] && j[k].ok === false) bad.push(`${k}: ${j[k].error}`);
  if (bad.length) throw new Error("\n      - " + bad.join("\n      - "));
  return { info: "keys, search, voice, supabase, embeddings sab OK" };
}, "node scripts/check-env.mjs chalao, wo bata dega kaunsi key/service galat hai");

await step("Chat (normal jawab)", async () => {
  const r = await post("/api/chat", { message: "Say hello in one short sentence.", sessionId: sid });
  const j = await J(r);
  if (!r.ok) throw new Error(`status ${r.status}: ${j.error}`);
  if (!j.answer || j.answer === "No answer from model.") throw new Error("khaali jawab aaya");
  return { info: j.answer.slice(0, 60).replace(/\n/g, " ") };
}, "OPENROUTER_API_KEY galat/expire ho sakti hai (openrouter.ai/keys), ya credit khatam");

await step("Chat (streaming, shabd-shabd)", async () => {
  const r = await post("/api/chat", { message: "Count from 1 to 5 in words.", sessionId: sid, stream: true });
  if (!r.ok || !r.body) throw new Error("status " + r.status);
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let text = "", chunks = 0, first = 0; const t0 = Date.now();
  while (true) { const { done, value } = await reader.read(); if (done) break; if (!first) first = Date.now() - t0; chunks++; text += dec.decode(value, { stream: true }); }
  if (!text.trim()) throw new Error("stream khaali aaya");
  if (first > 7000) return { warn: `pehla tukda ${first}ms mein aaya, ye dheema hai (live search / model / Supabase check karo)` };
  return { info: `pehla tukda ${first}ms mein, ${chunks} tukde` };
});

await step("Live info (mp ke cm kon hai)", async () => {
  const r = await post("/api/chat", { message: "mp ke cm kon hai", sessionId: sid });
  const j = await J(r);
  if (!r.ok) throw new Error(`status ${r.status}: ${j.error}`);
  const a = j.answer || "";
  if (/Mohan Yadav|मोहन यादव|मोहन/.test(a)) return { info: "Mohan Yadav mila" };
  if (/Shivraj|शिवराज/.test(a)) throw new Error("purana jawab (Shivraj) aaya, live search kaam nahi kar raha");
  return { warn: "jawab mein CM ka naam nahi mila: " + a.slice(0, 80).replace(/\n/g, " ") };
}, "TAVILY_API_KEY check karo (tvly- se shuru, link nahi). node scripts/check-env.mjs chalao");

await step("Voice (Indian male awaaz)", async () => {
  const r = await post("/api/tts", { text: "नमस्ते, मैं आपका एआई असिस्टेंट हूँ।" });
  if (!r.ok) throw new Error(`status ${r.status}: ${(await readBody(r)).brief}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 2000 || !(r.headers.get("content-type") || "").includes("audio")) throw new Error("audio nahi aaya");
  return { info: `${buf.byteLength} bytes audio` };
}, "msedge-tts install hai? (npm install msedge-tts). Microsoft ki service kabhi kabhi band hoti hai, terminal mein [tts] error line dekho");

await step("Image analysis", async () => {
  // 1x1 laal pixel PNG
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await post("/api/chat/analyze-image", { image: png, question: "What is in this image? Answer in one short line." });
  const j = await J(r);
  if (!r.ok) throw new Error(`status ${r.status}: ${j.error}`);
  if (!j.answer) throw new Error("khaali jawab");
  return { info: j.answer.slice(0, 60).replace(/\n/g, " ") };
}, "OPENROUTER_API_KEY / credit check karo (ya GEMINI_API_KEY backup ke liye)");

await step("Document upload + RAG", async () => {
  const marker = "ZEBRA-" + Math.floor(Math.random() * 9000 + 1000);
  const text = `Ye ek test document hai. Is document ka secret code ${marker} hai. Bhopal Madhya Pradesh ki rajdhani hai.`;
  const fd = new FormData();
  fd.append("file", new Blob([text], { type: "text/plain" }), "smoke-test.txt");
  fd.append("sessionId", sid);
  const up = await fetch(BASE + "/api/chat/upload-document", { method: "POST", body: fd });
  const ub = await readBody(up);
  const uj = ub.json || {};
  if (!up.ok || !ub.json) throw new Error(`upload status ${up.status}: ${ub.brief}`);
  const r = await post("/api/chat", { message: "Is document ka secret code kya hai?", sessionId: sid });
  const j = await J(r);
  if (!r.ok) throw new Error(`chat status ${r.status}: ${j.error}`);
  if (!(j.answer || "").includes(marker)) return { warn: `upload ho gaya (${uj.chunks} chunk) par jawab mein code nahi aaya (embeddings ya match_documents check karo)` };
  return { info: `upload + search sahi (${uj.chunks} chunk, code mila)` };
}, "Supabase project ACTIVE hai? (supabase.com/dashboard > Resume project). node scripts/check-env.mjs bhi chalao");

await step("PDF upload + search", async () => {
  const pdfSid = sid + "-pdf";
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from(TEST_PDF_B64, "base64")], { type: "application/pdf" }), "smoke-test.pdf");
  fd.append("sessionId", pdfSid);
  const up = await fetch(BASE + "/api/chat/upload-document", { method: "POST", body: fd });
  const ub = await readBody(up);
  if (!up.ok || !ub.json) throw new Error(`upload status ${up.status}: ${ub.brief}`);
  const r = await post("/api/chat", { message: "Is PDF mein Bhopal ke baare mein kya likha hai?", sessionId: pdfSid });
  const j = await J(r);
  if (!r.ok) throw new Error(`chat status ${r.status}: ${j.error}`);
  if (!/capital|Madhya Pradesh|मध्य प्रदेश|भोपाल|Lakes|झील/i.test(j.answer || "")) return { warn: "PDF upload ho gaya par jawab mein PDF ki baat nahi dikhi: " + (j.answer || "").slice(0, 80).replace(/\n/g, " ") };
  return { info: `PDF padha gaya (${ub.json.chunks} chunk) aur jawab mein use hua` };
}, "PDF padhne mein dikkat: Vercel > Logs mein upload-document ki laal line dekho (pdf-parse / canvas). /api/health ka pdf wala hissa bhi dekho");

console.log(`\nResult: ${G(pass + " pass")}, ${warn ? Y(warn + " warning") : "0 warning"}, ${fail ? R(fail + " fail") : "0 fail"}`);
process.exit(fail ? 1 : 0);
