"use client";
import { useState, useRef, useEffect } from "react";
import { Plus, FileText, Image as ImageIcon, Camera } from "lucide-react";
import { CameraCapture } from "./CameraCapture";

type AttachMenuProps = {
  onDocumentSelected: (file: File) => void;
  onImageSelected: (file: File) => void;
  onCameraCapture: (file: File) => void;
};

export function AttachMenu({ onDocumentSelected, onImageSelected, onCameraCapture }: AttachMenuProps) {
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <input
        ref={docInputRef}
        type="file"
        accept=".txt,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onDocumentSelected(file);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageSelected(file);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)",
          border: "none", color: "white", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", flexShrink: 0,
        }}
      >
        <Plus size={18} style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "#1a1a2e",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 6,
          minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 50,
        }}>
          <MenuItem icon={<FileText size={16} />} label="Upload Document (.txt / .pdf)" onClick={() => { docInputRef.current?.click(); setOpen(false); }} />
          <MenuItem icon={<ImageIcon size={16} />} label="Upload Image" onClick={() => { imageInputRef.current?.click(); setOpen(false); }} />
          <MenuItem icon={<Camera size={16} />} label="Take Photo" onClick={() => { setCameraOpen(true); setOpen(false); }} />
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => { onCameraCapture(file); setCameraOpen(false); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
        background: "transparent", border: "none", color: "white", fontSize: 14,
        borderRadius: 8, cursor: "pointer", textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}
