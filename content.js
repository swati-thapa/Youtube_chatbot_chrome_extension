const urlParams = new URLSearchParams(window.location.search);
const videoId = urlParams.get("v");

if (videoId && !document.getElementById('yt-chatbot-launcher')) {
  const button = document.createElement("button");
  button.id = "yt-chatbot-launcher";
  button.innerText = "💬 Ask Video";
  button.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 15px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;";
  button.onclick = () => window.open("popup.html", "popup", "width=400,height=600");
  document.body.appendChild(button);

  window.localStorage.setItem("yt_video_id", videoId);
}