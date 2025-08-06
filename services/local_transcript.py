import yt_dlp
import os
import webvtt
import json
from datetime import datetime


def download_subtitles(video_url, output_dir="./transcripts"):
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    # yt-dlp options to download auto-generated subtitles (en)
    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'subtitlesformat': 'vtt',
        'outtmpl': os.path.join(output_dir, '%(id)s.%(ext)s'),
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(video_url, download=True)
        video_id = info.get("id")

    vtt_file = os.path.join(output_dir, f"{video_id}.en.vtt")
    if not os.path.exists(vtt_file):
        raise Exception(f"Failed to download subtitles. File not found: {vtt_file}")

    print(f"Subtitles downloaded: {vtt_file}")
    return vtt_file, video_id


    transcript_list = []

    for caption in webvtt.read(vtt_file):
        # Get start time in seconds
        h, m, s = map(float, caption.start.replace('.', ':').split(':'))
        start_seconds = h * 3600 + m * 60 + s

        transcript_list.append({
            "text": caption.text.strip(),
            "start": start_seconds
        })

    return transcript_list

def parse_vtt_to_transcript_list(vtt_file):
    import webvtt
    transcript_list = []

    for caption in webvtt.read(vtt_file):
        # Parse start time
        try:
            dt = datetime.strptime(caption.start, "%H:%M:%S.%f")
        except ValueError:
            dt = datetime.strptime(caption.start, "%M:%S.%f")

        start_seconds = dt.hour * 3600 + dt.minute * 60 + dt.second + dt.microsecond / 1e6

        transcript_list.append({
            "text": caption.text.strip(),
            "start": start_seconds
        })

    return transcript_list

def save_transcript_json(transcript_list, video_id, output_dir="./transcripts"):
    output_file = os.path.join(output_dir, f"{video_id}_transcript.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(transcript_list, f, indent=4)

    print(f"Transcript saved to: {output_file}")
    return output_file

if __name__ == "__main__":
    video_url = input("Enter YouTube Video URL: ").strip()

    vtt_file, video_id = download_subtitles(video_url)
    transcript_list = parse_vtt_to_transcript_list(vtt_file)
    save_transcript_json(transcript_list, video_id)