"""Generate the demo voiceover with Gemini TTS on Vertex AI (one MP3 per narration line)."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import tempfile
import wave
from pathlib import Path

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "voiceover"
SAMPLE_RATE = 24000


def synthesize(client: genai.Client, model: str, voice: str, prompt: str) -> bytes:
    """Return raw 16-bit mono PCM for `prompt`."""
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    )
    return response.candidates[0].content.parts[0].inline_data.data


def to_mp3(pcm: bytes, target: Path) -> float:
    """Encode PCM to MP3 (leading/trailing silence trimmed); return duration in seconds."""
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(pcm)
        trim = (
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af", trim, "-b:a", "128k", str(target)],
            check=True,
        )
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(target)],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(probe.stdout.strip()), 3)


def speech_resumes(target: Path) -> list[float]:
    """Seconds where speech resumes after each in-line pause; subtitle chunks snap to these."""
    detect = subprocess.run(
        ["ffmpeg", "-i", str(target), "-af", "silencedetect=noise=-35dB:d=0.12", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return [round(float(t), 3) for t in re.findall(r"silence_end: ([\d.]+)", detect.stderr)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--script",
        default="demo",
        help="Folder under src/ holding narration.json; durations are written next to it",
    )
    parser.add_argument("--only", nargs="*", help="Regenerate only these line ids")
    parser.add_argument(
        "--pauses-only",
        action="store_true",
        help="Skip TTS; only re-measure voiceover-pauses.json from the MP3s on disk",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    narration = ROOT / "src" / args.script / "narration.json"
    durations_path = narration.with_name("voiceover-durations.json")
    pauses_path = narration.with_name("voiceover-pauses.json")
    spec = json.loads(narration.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    durations: dict[str, float] = json.loads(durations_path.read_text()) if durations_path.exists() else {}
    if not args.pauses_only:
        client = genai.Client(
            vertexai=True,
            project=os.environ.get("TF_VAR_project_id") or os.environ.get("GCP_PROJECT_ID"),
            location=os.environ.get("TTS_LOCATION", "us-central1"),
        )
        for line in spec["lines"]:
            if args.only and line["id"] not in args.only:
                continue
            pcm = synthesize(client, spec["model"], spec["voice"], f"{spec['style']} {line['text']}")
            durations[line["id"]] = to_mp3(pcm, OUT_DIR / f"{line['id']}.mp3")
            logger.info("%s %.2fs", line["id"], durations[line["id"]])
        ordered = {line["id"]: durations[line["id"]] for line in spec["lines"] if line["id"] in durations}
        durations_path.write_text(json.dumps(ordered, indent=2) + "\n")
    pauses = {
        line["id"]: speech_resumes(OUT_DIR / f"{line['id']}.mp3")
        for line in spec["lines"]
        if (OUT_DIR / f"{line['id']}.mp3").exists()
    }
    pauses_path.write_text(json.dumps(pauses) + "\n")


if __name__ == "__main__":
    main()
