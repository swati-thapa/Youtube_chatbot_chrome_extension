document.addEventListener("DOMContentLoaded", () => {
  loadPopupContent();

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadPopupContent(); //Manual refresh
    });
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
      appendBubble("Bot", "Could not find video ID. Please open the popup from a YouTube video.", "bot");
      return;
    }

    if (chatHistory.length === 0) {
      appendBubble("Bot", `Hi there! Please ask questions only about the video: <b>"${videoTitle}"</b>`, "bot");
    } else {
      chatHistory.forEach(({ sender, message, type }) => {
        appendBubble(sender, message, type);
      });
    }

    document.getElementById("send-btn").onclick = () => sendMessage(videoId);
    document.getElementById("user-input").addEventListener("keypress", function (e) {
      if (e.key === "Enter") sendMessage(videoId);
    });
  });
}

async function sendMessage(videoId) {
  const input = document.getElementById("user-input");
  const question = input.value.trim();
  if (!question) return;

  appendBubble("You", question, "user");
  input.value = "";

  const loaderId = showTypingBubble();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url.includes("youtube.com/watch")) {
      removeTypingBubble(loaderId);
      appendBubble("Bot", "Please open this extension on a YouTube video page.", "bot");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_INFO" }, async (response) => {
      const videoTitle = response?.videoTitle || "this video";

      try {
        const res = await fetch("http://127.0.0.1:5000/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: videoId, question, videoTitle })
        });

        const data = await res.json();
        removeTypingBubble(loaderId);

        appendBubble("Bot", data.answer || "No answer returned", "bot");

        //Only show segments if the user's question asks for timestamps
        if (question.toLowerCase().includes("timestamp") ||
            question.toLowerCase().includes("time segment") ||
            question.toLowerCase().includes("when") ||
            question.toLowerCase().includes("which part") ||
            question.toLowerCase().includes("where in video")) {
          if (data.chunks && data.chunks.length > 0) {
            appendRelatedSegments(data.chunks, tab.id);
          }
        }

      } catch (err) {
        removeTypingBubble(loaderId);
        appendBubble("Bot", "Something went wrong. Please try again.", "bot");
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
      if (!tab || !tab.url.includes("youtube.com/watch")) {
        alert("Please refresh only from a YouTube video page.");
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
        }, () => {
          location.reload();
        });
      });
    });
  });
};

function appendBubble(sender, message, type) {
  const msgDiv = document.getElementById("messages");
  const bubble = document.createElement("div");
  bubble.classList.add("bubble", type);
  bubble.innerHTML = message;
  msgDiv.appendChild(bubble);
  msgDiv.scrollTop = msgDiv.scrollHeight;

  chrome.storage.local.get(["yt_video_id", "chat_history"], (result) => {
    const videoId = result.yt_video_id;
    const history = result.chat_history || {};

    if (!videoId) return;

    if (!history[videoId]) history[videoId] = [];
    history[videoId].push({ sender, message, type });

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

// Add Related Segments Below Answer (Clickable Timestamps)
function appendRelatedSegments(chunks, tabId) {
  const msgDiv = document.getElementById("messages");

  const section = document.createElement("div");
  section.classList.add("related-segments");
  section.innerHTML = `<b>📺 Related Video Segments:</b>`;

  chunks.forEach(chunk => {
    const segment = document.createElement("div");
    segment.classList.add("timestamp-link");

    segment.innerHTML = `<a href="#" data-timestamp="${chunk.timestamp}">[${chunk.timestamp}]</a> ${chunk.text}`;
    
    // Click Handler → Seek Video to Timestamp
    segment.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      seekVideo(tabId, chunk.timestamp);
    });

    section.appendChild(segment);
  });

  msgDiv.appendChild(section);
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

//Seek Video to Timestamp (Send to content.js)
function seekVideo(tabId, timestamp) {
  const parts = timestamp.split(":").map(Number);

  let seconds = 0;
  if (parts.length === 3) {
    // HH:MM:SS format
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS format
    seconds = parts[0] * 60 + parts[1];
  }

  chrome.tabs.sendMessage(tabId, { type: "SEEK_VIDEO", time: seconds });
}