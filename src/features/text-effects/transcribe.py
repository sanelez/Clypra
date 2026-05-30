# /// script
# dependencies = [
#     "openai-whisper",
# ]
# ///
import json
import sys
import warnings

import whisper

# Suppress warnings
warnings.filterwarnings("ignore")


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided"}), file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        # Load the highly optimized 'tiny' model (only 75MB!)
        model = whisper.load_model("tiny")

        # Transcribe audio file with a neutral, professional prompt for general-purpose use
        # The prompt helps Whisper understand context without biasing toward specific content
        result = model.transcribe(
            audio_path,
            initial_prompt="The following is a transcription of spoken audio content.",
            language=None,  # Auto-detect language
            task="transcribe",  # Use 'transcribe' for same-language, 'translate' for English translation
        )

        # Format the output into exact segments with start, end, and text
        segments = []
        for seg in result.get("segments", []):
            segments.append(
                {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
            )

        print(
            json.dumps({"text": result.get("text", "").strip(), "segments": segments})
        )

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
