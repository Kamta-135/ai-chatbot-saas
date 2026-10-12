"use client";

import React, { useState } from "react";
import { AttachMenu } from "./components/AttachMenu";
import { VoiceInput } from "./components/VoiceInput";
import { Volume2, VolumeX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSessionId } from "@/lib/client-session";
import { speak as speakText, stopSpeaking, createLiveSpeaker } from "@/lib/speak";
import { fileToDataUrlResized } from "@/lib/image-utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Document ki search (Supabase + embedding) tabhi hoti hai jab is browser se kabhi document upload hua ho.
// Normal sawaalon mein ye 1-3 second bachata hai.
const DOCS_FLAG = "nexora_has_docs";
function hasUploadedDocs(): boolean {
  try {
    return localStorage.getItem(DOCS_FLAG) === "1";
  } catch {
    return false;
  }
}
function markUploadedDocs() {
  try {
    localStorage.setItem(DOCS_FLAG, "1");
  } catch {}
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("openai/gpt-4.1-mini");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Male Indian voice (Hindi / Indian English) — logic lib/speak.ts mein hai
  function speak(text: string) {
    if (typeof window === "undefined") return;
    if (!voiceEnabled) return;
    speakText(text);
  }

  function toggleVoice() {
    stopSpeaking();
    setVoiceEnabled((v) => !v);
  }

  // Chat model se jawab shabd-shabd (stream) mangta hai, screen par live dikhata hai, aur ant mein bolta hai.
  // sendMessage aur document upload ke baad auto-explain dono yahi use karte hain.
  async function streamAssistantReply(message: string, historySnapshot: ChatMessage[], useDocs: boolean = hasUploadedDocs()) {
    stopSpeaking();
    // Awaaz jawab ke saath-saath bolti hai (poora jawab banne ka intezaar nahi)
    const speaker = voiceEnabled ? createLiveSpeaker() : null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          model,
          history: historySnapshot,
          sessionId: getSessionId(),
          stream: true,
          useDocs,
        }),
      });

      if (!res.ok || !res.body) {
        speaker?.cancel();
        let msg = "LLM request failed";
        try {
          const data = await res.json();
          msg = data.error ?? msg;
        } catch {}
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: "Error talking to AI. Please try again." }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        speaker?.push(answer);
        const current = answer;
        if (!started) {
          started = true;
          setStreaming(true);
          setMessages((prev) => [...prev, { role: "assistant", content: current }]);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: current };
            return next;
          });
        }
      }
      answer += decoder.decode();

      if (!answer.trim()) {
        speaker?.cancel();
        setMessages((prev) => [...prev, { role: "assistant", content: "No answer from AI." }]);
      } else {
        const finalText = answer;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: finalText };
          return next;
        });
        speaker?.end(finalText);
      }
    } catch {
      speaker?.cancel();
      setError("Network error");
      setMessages((prev) => [...prev, { role: "assistant", content: "Error talking to AI. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  async function handleFileUpload(file: File) {
    // Agar pehle se koi chat/upload/image request chal rahi hai, to naya action shuru mat karo —
    // warna responses random order mein screen pe aa jaate hain.
    if (loading) return;

    const historySnapshot = messages;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", getSessionId());
    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: `📄 Sent document: ${file.name}` }]);

    try {
      const res = await fetch("/api/chat/upload-document", { method: "POST", body: formData });
      let data: any = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Document upload failed." }]);
        return;
      }

      markUploadedDocs();
      setMessages((prev) => [...prev, { role: "assistant", content: `Document "${file.name}" uploaded and added to knowledge base ✅` }]);

      // Upload ke turant baad khud hi document ko explain karo (stream hota hua jawab)
      await streamAssistantReply(
        `Maine "${file.name}" naam ka document upload kiya hai. Iska content padh kar mujhe achhe se samjhao ki isme kya hai.`,
        historySnapshot,
        true
      );
    } catch {
      setError("Network error");
      setMessages((prev) => [...prev, { role: "assistant", content: "Document upload failed. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageSelected(file: File) {
    if (loading) return; // ek waqt mein ek hi request — ordering safe rakhne ke liye

    // Chat ki language pehchaanne ke liye pichhla user text (photo/document wale message chhodkar)
    const languageHint =
      [...messages].reverse().find((m) => m.role === "user" && !m.content.startsWith("📷") && !m.content.startsWith("📄"))
        ?.content ?? "";

    setError(null);
    setLoading(true);
    stopSpeaking();
    setMessages((prev) => [...prev, { role: "user", content: `📷 Sent image: ${file.name}` }]);

    try {
      // Badi photo ko browser mein hi chhota (max 1600px) kar do — upload tez, analysis same
      const base64 = await fileToDataUrlResized(file);

      const res = await fetch("/api/chat/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, question: input.trim(), languageHint }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        setError(data.error ?? "Image analysis failed");
        setMessages((prev) => [...prev, { role: "assistant", content: "Image analyze nahi ho paayi. Try again." }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
        speak(data.answer);
      }
    } catch {
      setError("Network error");
      setMessages((prev) => [...prev, { role: "assistant", content: "Image analyze nahi ho paayi. Try again." }]);
    } finally {
      setLoading(false);
      setInput("");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!input.trim() || loading) return; // ek waqt mein ek hi request

    const userInput = input.trim();
    // Pichhli baat-cheet (history) naya message add karne se PEHLE snapshot karo,
    // taaki "hn"/"aur batao" jaise follow-ups ka context backend ko mile.
    const historyForRequest = messages;
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);

    try {
      await streamAssistantReply(userInput, historyForRequest);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-root">
      <div className="bg-orbit orbit-1" />
      <div className="bg-orbit orbit-2" />
      <div className="bg-orbit orbit-3" />

      <div className="chat-shell">
        <div className="chat-header">
          <div className="chat-logo">
            <div className="logo-dot" />
            <div className="logo-text">AI Chatbot</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={toggleVoice}
              title={voiceEnabled ? "Voice ON — click to mute" : "Voice OFF — click to unmute"}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(148,163,184,0.3)",
                borderRadius: 999,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: voiceEnabled ? "#22c55e" : "#94a3b8",
              }}
            >
              {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <div className="chat-status">
              <span className="status-dot" />
              <span className="status-text">Online · RAG powered</span>
            </div>
          </div>
        </div>

        <div className="chat-body">
          {messages.length === 0 && (
            <div className="chat-empty">
              <h2>Welcome to your AI workspace</h2>
              <p>Ask questions about your Supabase docs, product copy, or ideas. Your AI assistant will use RAG to pull relevant context.</p>
              <ul>
                <li>"Summarize the test document stored in Supabase."</li>
                <li>"Explain what RAG is in simple terms."</li>
                <li>"Help me debug a Supabase query error."</li>
              </ul>
            </div>
          )}

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`message-row ${m.role === "user" ? "from-user" : "from-ai"}`}>
                <div className="message-bubble">
                  {m.role === "assistant" ? (
                    <div className="message-text markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="message-text">{m.content}</div>
                  )}
                </div>
              </div>
            ))}

            {loading && !streaming && (
              <div className="message-row from-ai">
                <div className="message-bubble">
                  <div className="typing-dots"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="chat-error">{error}</div>}

        <div className="chat-footer">
          <form onSubmit={sendMessage}>
            <div className="input-wrapper">
              <AttachMenu
                disabled={loading}
                onDocumentSelected={handleFileUpload}
                onImageSelected={handleImageSelected}
                onCameraCapture={handleImageSelected}
              />
              <VoiceInput disabled={loading} onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))} />
              <input
                className="chat-input"
                placeholder="Ask anything…"
                value={input}
                disabled={loading}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (input.trim() && !loading) (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                  }
                }}
              />
              <button type="submit" className="send-button" disabled={loading || !input.trim()}>
                <span className="send-icon">➤</span>
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
