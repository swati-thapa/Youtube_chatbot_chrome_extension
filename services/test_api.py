from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import RequestBlocked

def fetch_transcript(video_id):
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        return [{"text": entry["text"], "start": entry["start"]} for entry in transcript]

    except RequestBlocked:
        print("❌ YouTube is blocking your IP. Try a proxy or switch to yt-dlp.")
    except Exception as e:
        print(f"❌ Failed to fetch transcript: {str(e)}")

video_id = "Gfr50f6ZBvo"
result = fetch_transcript(video_id)

if result:
    for line in result[:5]:
        print(line)
