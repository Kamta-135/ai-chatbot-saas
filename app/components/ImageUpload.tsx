"use client";
import { Camera } from "lucide-react";
import { useRef } from "react";

export function ImageUpload({ onImageSelected }: { onImageSelected: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageSelected(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="p-2 rounded-full bg-white/10 hover:bg-white/20"
      >
        <Camera size={18} />
      </button>
    </>
  );
}