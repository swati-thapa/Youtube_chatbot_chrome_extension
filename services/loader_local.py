import json
import os

def load_local_transcript():
    """
    Loads a local transcript from a JSON file.
    Assumes the transcript is stored as: transcripts/{video_id}.json
    """
    path = f"transcripts\GMqEJjI6BQk_transcript.json"
    if not os.path.exists(path):
        raise FileNotFoundError(f"Transcript file not found: {path}")
    
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)  # Returns a list of dicts with 'text' and 'start'
