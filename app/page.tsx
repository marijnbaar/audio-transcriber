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

function WaveformIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="4" y1="12" x2="4" y2="12.01" />
      <line x1="7" y1="8" x2="7" y2="16" />
      <line x1="10" y1="5" x2="10" y2="19" />
      <line x1="13" y1="3" x2="13" y2="21" />
      <line x1="16" y1="7" x2="16" y2="17" />
      <line x1="19" y1="10" x2="19" y2="14" />
      <line x1="22" y1="8" x2="22" y2="16" />
    </svg>
  );
}

function LoadingWaveform() {
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="waveform-bar w-1 bg-indigo-500 rounded-full"
          style={{ height: "100%", transformOrigin: "center" }}
        />
      ))}
    </div>
  );
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
            <WaveformIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">
              Audio Transcriber
            </h1>
            <p className="text-sm text-gray-500 leading-tight">
              Upload een audiobestand om een transcriptie te maken
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Upload zone */}
        <div
          className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? "border-indigo-400 bg-indigo-50 scale-[1.01]"
              : file
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
          } ${loading ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
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

          {loading ? (
            <div className="animate-fade-in">
              <LoadingWaveform />
              <p className="text-indigo-600 font-medium mt-4">{progress}</p>
              <p className="text-gray-400 text-sm mt-1">
                Dit kan even duren...
              </p>
            </div>
          ) : file ? (
            <div className="animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium">{file.name}</p>
              <p className="text-gray-500 text-sm mt-1">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Klik om een ander bestand te kiezen
              </p>
            </div>
          ) : (
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">
                Sleep een audiobestand hierheen
              </p>
              <p className="text-gray-400 text-sm mt-1">
                of{" "}
                <span className="text-indigo-600 font-medium hover:text-indigo-700">
                  klik om te kiezen
                </span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                {["MP3", "WAV", "M4A", "OGG", "FLAC"].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-100 rounded"
                  >
                    {fmt}
                  </span>
                ))}
                <span className="text-xs text-gray-300">max 25 MB</span>
              </div>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!file || loading}
          className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 px-4 rounded-xl font-medium hover:from-indigo-700 hover:to-violet-700 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {progress}
            </span>
          ) : (
            "Transcriberen"
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Transcription display */}
        {selected && (
          <div className="mt-8 animate-slide-up">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Transcription header */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {selected.fileName}
                    </h2>
                    <div className="flex items-center gap-3 mt-1.5">
                      {selected.language && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                          </svg>
                          {LANGUAGE_NAMES[selected.language] || selected.language}
                        </span>
                      )}
                      {selected.duration > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatDuration(selected.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => copyToClipboard(selected)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                      copied
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {copied ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                    {copied ? "Gekopieerd!" : "Kopieer"}
                  </button>
                  <button
                    onClick={() => downloadAsText(selected)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download .txt
                  </button>
                </div>
              </div>

              {/* Segments */}
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {selected.segments.map((segment, i) => (
                  <div
                    key={i}
                    className="flex gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors"
                  >
                    <span className="text-xs font-mono text-indigo-400 pt-0.5 shrink-0 tabular-nums">
                      {formatTime(segment.start)}
                    </span>
                    <span className="text-gray-700 text-sm leading-relaxed">
                      {segment.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Geschiedenis
              </h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {history.length}
              </span>
            </div>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className={`group flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    selectedId === item.id
                      ? "border-indigo-200 bg-indigo-50/50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                  }`}
                  onClick={() =>
                    setSelectedId(selectedId === item.id ? null : item.id)
                  }
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedId === item.id
                        ? "bg-indigo-100"
                        : "bg-gray-100 group-hover:bg-gray-200"
                    } transition-colors`}>
                      <svg className={`w-4 h-4 ${selectedId === item.id ? "text-indigo-600" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">
                        {item.fileName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>{LANGUAGE_NAMES[item.language] || item.language}</span>
                        <span className="text-gray-200">|</span>
                        <span>{formatDuration(item.duration)}</span>
                        <span className="text-gray-200">|</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(item.id);
                    }}
                    className="ml-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 p-1 hover:bg-red-50 rounded-lg"
                    title="Verwijderen"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
