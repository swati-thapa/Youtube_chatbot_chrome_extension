// Helper to wait for the video title to become available
function waitForVideoTitle(timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      const title =
        document.querySelector('h1.title yt-formatted-string')?.textContent?.trim() ||
        document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() ||
        document.querySelector('meta[name="title"]')?.getAttribute("content")?.trim();

      if (title) return resolve(title);
      if (Date.now() - startTime > timeout) return resolve("this video");

      requestAnimationFrame(check);
    };

    check();
  });
}

async function injectButtonIfNeeded() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");
  if (!videoId) return;

  console.log("Extracted videoId:", videoId);

  const videoTitle = await waitForVideoTitle();
  console.log("Extracted videoTitle:", videoTitle);

  // Check if it's a new video
  chrome.storage.local.get("yt_video_id", (data) => {
    if (data.yt_video_id !== videoId) {
      // New video → clear old chat
      chrome.storage.local.get("chat_history", (historyData) => {
        const history = historyData.chat_history || {};
        delete history[data.yt_video_id]; // only delete old video's history
        chrome.storage.local.set({ chat_history: history });
        console.log("🔄 New video detected. Old chat history cleared.");
      });

      chrome.storage.local.set({ yt_video_id: videoId, yt_video_title: videoTitle }, () => {
        console.log("Updated storage with new video info:", { videoId, videoTitle });
      });
    }
  });

  // Inject button if not already present
  if (!document.getElementById('yt-chatbot-launcher')) {
    const button = document.createElement("button");
    button.id = "yt-chatbot-launcher";
    button.innerText = "Ask Video";
    button.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 15px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;";

    button.onclick = () => {
      // Ensure latest title is saved before opening
      chrome.storage.local.set({ yt_video_id: videoId, yt_video_title: videoTitle }, () => {
        window.open("popup.html", "popup", "width=400,height=600");
      });
    };

    document.body.appendChild(button);
  }
}

// Run once on page load
injectButtonIfNeeded();

// Watch for URL changes in YouTube's SPA environment
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    injectButtonIfNeeded();
  }
}).observe(document, { subtree: true, childList: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_VIDEO_INFO") {
    const videoId = new URLSearchParams(window.location.search).get("v");
    const videoTitle =
      document.querySelector('h1.title yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() ||
      document.querySelector('meta[name="title"]')?.getAttribute("content")?.trim() ||
      "this video";
    sendResponse({ videoId, videoTitle });
  }

  //Add SEEK_VIDEO handler here
  if (request.type === "SEEK_VIDEO") {
    const player = document.querySelector('video');
    if (player) {
      player.currentTime = request.time;
      player.play();
    }
  }
});
