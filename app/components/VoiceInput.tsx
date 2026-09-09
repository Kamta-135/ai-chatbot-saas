"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

export function VoiceInput({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Component unmount ya page change hone par mic ko zaroor band karo,
  // warna "zombie" recognition session chalta reh sakta hai.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // already stopped — ignore
      }
    };
  }, []);

  function describeError(errorCode: string): string {
    switch (errorCode) {
      case "not-allowed":
      case "service-not-allowed":
        return "Mic permission blocked hai. Browser address bar ke pass 🔒/mic icon pe click karke 'Allow' karo, phir dobara try karo.";
      case "no-speech":
        return "Koi awaaz detect nahi hui. Mic ke paas se clearly bolo aur dobara try karo.";
      case "audio-capture":
        return "Mic nahi mila. Check karo ki koi mic connected hai aur kisi aur app/tab mein use nahi ho raha.";
      case "network":
        return "Voice recognition ke liye internet chahiye (Chrome isko cloud pe process karta hai) — connection check karo.";
      case "aborted":
        return ""; // user ne khud rok diya — koi error dikhane ki zaroorat nahi
      default:
        return `Voice input mein dikkat aayi (${errorCode}). Dobara try karo.`;
    }
  }

  const toggleListening = () => {
    if (disabled) return;

    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    // getUserMedia/SpeechRecognition sirf secure context (HTTPS ya localhost) mein chalta hai.
    const isSecureContext =
      typeof window !== "undefined" &&
      (window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1");
    if (!isSecureContext) {
      alert("Voice input sirf HTTPS ya localhost pe kaam karta hai. Deploy karne ke baad (Vercel HTTPS) yeh chalega.");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Yeh browser voice input support nahi karta (Firefox mein nahi chalta) — Chrome/Edge try karo.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript && transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      const message = describeError(event?.error || "unknown");
      if (message) alert(message);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch (e) {
      // 'InvalidStateError' aata hai agar recognition already start ho chuki ho
      console.error("VoiceInput start error:", e);
      alert("Mic start nahi ho paaya. Page refresh karke dobara try karo.");
      setListening(false);
    }
  };

  return (
    <button
      onClick={toggleListening}
      disabled={disabled}
      className={`p-2 rounded-full transition ${listening ? "bg-red-500 animate-pulse" : "bg-white/10 hover:bg-white/20"}`}
      type="button"
      title={disabled ? "Pichhli request poori hone ka wait karo" : listening ? "Sun raha hoon... click to stop" : "Voice input"}
      style={{
        width: 36, height: 36, borderRadius: "50%", border: "none",
        background: listening ? "#ef4444" : "rgba(255,255,255,0.1)",
        color: "white", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}
