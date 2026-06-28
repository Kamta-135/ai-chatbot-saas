"use client";
import { useRef, useState, useEffect } from "react";
import { X, Camera } from "lucide-react";

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setError("Camera access denied or not available.");
      }
    }
    startCamera();
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  function takePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        onCapture(file);
      }
    }, "image/jpeg");
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0f172a", borderRadius: 16, padding: 16, maxWidth: 480, width: "90%", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "white", fontSize: 14, fontWeight: 600 }}>Take Photo</span>
          <button onClick={handleClose} style={{ background: "transparent", border: "none", color: "white", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {error ? (
          <p style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 10, background: "#000" }} />
            <button
              onClick={takePhoto}
              style={{
                marginTop: 12, width: "100%", padding: "10px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Camera size={16} /> Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}
