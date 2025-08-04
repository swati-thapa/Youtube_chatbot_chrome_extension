const videoId = localStorage.getItem("yt_video_id");

document.getElementById("send-btn").onclick = async () => {
  const question = document.getElementById("user-input").value;
  appendMessage("You", question);
  document.getElementById("user-input").value = "";

  const response = await fetch("http://localhost:5000/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: videoId, question })
  });
  const data = await response.json();
  appendMessage("Bot", data.answer);
};

function appendMessage(sender, message) {
  const msgDiv = document.getElementById("messages");
  msgDiv.innerHTML += `<p><strong>${sender}:</strong> ${message}</p>`;
}