# AI Chatbot (Nexora) - Setup, Chalana aur Problem Solving

## 1. Roz ka kaam
```
npm run dev                         # server chalao  -> http://localhost:3000
node scripts/smoke-test.mjs         # (doosre terminal mein) har feature ek-ek karke test
node scripts/check-env.mjs          # keys + internet + Supabase ki jaanch
node scripts/fix-env.mjs            # Supabase URL galat format (/rest/v1/, dashboard link) ho to khud theek karta hai
node scripts/patch-next-config.mjs  # production PDF fix (next.config mein externals)
```
Kuch toote to pehle `node scripts/smoke-test.mjs` chalao. Wo seedha bata deta hai kaun sa hissa fail hua aur kya karna hai.

## 2. .env.local (copy .env.example -> .env.local)
| Variable | Kahan se | Kaise pehchaanein |
|---|---|---|
| OPENROUTER_API_KEY | openrouter.ai/keys | `sk-or-v1-` se shuru. OpenAI ki key NAHI chalegi |
| NEXT_PUBLIC_SUPABASE_URL | Supabase > Project Settings > API | `https://xxxx.supabase.co` |
| SUPABASE_SERVICE_ROLE_KEY | wahi page (service_role / secret) | `eyJ...` ya `sb_secret_...` |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | wahi page (anon / publishable) | `eyJ...` |
| TAVILY_API_KEY | app.tavily.com (free) | `tvly-` se shuru. Link paste mat karo |
| GEMINI_API_KEY | aistudio.google.com | optional (image backup) |

Key change karne ke baad server ko `Ctrl+C` karke dobara chalao (env sirf start par load hota hai).
`.env.local` ko kabhi git mein mat daalo, aur kisi ko chat/screenshot mein mat dikhao.

## 3. Problem -> Wajah -> Fix
| Dikhta kya hai | Wajah | Fix |
|---|---|---|
| Chat: "Error talking to AI" / terminal mein `User not found 401` | OpenRouter key galat/revoke | Nayi key banao, `.env.local` + Vercel dono mein badlo, restart/redeploy |
| Chat: "Ye AI model abhi available nahi hai" | Model band ho gaya | `.env.local` mein `OPENROUTER_MODEL=openai/gpt-4.1-mini` (default yahi hai; fallback bhi hai) |
| Jawab late / awaaz late | Live search ya Supabase slow | Terminal ke `[timing]` lines dekho; documents upload na hon to search skip hoti hai |
| "mp ke cm" jaise sawaal ka purana jawab | TAVILY key galat/missing | `node scripts/check-env.mjs`, sahi `tvly-` key |
| Terminal: `ENOTFOUND ...supabase.co` | Supabase project paused | supabase.com/dashboard > Resume project |
| PDF: "Database (Supabase) se connect nahi ho pa raha" | wahi, ya internet | Resume project / internet check |
| PDF: `DOMMatrix is not defined` (Vercel) | purana pdf-parse ka native canvas Vercel par nahi milta | Ab `unpdf` use hota hai (`npm install unpdf`), koi native part nahi |
| PDF: `pdf.worker.mjs` error (production) | next.config mein externals nahi | `node scripts/patch-next-config.mjs` |
| Voice: `Edge TTS WebSocket error: 403` (Vercel par) | Microsoft ka free server Vercel ko block karta hai | Azure Speech (free F0): Vercel env mein `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. Tab tak browser ki awaaz (Edge mein Madhur) bolti hai |
| Awaaz Hindi mein ajeeb / alag desh ki | Server voice chali nahi, browser voice bol raha | terminal mein `[tts] error` dekho, `msedge-tts` install karo |
| Voice bilkul nahi | Browser autoplay block / mute icon | Page par ek baar click karo, speaker icon check karo |
| Camera nahi khulta | Permission blocked ya HTTP | Address bar ke lock icon se Camera Allow (localhost / https par hi chalta hai) |
| `npm` not recognized | Node PATH mein nahi | `$env:Path += ";C:\Program Files\nodejs"` ya VS Code poora band-khol |

## 4. Live site (Vercel) checklist
1. Vercel > Settings > Environment Variables: upar ki saari keys (Production tick) dalo, phir Redeploy.
2. `vercel.json` ka cron roz `/api/keepalive` ko bulata hai, to Supabase free project pause nahi hota. (Optional: `CRON_SECRET` set karo.)
3. Deploy ke baad: `node scripts/smoke-test.mjs https://tumhari-site.vercel.app`
4. `/api/health` live site par band rehta hai (sirf local ke liye). Zaroorat ho to `ENABLE_HEALTH=1` set karo, kaam ke baad hata do.

## 5. Kaun si file kya karti hai
- `app/page.tsx`: chat screen (stream hota jawab, voice, upload buttons)
- `app/api/chat/route.ts`: chat (language, RAG, live search, history save)
- `app/api/chat/upload-document`: PDF/TXT -> chunks -> embeddings -> Supabase
- `app/api/chat/analyze-image`: photo analysis
- `app/api/tts`: Indian male awaaz (Microsoft neural, Madhur / Prabhat)
- `app/api/health`, `app/api/keepalive`: jaanch aur Supabase ko jagaye rakhna
- `lib/*`: live-search, rag-search, speak, chunk-text, with-timeout, env-check ...
