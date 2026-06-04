"use client";

import { useState, useEffect, useRef } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Check browser support for speech APIs
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      ("webkitSpeechRecognition" in window ||
        "SpeechRecognition" in window) &&
      "speechSynthesis" in window
    ) {
      setVoiceEnabled(true);
    } else {
      setVoiceEnabled(false);
    }
  }, []);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const newMessage: ChatMessage = { role: "user", content };
    const newHistory = [...messages, newMessage];

    setMessages(newHistory);
    setInput("");
    setLoading(true);
    setError("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage.content,
          history: newHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Backend error");
        return;
      }

      const reply: ChatMessage = {
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, reply]);

      // Text-to-speech for AI reply
      if (voiceEnabled && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(data.reply);
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch (e: any) {
      setError(e.message || "Request failed");
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleListening = () => {
    if (!voiceEnabled) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError("");
    };

    recognition.onerror = (event: any) => {
      setError(event.error || "Voice recognition error");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      // Automatically send after recognition
      sendMessage(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <main className="app-root">
      <div className="bg-orbit orbit-1" />
      <div className="bg-orbit orbit-2" />
      <div className="bg-orbit orbit-3" />

      <div className="chat-shell">
        <header className="chat-header">
          <div className="chat-logo">
            <span className="logo-dot" />
            <span className="logo-text">AI Chatbot</span>
          </div>
          <div className="chat-status">
            <span className="status-dot" />
            <span className="status-text">
              {loading || isTyping
                ? "Thinking..."
                : isListening
                ? "Listening..."
                : "Online"}
            </span>
          </div>
        </header>

        <div className="chat-body">
          {messages.length === 0 && !error && (
            <div className="chat-empty">
              <h2>Welcome!</h2>
              <p>Type or speak your question. Try things like:</p>
              <ul>
                <li>“Explain my AI chatbot architecture.”</li>
                <li>“Write a reply for my client.”</li>
                <li>“Optimize this code for production.”</li>
              </ul>
            </div>
          )}

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`message-row ${
                  m.role === "user" ? "from-user" : "from-ai"
                }`}
              >
                <div className="message-bubble">
                  <div className="message-meta">
                    <span className="message-author">
                      {m.role === "user" ? "You" : "AI"}
                    </span>
                  </div>
                  <div className="message-text">{m.content}</div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="message-row from-ai">
                <div className="message-bubble typing-bubble">
                  <div className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {error && <p className="chat-error">Error: {error}</p>}

        <footer className="chat-footer">
          <div className="input-wrapper">
            <button
              type="button"
              className={`mic-button ${
                isListening ? "mic-button-active" : ""
              }`}
              onClick={toggleListening}
              disabled={!voiceEnabled}
              title={
                voiceEnabled
                  ? isListening
                    ? "Stop listening"
                    : "Start voice input"
                  : "Voice not supported in this browser"
              }
            >
              🎤
            </button>

            <textarea
              rows={2}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voiceEnabled
                  ? "Type or use the mic to ask anything…"
                  : "Type your message…"
              }
            />
            <button
              className="send-button"
              onClick={() => sendMessage()}
              disabled={loading}
            >
              <span className="send-icon">➤</span>
            </button>
          </div>
          <p className="chat-hint">
            Press <kbd>Enter</kbd> to send, <kbd>Shift</kbd> + <kbd>Enter</kbd>{" "}
            for new line. {voiceEnabled ? "Mic button for voice." : ""}
          </p>
        </footer>
      </div>
    </main>
  );
}