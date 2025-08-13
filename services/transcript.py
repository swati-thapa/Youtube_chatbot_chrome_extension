from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled

def fetch_transcript(video_id: str):
    try:
        ytt_api = YouTubeTranscriptApi()
        ft = ytt_api.fetch(video_id, languages=["en"])
        transcript_list = ft.to_raw_data()   
        #transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        print("Transcript fetched successfully.")
        return transcript_list  #Return the list of dicts (no joining into string)
    except TranscriptsDisabled:
        raise Exception("This video has no captions available.")
    except Exception as e:
        raise Exception(f"Failed to fetch transcript: {str(e)}")
