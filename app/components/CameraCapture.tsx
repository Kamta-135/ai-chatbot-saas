"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCcw } from "lucide-react";

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setError(null);
      setReady(false);
      stopStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Is browser mein camera support nahi hai (ya page HTTPS / localhost par nahi khula hai).");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
          setReady(true);
        }
      } catch (e: any) {
        const name = e?.name as string | undefined;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Camera ki permission blocked hai. Address bar ke lock icon se Camera ko Allow karo, phir dobara try karo.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("Is device mein camera nahi mila.");
        } else if (name === "NotReadableError") {
          setError("Camera kisi aur app ya tab mein use ho raha hai. Use band karke dobara try karo.");
        } else {
          setError("Camera start nahi ho paya: " + (e?.message || name || "unknown error"));
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 1600 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.88
    );
  }

  const btn: React.CSSProperties = {
    width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", color: "white",
    background: "rgba(255,255,255,0.14)",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.88)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <button type="button" onClick={onClose} title="Close" style={{ ...btn, position: "absolute", top: 16, right: 16, width: 40, height: 40 }}>
        <X size={18} />
      </button>

      <div style={{ position: "relative", width: "100%", maxWidth: 560 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: "100%", maxHeight: "70vh", borderRadius: 16, background: "#000", objectFit: "contain",
            transform: facing === "user" ? "scaleX(-1)" : "none",
          }}
        />
        {error && (
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center", padding: 24, color: "#fecaca", fontSize: 14, lineHeight: 1.5,
              background: "rgba(0,0,0,0.75)", borderRadius: 16,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 20 }}>
        <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} title="Camera badlo" style={btn}>
          <RefreshCcw size={20} />
        </button>
        <button
          type="button"
          onClick={capture}
          disabled={!ready || !!error}
          title="Photo kheencho"
          style={{ ...btn, width: 72, height: 72, background: ready && !error ? "#2563eb" : "rgba(255,255,255,0.14)", opacity: ready && !error ? 1 : 0.5, cursor: ready && !error ? "pointer" : "not-allowed" }}
        >
          <Camera size={28} />
        </button>
        <div style={{ width: 52 }} />
      </div>
    </div>
  );
}
