// content.js

// --- Helper: wait until page exposes a title (YouTube can be slow) ---
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

// --- Inject the floating button & update storage for this video ---
async function injectButtonIfNeeded() {
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) return;

  console.log("[yt-chatbot] videoId:", videoId);

  const videoTitle = await waitForVideoTitle();
  console.log("[yt-chatbot] videoTitle:", videoTitle);

  // If it's a new video, clear only that video's chat history
  chrome.storage.local.get("yt_video_id", (data) => {
    if (data.yt_video_id !== videoId) {
      chrome.storage.local.get("chat_history", (historyData) => {
        const history = historyData.chat_history || {};
        delete history[data.yt_video_id];
        chrome.storage.local.set({ chat_history: history });
        console.log("[yt-chatbot] 🔄 New video detected. Old chat history cleared.");
      });

      chrome.storage.local.set({ yt_video_id: videoId, yt_video_title: videoTitle }, () => {
        console.log("[yt-chatbot] ✅ Updated storage", { videoId, videoTitle });
      });
    }
  });

  // Inject button if missing
  if (!document.getElementById("yt-chatbot-launcher")) {
    const button = document.createElement("button");
    button.id = "yt-chatbot-launcher";
    button.innerText = "Ask Video";
    button.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 15px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;";
    button.onclick = () => {
      chrome.storage.local.set({ yt_video_id: videoId, yt_video_title: videoTitle }, () => {
        //window.open("popup.html", "popup", "width=400,height=600");
        const url = chrome.runtime.getURL("popup.html");
        window.open(url, "popup", "width=400,height=600");

      });
    };
    document.body.appendChild(button);
  }
}

// --- Run once on load ---
injectButtonIfNeeded();

// --- React to YouTube SPA navigations ---
// YouTube fires a custom event; use it if available for faster updates.
window.addEventListener("yt-navigate-finish", injectButtonIfNeeded);

// Fallback: MutationObserver in case custom event doesn’t fire
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    injectButtonIfNeeded();
  }
}).observe(document, { subtree: true, childList: true });

// --- Message bridge from popup.js ---
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

  if (request.type === "SEEK_VIDEO") {
    smartSeek(request.time);
  }
});

// --- Robust seek: wait for the <video> if it isn't ready yet ---
function smartSeek(seconds, tries = 20) {
  const v = document.querySelector("video");
  if (v) {
    try {
      v.currentTime = Number(seconds) || 0;
      v.play().catch(() => {}); // ignore autoplay block
    } catch (_) {}
    return;
  }
  if (tries > 0) {
    setTimeout(() => smartSeek(seconds, tries - 1), 150);
  }
}
