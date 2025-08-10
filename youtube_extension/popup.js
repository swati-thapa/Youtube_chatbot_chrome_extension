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
        // NEW: include recent turns so backend can seed memory each request
        const historyTurns = await getRecentTurns(videoId, 8);
        console.log("sending historyTurns:", historyTurns);

        const res = await fetch("http://127.0.0.1:5000/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: videoId, question, videoTitle, history: historyTurns })
        });

        const data = await res.json();
        removeTypingBubble(loaderId);

        // 2) Render bot answer
        const botAnswer = data?.answer || "❌ No answer returned";
        appendBubble("Bot", botAnswer, "bot");

        // 3) Render segments if requested
        const wants = wantsTimestamps(question);
        if (wants && Array.isArray(data?.chunks) && data.chunks.length > 0) {
          appendRelatedSegments(data.chunks, tab.id);
        }

        // 4) ✅ ATOMIC persist: save bot answer (+ segments if any) together
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
          delete history[oldVideoId]; // clear only the old video's history
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

/**
 * Render a chat bubble to the UI (render-only; no storage here).
 */
function appendBubble(sender, message, type) {
  const msgDiv = document.getElementById("messages");
  const bubble = document.createElement("div");
  bubble.classList.add("bubble", type);
  bubble.innerHTML = message;
  msgDiv.appendChild(bubble);
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

/**
 * Atomically append multiple entries to history to avoid race conditions.
 * entries: array of either:
 *  - { sender, message, type: "user"|"bot" }
 *  - { type: "segments", chunks }
 */
function appendEntriesToHistory(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;

  chrome.storage.local.get(["yt_video_id", "chat_history"], (result) => {
    const videoId = result.yt_video_id;
    if (!videoId) return;

    const history = result.chat_history || {};
    if (!history[videoId]) history[videoId] = [];

    // Push all entries in order
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
  loader.innerHTML = `
    <div class="dot-typing">
      <span></span><span></span><span></span>
    </div>`;
  msgDiv.appendChild(loader);
  msgDiv.scrollTop = msgDiv.scrollHeight;
  return loaderId;
}

function removeTypingBubble(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// render segments block and wire click-to-seek
function appendRelatedSegments(chunks, tabId) {
  const msgDiv = document.getElementById("messages");

  // avoid stacking multiple blocks
  const old = msgDiv.querySelector(".related-segments");
  if (old) old.remove();

  const section = document.createElement("div");
  section.classList.add("related-segments");
  section.innerHTML = `<b>📺 Related Video Segments:</b>`;

  chunks.slice(0, 10).forEach((chunk) => {
    const segment = document.createElement("div");
    segment.classList.add("timestamp-link");

    // chunk.timestamp is "MM:SS – MM:SS" or "HH:MM:SS – HH:MM:SS"
    const label = chunk.timestamp || "[segment]";
    segment.innerHTML = `<a href="#" data-start="${chunk.start ?? ""}">[${label}]</a> ${chunk.text}`;

    segment.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      const numeric = Number(e.currentTarget.getAttribute("data-start"));
      if (Number.isFinite(numeric)) {
        seekVideo(tabId, numeric); // already seconds
      } else {
        const left = label.split("–")[0].replace(/[\[\]\s]/g, "");
        seekVideo(tabId, parseTimestamp(left)); // parse "HH:MM:SS" or "MM:SS"
      }
    });

    section.appendChild(segment);
  });

  msgDiv.appendChild(section);
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

// --- timestamp parsing + seeking ---
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
