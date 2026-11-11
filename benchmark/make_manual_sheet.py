#!/usr/bin/env python3
"""
make_manual_sheet.py - Generate Manual Voice-Typing Comparison Sheet

Generates tools/benchmark/results/manual_phone_voice_typing.csv for comparing
mobile phone voice typing (Gboard / iOS Dictation) against Gnani and Whisper.

Columns:
  id, category, text, transcript_from_phone_voice_typing

Preserves any existing entries if re-run.
"""

import sys
import csv
import json
import argparse
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def make_sheet(sentences_file: Path, output_file: Path):
    if not sentences_file.exists():
        print(f"Error: Sentences file not found: {sentences_file}")
        sys.exit(1)

    with open(sentences_file, "r", encoding="utf-8") as f:
        sentences = json.load(f)

    # Load existing manual transcripts if present
    existing_transcripts = {}
    if output_file.exists():
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    s_id = row.get("id")
                    val = row.get("transcript_from_phone_voice_typing", "").strip()
                    if s_id and val:
                        existing_transcripts[s_id] = val
        except Exception:
            pass

    output_file.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["id", "category", "text", "transcript_from_phone_voice_typing"]
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for item in sentences:
            s_id = item["id"]
            writer.writerow({
                "id": s_id,
                "category": item.get("category", ""),
                "text": item.get("text", ""),
                "transcript_from_phone_voice_typing": existing_transcripts.get(s_id, ""),
            })

    filled_count = len(existing_transcripts)
    print("==================================================")
    print("        Manual Voice Typing Sheet Generator       ")
    print("==================================================")
    print(f"Destination:  {output_file}")
    print(f"Total Rows:   {len(sentences)}")
    print(f"Filled Rows:  {filled_count}/{len(sentences)}")
    print("--------------------------------------------------")
    print("Instructions:")
    print("  1. Play your recorded sentences on your computer.")
    print("  2. Use your phone's voice-typing (e.g. Gboard / iOS) to transcribe.")
    print("  3. Paste what the phone typed into the 'transcript_from_phone_voice_typing' column.")
    print("  4. Re-running report.py will automatically incorporate your phone benchmark!")
    print("==================================================")


def main():
    base_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Generate manual phone voice typing sheet.")
    parser.add_argument("--sentences", default=str(base_dir / "sentences.json"),
                        help="Sentences JSON path")
    parser.add_argument("--output", default=str(base_dir / "results" / "manual_phone_voice_typing.csv"),
                        help="Output CSV path")

    args = parser.parse_args()
    make_sheet(Path(args.sentences), Path(args.output))


if __name__ == "__main__":
    main()
