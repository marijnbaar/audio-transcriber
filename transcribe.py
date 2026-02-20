#!/usr/bin/env python3
"""Transcribe audio files using faster-whisper."""

import sys
import os
from pathlib import Path
from faster_whisper import WhisperModel
from tqdm import tqdm


def format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def transcribe(audio_path: str, model_size: str = "large-v3", language: str = "nl"):
    path = Path(audio_path)
    if not path.exists():
        print(f"Bestand niet gevonden: {audio_path}")
        sys.exit(1)

    print(f"Model laden ({model_size})...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"Transcriberen: {path.name}")
    segments, info = model.transcribe(str(path), language=language, beam_size=5)

    print(f"Taal gedetecteerd: {info.language} (waarschijnlijkheid: {info.language_probability:.2f})")
    print(f"Duur: {format_timestamp(info.duration)}")
    print("-" * 60)

    duration = info.duration
    progress = tqdm(total=duration, unit="s", desc="Voortgang", bar_format="{l_bar}{bar}| {n:.0f}/{total:.0f}s [{elapsed}<{remaining}]")

    output_lines = []
    for segment in segments:
        timestamp = f"[{format_timestamp(segment.start)} -> {format_timestamp(segment.end)}]"
        line = f"{timestamp}  {segment.text.strip()}"
        output_lines.append(line)
        progress.update(segment.end - progress.n)

    progress.close()

    # Sla op als tekstbestand
    output_path = path.with_suffix(".txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Transcriptie: {path.name}\n")
        f.write(f"Taal: {info.language}\n")
        f.write(f"Duur: {format_timestamp(info.duration)}\n")
        f.write("=" * 60 + "\n\n")
        f.write("\n".join(output_lines))

    print(f"\nOpgeslagen: {output_path}")


if __name__ == "__main__":
    audio_files = [
        os.path.expanduser("~/Downloads/Helene en AnneMarie.m4a"),
        os.path.expanduser("~/Downloads/Joke Swiebel.m4a"),
    ]

    for audio_file in audio_files:
        transcribe(audio_file)
        print("\n" + "=" * 60 + "\n")
