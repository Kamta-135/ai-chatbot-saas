"use client";

import React, { useState } from "react";
import { AttachMenu } from "./components/AttachMenu";
import { VoiceInput } from "./components/VoiceInput";
import { Volume2, VolumeX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("openai/gpt-4.1-mini");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  function speak(text: string) {
    if (typeof window === "undefined") return;
    if (!voiceEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoice() {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setVoiceEnabled((v) => !v);
  }

  async function handleFileUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/upload-document", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Document upload failed." }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Document "${file.name}" uploaded and added to knowledge base ✅` }]);
      }
    } catch {
      setError("Network error");
      setMessages((prev) => [...prev, { role: "assistant", content: "Document upload failed. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageSelected(file: File) {
    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: `📷 Sent image: ${file.name}` }]);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/chat/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, question: input.trim() }),
      });

      const data = await res.json();

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
    if (!input.trim()) return;

    const userInput = input.trim();
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput, model }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "LLM request failed");
        setMessages((prev) => [...prev, { role: "assistant", content: "Error talking to AI. Please try again." }]);
      } else {
        const answer = data.answer || "No answer from AI.";
        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
        speak(answer);
      }
    } catch {
      setError("Network error");
      setMessages((prev) => [...prev, { role: "assistant", content: "Error talking to AI. Please try again." }]);
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

            {loading && (
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
                onDocumentSelected={handleFileUpload}
                onImageSelected={handleImageSelected}
                onCameraCapture={handleImageSelected}
              />
              <VoiceInput onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))} />
              <input
                className="chat-input"
                placeholder="Ask anything…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (input.trim()) (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
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