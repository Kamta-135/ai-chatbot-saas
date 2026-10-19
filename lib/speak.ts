// Awaaz: pehle server ki natural Indian male voice (/api/tts).
// Jawab jaise-jaise stream hota hai, poora vaakya bante hi wo bolna shuru kar deti hai
// (pehle poora jawab banne ka intezaar karti thi, isliye awaaz late aati thi).
// Server voice fail ho to sirf tabhi browser voice jab browser mein Indian (Hindi / en-IN) voice ho —
// warna chup, taaki kisi doosre desh ki awaaz mein Hindi na bole.

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentCtrl: AbortController | null = null;
let currentResolve: (() => void) | null = null;
let speakId = 0;

const MALE_HINTS = ["madhur", "hemant", "prabhat", "ravi", "rishi", "kabir", "aarav"];
const FEMALE_HINTS = ["swara", "kalpana", "heera", "neerja", "veena", "lekha", "female"];

const nameHas = (v: SpeechSynthesisVoice, hints: string[]) =>
  hints.some((h) => v.name.toLowerCase().includes(h));
const isFemale = (v: SpeechSynthesisVoice) => nameHas(v, FEMALE_HINTS);
const isMale = (v: SpeechSynthesisVoice) => !isFemale(v) && nameHas(v, MALE_HINTS);
const langOf = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();

// ---------------------------------------------------------------------------------------------
// Text ko vaakyon / tukdon mein todna (pure functions, test ho chuke hain)
// ---------------------------------------------------------------------------------------------
const ABBREV = new Set(["dr", "mr", "mrs", "ms", "prof", "sr", "jr", "vs", "no", "st", "डॉ", "श्री", "श्रीमती", "कु"]);

// Poore vaakya (sentences) aur bacha hua adhoora hissa (rest). "Dr. Mohan", "3.5", "डॉ. मोहन" par nahi todta.
export function splitSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let boundary = false;
    if (c === "\n" || c === "\u0964") {
      boundary = true;
    } else if (c === "." || c === "!" || c === "?") {
      const next = text[i + 1];
      if (next !== undefined && /\s/.test(next)) {
        if (c === ".") {
          const word = (text.slice(start, i).match(/(\S+)$/)?.[1] || "").toLowerCase();
          boundary = !ABBREV.has(word);
        } else {
          boundary = true;
        }
      }
    }
    if (boundary) {
      const s = text.slice(start, i + 1).trim();
      if (s) sentences.push(s);
      start = i + 1;
    }
  }
  return { sentences, rest: text.slice(start) };
}

// Vaakyon ko tukdon mein jodo: pehla tukda chhota (jaldi bolna shuru), baaki ~320 akshar tak
function groupSentences(parts: string[], firstLimit: number, limit: number): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const s of parts) {
    const lim = chunks.length === 0 ? firstLimit : limit;
    if (cur && cur.length + s.length + 1 > lim) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? cur + " " + s : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Poora text ek saath (image jawab jaise): tukdon mein
export function splitForSpeech(text: string, firstLimit = 140, limit = 320): string[] {
  const clean = text.replace(/```[\s\S]*?```/g, " ").trim();
  const { sentences, rest } = splitSentences(clean);
  const parts = rest.trim() ? [...sentences, rest.trim()] : sentences;
  return groupSentences(parts, firstLimit, limit).slice(0, 14);
}

// Stream hote text se naye bolne layak tukde nikalo. `consumed` = ab tak kitne akshar tukdon mein ja chuke.
export function takeSpeechChunks(
  text: string,
  consumed: number,
  final: boolean,
  chunkCount: number
): { chunks: string[]; consumed: number } {
  const rest = text.slice(consumed);
  const { sentences, rest: tail } = splitSentences(rest);
  const parts = final && tail.trim() ? [...sentences, tail.trim()] : sentences;
  if (!parts.length) return { chunks: [], consumed: final ? text.length : consumed };
  const used = final ? rest.length : rest.length - tail.length;
  // Pehle tukde ke baad bahut chhote tukde mat bhejo (har tukde ka server round trip hota hai)
  if (!final && chunkCount > 0 && parts.join(" ").length < 100) return { chunks: [], consumed };
  const chunks = groupSentences(parts, chunkCount === 0 ? 140 : 320, 320);
  return { chunks, consumed: consumed + used };
}

// Code blocks bolne layak nahi: poore blocks hatao, aur adhoora khula block (abhi stream ho raha) bhi
export function stripCodeForSpeech(text: string): string {
  const closed = text.replace(/```[\s\S]*?```/g, " ");
  const open = closed.indexOf("```");
  return open >= 0 ? closed.slice(0, open) : closed;
}

// ---------------------------------------------------------------------------------------------
// Audio chalana
// ---------------------------------------------------------------------------------------------
function releaseAudio() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (currentResolve) {
    const r = currentResolve;
    currentResolve = null;
    r();
  }
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length) return resolve(existing);
    synth.onvoiceschanged = () => resolve(synth.getVoices());
    setTimeout(() => resolve(synth.getVoices()), 1500);
  });
}

function browserSpeak(text: string, id: number) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;
  const hindi = /[\u0900-\u097F]/.test(clean);

  loadVoices().then((voices) => {
    if (id !== speakId) return;
    const hi = voices.filter((v) => langOf(v).startsWith("hi"));
    const en = voices.filter((v) => langOf(v) === "en-in");
    if (!hi.length && !en.length) {
      console.warn("[speak] Browser mein koi Indian voice nahi hai, isliye browser voice skip ki.");
      return;
    }
    const pools = hindi ? [hi, en] : [en, hi];
    let voice: SpeechSynthesisVoice | undefined;
    for (const p of pools) {
      voice = p.find(isMale);
      if (voice) break;
    }
    if (!voice) {
      for (const p of pools) {
        voice = p.find((v) => !isFemale(v));
        if (voice) break;
      }
    }
    if (!voice) voice = pools[0][0] || pools[1][0];
    if (!voice) return;

    const u = new SpeechSynthesisUtterance(clean);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  speakId++;
  if (currentCtrl) {
    currentCtrl.abort();
    currentCtrl = null;
  }
  releaseAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function fetchChunkAudio(text: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error("/api/tts status " + res.status);
  return res.blob();
}

// Ek tukda bajao; khatam hone par (ya stop hone par) promise resolve hota hai
function playBlob(blob: Blob, id: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (id !== speakId) return resolve();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentUrl = url;
    currentResolve = resolve;
    audio.onended = () => {
      if (id === speakId) releaseAudio();
      else resolve();
    };
    audio.onerror = () => {
      releaseAudio();
      reject(new Error("audio play error"));
    };
    audio.play().catch((e) => {
      releaseAudio();
      reject(e);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Live speaker: stream hote jawab ke saath saath bolta hai
//   const s = createLiveSpeaker();  s.push(textSoFar) ... s.end(finalText)   (ya s.cancel())
// Server awaaz (Microsoft neural) chalti hai to wahi; na chale (jaise Vercel par 403) to turant browser ki
// awaaz se tukda-tukda bolta hai, aur 5 minute tak seedha browser voice (har jawab par server ka intezaar nahi).
// ---------------------------------------------------------------------------------------------
export interface LiveSpeaker {
  push(fullText: string): void;
  end(fullText: string): void;
  cancel(): void;
}

const MAX_SPOKEN_CHARS = 4000; // bahut lamba jawab poora nahi bolta (~4-5 minute ki audio)
const SERVER_DOWN_MS = 5 * 60 * 1000;
let serverVoiceDownUntil = 0;

export function createLiveSpeaker(): LiveSpeaker {
  if (typeof window === "undefined") return { push() {}, end() {}, cancel() {} };

  stopSpeaking();
  const id = speakId;
  const ctrl = new AbortController();
  currentCtrl = ctrl;

  const chunks: string[] = [];
  const pending: (Promise<Blob> | undefined)[] = [];
  let consumed = 0;
  let spoken = 0;
  let finished = false;
  let started = false;
  let playIndex = 0;
  let wake: (() => void) | null = null;
  let browserMode = Date.now() < serverVoiceDownUntil; // server awaaz haal hi mein fail hui thi
  let browserSpoken = 0; // chunks[0..browserSpoken) browser ko de diye gaye

  const request = (i: number) => {
    if (browserMode || i >= chunks.length || pending[i]) return;
    const p = fetchChunkAudio(chunks[i], ctrl.signal);
    p.catch(() => {}); // unhandled-rejection se bachne ke liye; asli error await par pakdi jaati hai
    pending[i] = p;
  };
  const notify = () => {
    const w = wake;
    wake = null;
    if (w) w();
  };
  const speakRestInBrowser = () => {
    for (; browserSpoken < chunks.length; browserSpoken++) browserSpeak(chunks[browserSpoken], id);
  };
  const switchToBrowser = (why: unknown) => {
    if (id !== speakId) return;
    console.warn("[speak] server awaaz nahi chali, browser voice par ja rahe hain:", why);
    serverVoiceDownUntil = Date.now() + SERVER_DOWN_MS;
    browserMode = true;
    browserSpoken = Math.min(playIndex, chunks.length); // jo server se bol chuke hain wo dobara nahi
    releaseAudio();
    speakRestInBrowser();
  };

  async function run() {
    try {
      for (playIndex = 0; ; playIndex++) {
        while (playIndex >= chunks.length) {
          if (finished) return;
          await new Promise<void>((r) => {
            wake = r;
          });
          if (id !== speakId) return;
        }
        for (let k = playIndex; k <= playIndex + 2; k++) request(k);
        let blob: Blob;
        try {
          blob = await pending[playIndex]!;
        } catch (e) {
          if (id !== speakId || (e as any)?.name === "AbortError") return;
          switchToBrowser(e);
          return;
        }
        if (id !== speakId) return;
        await playBlob(blob, id);
        if (id !== speakId) return;
      }
    } catch (e) {
      // audio chalane mein dikkat (jaise browser ne autoplay roka)
      if (id !== speakId) return;
      switchToBrowser(e);
    }
  }

  function feed(text: string, final: boolean) {
    if (id !== speakId) return;
    const res = takeSpeechChunks(stripCodeForSpeech(text), consumed, final, chunks.length);
    consumed = res.consumed;
    for (const c of res.chunks) {
      if (spoken >= MAX_SPOKEN_CHARS) break;
      spoken += c.length;
      chunks.push(c);
    }
    if (browserMode) {
      speakRestInBrowser();
      return;
    }
    for (let k = playIndex; k <= playIndex + 2; k++) request(k);
    if (chunks.length && !started) {
      started = true;
      void run();
    }
    if (res.chunks.length || final) notify();
  }

  return {
    push(fullText: string) {
      feed(fullText, false);
    },
    end(fullText: string) {
      finished = true;
      feed(fullText, true);
      notify();
    },
    cancel() {
      if (id === speakId) stopSpeaking();
    },
  };
}

// Poora text ek saath bolna (image ka jawab jaise)
export async function speak(text: string) {
  if (typeof window === "undefined") return;
  const input = text.trim();
  if (!input) return;
  const s = createLiveSpeaker();
  s.end(input);
}
