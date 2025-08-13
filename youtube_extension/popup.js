// popup.js

document.addEventListener("DOMContentLoaded", () => {
  loadPopupContent();

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadPopupContent());
  }
});

function loadPopupContent() {
  const msgDiv = document.getElementById("messages");
  msgDiv.innerHTML = ""; // Clear existing messages

  chrome.storage.local.get(["yt_video_id", "yt_video_title", "chat_history"], (result) => {
    const videoId = result.yt_video_id;
    const videoTitle = result.yt_video_title || "this video";
    const history = result.chat_history || {};
    const chatHistory = history[videoId] || [];

    console.log("Loaded from chrome.storage:", { videoId, videoTitle });

    if (!videoId) {
      appendBubble("Bot", "⚠️ Could not find video ID. Please open the popup from a YouTube video.", "bot");
      return;
    }

    if (chatHistory.length === 0) {
      // Persist greeting exactly once for this video
      const greeting = `Hi there! Please ask questions only about the video: <b>"${videoTitle}"</b>`;
      appendBubble("Bot", greeting, "bot");
      appendEntriesToHistory([{ sender: "Bot", message: greeting, type: "bot" }]);
    } else {
      // Need tabId to wire clickable timestamps on restore
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;

        // Re-render history (render only; do NOT persist again)
        chatHistory.forEach((entry) => {
          if (entry.type === "segments" && Array.isArray(entry.chunks)) {
            appendRelatedSegments(entry.chunks, tabId);
          } else {
            const { sender, message, type } = entry;
            appendBubble(sender, message, type);
          }
        });
      });
    }

    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) sendBtn.onclick = () => sendMessage(videoId);

    const userInput = document.getElementById("user-input");
    if (userInput) {
      userInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage(videoId);
      });
    }
  });
}

// -- helper: does user explicitly want timestamps? --
function wantsTimestamps(question) {
  const q = (question || "").toLowerCase();
  const triggers = [
    "timestamp", "time stamp", "time-stamp", "time segment",
    "timecode", "time code", "talks about", "mention",
    "where in the video", "where do they talk about",
    "when do they talk about"
  ];
  return triggers.some(t => q.includes(t));
}

// --- gather recent chat turns to seed backend memory ---
function getRecentTurns(videoId, limit = 8) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["chat_history"], (res) => {
      const turns = (res.chat_history?.[videoId] || [])
        .filter(e => e.sender && e.message) // only bubbles (skip segments objects)
        .map(e => ({
          role: e.sender.toLowerCase() === "you" ? "user" : "assistant",
          content: e.message
        }));
      resolve(turns.slice(-limit));
    });
  });
}

// --- get or prompt for access code ---
async function getAccessCode() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["access_code"], (res) => {
      if (res.access_code) return resolve(res.access_code);
      const code = prompt("Enter access code to use the assistant:");
      if (code && code.trim()) {
        chrome.storage.local.set({ access_code: code.trim() }, () => resolve(code.trim()));
      } else {
        resolve(null);
      }
    });
  });
}

async function sendMessage(videoId) {
  const input = document.getElementById("user-input");
  const question = (input?.value || "").trim();
  if (!question) return;

  // 1) Render user bubble and persist it (single entry)
  appendBubble("You", question, "user");
  appendEntriesToHistory([{ sender: "You", message: question, type: "user" }]);
  if (input) input.value = "";

  const loaderId = showTypingBubble();

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes("youtube.com/watch")) {
      removeTypingBubble(loaderId);
      const msg = "⚠️ Please open this extension on a YouTube video page.";
      appendBubble("Bot", msg, "bot");
      appendEntriesToHistory([{ sender: "Bot", message: msg, type: "bot" }]);
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_INFO" }, async (response) => {
      const videoTitle = response?.videoTitle || "this video";

      try {
        const accessCode = await getAccessCode();
        if (!accessCode) {
          removeTypingBubble(loaderId);
          appendBubble("Bot", "Access code required to use the assistant.", "bot");
          return;
        }

        const historyTurns = await getRecentTurns(videoId, 8);
        console.log("sending historyTurns:", historyTurns);

        const res = await fetch(`${CONFIG.BACKEND_URL}/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Code": accessCode
          },
          body: JSON.stringify({ video_id: videoId, question, videoTitle, history: historyTurns })
        });

        if (res.status === 403) {
          chrome.storage.local.remove("access_code", () => {});
          removeTypingBubble(loaderId);
          appendBubble("Bot", "Access denied. Please re-enter the access code and try again.", "bot");
          return;
        }

        const data = await res.json();
        removeTypingBubble(loaderId);

        const botAnswer = data?.answer || "❌ No answer returned";
        appendBubble("Bot", botAnswer, "bot");

        const wants = wantsTimestamps(question);
        if (wants && Array.isArray(data?.chunks) && data.chunks.length > 0) {
          appendRelatedSegments(data.chunks, tab.id);
        }

        const batch = [{ sender: "Bot", message: botAnswer, type: "bot" }];
        if (wants && Array.isArray(data?.chunks) && data.chunks.length > 0) {
          batch.push({ type: "segments", chunks: data.chunks });
        }
        appendEntriesToHistory(batch);

      } catch (err) {
        removeTypingBubble(loaderId);
        const msg = `⚠️ Something went wrong. ${err?.message || ""}`.trim();
        appendBubble("Bot", msg, "bot");
        appendEntriesToHistory([{ sender: "Bot", message: msg, type: "bot" }]);
      }
    });
  });
}

document.getElementById("refresh-btn").onclick = async () => {
  chrome.storage.local.get(["yt_video_id", "chat_history"], (oldResult) => {
    const oldVideoId = oldResult.yt_video_id;
    const history = oldResult.chat_history || {};

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url?.includes("youtube.com/watch")) {
        alert("⚠️ Please refresh only from a YouTube video page.");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_INFO" }, (response) => {
        if (!response || !response.videoId) {
          alert("Unable to refresh. Make sure you're on a YouTube video.");
          return;
        }

        if (oldVideoId && history[oldVideoId]) {
          delete history[oldVideoId];
        }

        chrome.storage.local.set({
          yt_video_id: response.videoId,
          yt_video_title: response.videoTitle,
          chat_history: history
        }, () => location.reload());
      });
    });
  });
};

// ---------- UI helpers ----------
function appendBubble(sender, message, type) {
  const msgDiv = document.getElementById("messages");
  const bubble = document.createElement("div");
  bubble.classList.add("bubble", type);
  bubble.innerHTML = message;
  msgDiv.appendChild(bubble);
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

function appendEntriesToHistory(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  chrome.storage.local.get(["yt_video_id", "chat_history"], (result) => {
    const videoId = result.yt_video_id;
    if (!videoId) return;
    const history = result.chat_history || {};
    if (!history[videoId]) history[videoId] = [];
    history[videoId].push(...entries);
    chrome.storage.local.set({ chat_history: history });
  });
}

function showTypingBubble() {
  const msgDiv = document.getElementById("messages");
  const loader = document.createElement("div");
  const loaderId = "typing-" + Date.now();
  loader.classList.add("bubble", "bot", "typing");
  loader.id = loaderId;
  loader.innerHTML = `<div class="dot-typing"><span></span><span></span><span></span></div>`;
  msgDiv.appendChild(loader);
  msgDiv.scrollTop = msgDiv.scrollHeight;
  return loaderId;
}

function removeTypingBubble(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendRelatedSegments(chunks, tabId) {
  const msgDiv = document.getElementById("messages");
  const old = msgDiv.querySelector(".related-segments");
  if (old) old.remove();
  const section = document.createElement("div");
  section.classList.add("related-segments");
  section.innerHTML = `<b>📺 Related Video Segments:</b>`;
  chunks.slice(0, 10).forEach((chunk) => {
    const segment = document.createElement("div");
    segment.classList.add("timestamp-link");
    const label = chunk.timestamp || "[segment]";
    segment.innerHTML = `<a href="#" data-start="${chunk.start ?? ""}">[${label}]</a> ${chunk.text}`;
    segment.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      const numeric = Number(e.currentTarget.getAttribute("data-start"));
      if (Number.isFinite(numeric)) {
        seekVideo(tabId, numeric);
      } else {
        const left = label.split("–")[0].replace(/[\[\]\s]/g, "");
        seekVideo(tabId, parseTimestamp(left));
      }
    });
    section.appendChild(segment);
  });
  msgDiv.appendChild(section);
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

function parseTimestamp(ts) {
  const parts = (ts || "").split(":").map(v => parseInt(v, 10));
  if (parts.some(n => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function seekVideo(tabId, seconds) {
  if (!Number.isFinite(seconds)) return;
  chrome.tabs.sendMessage(tabId, { type: "SEEK_VIDEO", time: seconds });
}
