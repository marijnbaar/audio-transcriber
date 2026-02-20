"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface HistoryItem {
  id: string;
  fileName: string;
  language: string;
  duration: number;
  segments: Segment[];
  createdAt: string;
}

const STORAGE_KEY = "audio-transcriber-history";
const SEEDED_KEY = "audio-transcriber-seeded";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s} seconden`;
  return `${m} min ${s} sec`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LANGUAGE_NAMES: Record<string, string> = {
  nl: "Nederlands",
  en: "Engels",
  de: "Duits",
  fr: "Frans",
  es: "Spaans",
  it: "Italiaans",
  pt: "Portugees",
};

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = loadHistory();
    const alreadySeeded = localStorage.getItem(SEEDED_KEY);

    if (!alreadySeeded) {
      fetch("/seed-history.json")
        .then((r) => r.json())
        .then((seed: HistoryItem[]) => {
          const merged = [...seed, ...existing];
          saveHistory(merged);
          setHistory(merged);
          localStorage.setItem(SEEDED_KEY, "true");
        })
        .catch(() => {
          setHistory(existing);
        });
    } else {
      setHistory(existing);
    }
  }, []);

  const selected = history.find((h) => h.id === selectedId) || null;

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError("");
    setSelectedId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!file) return;

    setLoading(true);
    setError("");
    setSelectedId(null);
    setProgress("Bestand uploaden...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress("Transcriptie wordt gemaakt...");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Er ging iets mis");
      }

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        fileName: file.name,
        language: data.language,
        duration: data.duration,
        segments: data.segments,
        createdAt: new Date().toISOString(),
      };

      const updated = [item, ...history];
      setHistory(updated);
      saveHistory(updated);
      setSelectedId(item.id);
      setFile(null);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
    if (selectedId === id) setSelectedId(null);
  };

  const copyToClipboard = async (item: HistoryItem) => {
    const text = item.segments
      .map((seg) => `[${formatTime(seg.start)}] ${seg.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsText = (item: HistoryItem) => {
    const text = item.segments
      .map((seg) => `[${formatTime(seg.start)}] ${seg.text}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = item.fileName.replace(/\.[^.]+$/, "");
    a.download = `${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Audio Transcriber
      </h1>
      <p className="text-gray-500 mb-8">
        Upload een audiobestand om een transcriptie te maken
      </p>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 hover:border-gray-400 bg-white"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <div>
            <p className="text-green-700 font-medium">{file.name}</p>
            <p className="text-green-600 text-sm mt-1">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Klik om een ander bestand te kiezen
            </p>
          </div>
        ) : (
          <div>
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"
              />
            </svg>
            <p className="text-gray-600">
              Sleep een audiobestand hierheen of{" "}
              <span className="text-blue-600 font-medium">
                klik om te kiezen
              </span>
            </p>
            <p className="text-gray-400 text-sm mt-1">
              MP3, WAV, M4A, OGG, FLAC — max 25 MB
            </p>
          </div>
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="mt-4 w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? progress : "Transcriberen"}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Transcription display */}
      {selected && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {selected.fileName}
            </h2>
            <button
              onClick={() => setSelectedId(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Sluiten
            </button>
          </div>

          {/* Metadata */}
          <div className="flex gap-4 mb-4 text-sm text-gray-500">
            {selected.language && (
              <span>
                Taal:{" "}
                <span className="font-medium text-gray-700">
                  {LANGUAGE_NAMES[selected.language] || selected.language}
                </span>
              </span>
            )}
            {selected.duration > 0 && (
              <span>
                Duur:{" "}
                <span className="font-medium text-gray-700">
                  {formatDuration(selected.duration)}
                </span>
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => copyToClipboard(selected)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              {copied ? "Gekopieerd!" : "Kopiëren"}
            </button>
            <button
              onClick={() => downloadAsText(selected)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Downloaden als tekst
            </button>
          </div>

          {/* Segments */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {selected.segments.map((segment, i) => (
              <div
                key={i}
                className={`flex gap-4 px-4 py-3 ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
              >
                <span className="text-xs font-mono text-gray-400 pt-0.5 shrink-0">
                  {formatTime(segment.start)}
                </span>
                <span className="text-gray-800">{segment.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Geschiedenis
          </h2>
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedId === item.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
                onClick={() =>
                  setSelectedId(selectedId === item.id ? null : item.id)
                }
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {item.fileName}
                  </p>
                  <div className="flex gap-3 text-xs text-gray-400 mt-1">
                    <span>
                      {LANGUAGE_NAMES[item.language] || item.language}
                    </span>
                    <span>{formatDuration(item.duration)}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item.id);
                  }}
                  className="ml-4 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  title="Verwijderen"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
