"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

interface AudioRecorderProps {
  onRecorded: (file: File) => void;
  onCleared: () => void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioRecorder({ onRecorded, onCleared, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Rilascia microfono e object URL anche se il componente viene smontato
  // mentre la registrazione è in corso.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  async function startRecording() {
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Il tuo browser non supporta la registrazione audio. Carica un file o usa le note testuali.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType?.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `nota-vocale.${extension}`, { type });

        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        onRecorded(file);

        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setIsRecording(true);
    } catch {
      setError("Permesso microfono negato. Autorizza l'accesso oppure carica un file audio.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  function clear() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setSeconds(0);
    onCleared();
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-xl bg-status-blocked px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:brightness-110"
          >
            <Square className="h-4 w-4" />
            Ferma registrazione
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            {previewUrl ? "Registra di nuovo" : "Registra nota vocale"}
          </button>
        )}

        {isRecording && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-status-blocked" aria-hidden="true" />
            {formatDuration(seconds)}
          </span>
        )}

        {previewUrl && !isRecording && (
          <button
            type="button"
            onClick={clear}
            aria-label="Elimina registrazione"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-status-blocked"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {previewUrl && !isRecording && (
        <audio controls src={previewUrl} className="mt-3 w-full">
          Il tuo browser non supporta la riproduzione audio.
        </audio>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
