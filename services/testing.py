import requests

payload = {
    "video_id": "GMqEJjI6BQk",
    "question": "what is personality as per this video?",
    "videoTitle": "Test Video"
}

response = requests.post("http://127.0.0.1:5000/ask", json=payload)
print(response.json())
