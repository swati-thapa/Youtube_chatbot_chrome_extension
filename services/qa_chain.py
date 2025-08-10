import re

# Timestamp Formatter (shared by both retrieval & keyword search)
def format_timestamp(start_seconds):
    hours = int(start_seconds // 3600)
    minutes = int((start_seconds % 3600) // 60)
    seconds = int(start_seconds % 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes}:{seconds:02d}"

# Vectorstore Retrieval (Semantic Matching with timestamps)
def run_qa_chain(vectorstore, question):
    retriever = vectorstore.as_retriever(search_kwargs={"k": 10})
    docs = retriever.get_relevant_documents(question)

    chunks_with_timestamps = []
    context_lines = []

    for doc in docs:
        start = doc.metadata.get("start", 0)
        text = doc.page_content

        # Convert start (seconds) to HH:MM:SS or MM:SS
        timestamp = format_timestamp(start)

        chunks_with_timestamps.append({
            "text": text,
            "timestamp": timestamp
        })

        context_lines.append(f"{text}")

    context = "\n\n".join(context_lines)

    return context, chunks_with_timestamps


def find_keyword_segments(transcript_list, keyword, min_gap_seconds=5, use_word_boundary=True, make_range=True):
    """
    Find keyword hits, group close ones into a single segment, and return a
    clickable range like [0:15 – 0:29].

    Returns a list of dicts:
    {
      "text": "merged snippet text",
      "start": 15.0,         # seconds (float)
      "end": 29.0,           # seconds (float)
      "timestamp": "0:15 – 0:29"  # display string for UI
    }
    """
    if not keyword:
        return []

    pattern = re.compile(
        rf"\b{re.escape(keyword)}\b" if use_word_boundary else re.escape(keyword),
        flags=re.IGNORECASE
    )

    # Collect all raw hits
    hits = []
    for entry in transcript_list:
        txt = entry.get("text", "")
        if not txt:
            continue
        if pattern.search(txt):
            start = float(entry.get("start", 0) or 0)
            hits.append({"text": txt.strip(), "start": start})

    if not hits:
        return []

    hits.sort(key=lambda x: x["start"])

    # Group hits into windows
    groups = []
    cur_start = hits[0]["start"]
    cur_end = hits[0]["start"]
    cur_texts = [hits[0]["text"]]

    for h in hits[1:]:
        if h["start"] - cur_end <= float(min_gap_seconds):
            # same group -> extend end and collect text
            cur_end = h["start"]
            cur_texts.append(h["text"])
        else:
            # flush current group
            groups.append((cur_start, cur_end, " ".join(cur_texts)))
            # start new group
            cur_start = h["start"]
            cur_end = h["start"]
            cur_texts = [h["text"]]

    # flush last group
    groups.append((cur_start, cur_end, " ".join(cur_texts)))

    # build results
    results = []
    for g_start, g_end, g_text in groups:
        # if only one hit in group, g_end can equal g_start; still show range nicely
        display = f"{format_timestamp(g_start)} – {format_timestamp(g_end)}" if make_range else format_timestamp(g_start)
        results.append({
            "text": g_text,
            "start": g_start,
            "end": g_end,
            "timestamp": display
        })

    return results
