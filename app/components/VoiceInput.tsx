"use client";
import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

export function VoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported on this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <button
      onClick={toggleListening}
      className={`p-2 rounded-full transition ${listening ? "bg-red-500 animate-pulse" : "bg-white/10 hover:bg-white/20"}`}
      type="button"
      style={{
        width: 36, height: 36, borderRadius: "50%", border: "none",
        background: listening ? "#ef4444" : "rgba(255,255,255,0.1)",
        color: "white", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0,
      }}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}
