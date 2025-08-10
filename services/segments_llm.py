# services/segments_llm.py

from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import math

def _fmt(ts: float) -> str:
    ts = max(0, int(ts))
    h, m, s = ts // 3600, (ts % 3600) // 60, ts % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

def _merge_ranges(items: List[Dict[str, Any]], min_gap=7) -> List[Dict[str, Any]]:
    if not items:
        return []
    items = sorted(items, key=lambda x: x["start"])
    merged = [items[0]]
    for cur in items[1:]:
        prev = merged[-1]
        if cur["start"] <= prev["end"] + min_gap:
            prev["end"] = max(prev["end"], cur["end"])
            # keep the longer snippet
            if len(cur.get("text","")) > len(prev.get("text","")):
                prev["text"] = cur.get("text","")
        else:
            merged.append(cur)
    return merged

def _windows(transcript_list: List[Dict[str, Any]], window_sec=90) -> List[Dict[str, Any]]:
    """
    Group consecutive caption lines into ~window_sec chunks (by start).
    """
    out, cur, cur_start = [], [], None
    for entry in transcript_list:
        start = float(entry.get("start", 0))
        if cur_start is None:
            cur_start = start
        if start - cur_start <= window_sec:
            cur.append(entry)
        else:
            out.append({"start": cur_start, "end": cur[-1].get("start", cur_start), "lines": cur})
            cur, cur_start = [entry], start
    if cur:
        out.append({"start": cur_start, "end": cur[-1].get("start", cur_start), "lines": cur})
    return out

PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are given a video transcript window as timestamped lines. "
     "Identify spans where the given TOPIC is discussed. "
     "Only use timestamps that appear in the input. "
     "Return strict JSON of the form: "
     "{{ \"segments\": [ {{\"start\": number_seconds, \"end\": number_seconds, "
     "\"reason\": string, \"quote\": string }} ] }}. "
     "Keep segments short (10–40s) and only when confident."),
    ("human",
     "TOPIC: {topic}\n\n"
     "Transcript window (lines are `start|text`):\n"
     "{window_text}\n\n"
     "JSON only:")
])

def find_segments_with_llm(
    topic: str,
    transcript_list: List[Dict[str, Any]],
    *,
    session_id: str | None = None,
    window_sec: int = 90,
    max_windows: int = 12,
    min_gap_seconds: int = 7,
    model: str = "gpt-4o-mini",
) -> List[Dict[str, Any]]:
    """
    Ask the LLM to pick timestamp spans for a topic. Returns list of:
    { "timestamp": "MM:SS – MM:SS", "start": seconds, "text": snippet }
    """
    if not transcript_list or not topic.strip():
        return []

    llm = ChatOpenAI(model=model, temperature=0.0)
    parser = JsonOutputParser()

    wins = _windows(transcript_list, window_sec=window_sec)
    # Cheap prefilter: choose windows where the topic tokens appear at least once
    topic_lc = topic.lower()
    filtered = []
    for w in wins:
        joined = " ".join(e["text"] for e in w["lines"]).lower()
        if any(tok in joined for tok in topic_lc.split()):
            filtered.append(w)
    search_windows = (filtered or wins)[:max_windows]  # cap to control tokens/cost

    candidates: List[Dict[str, Any]] = []
    for w in search_windows:
        window_text = "\n".join(f'{int(e.get("start",0))}|{e.get("text","")}' for e in w["lines"])

        msg = PROMPT.format_messages(topic=topic, window_text=window_text)
        try:
            out = (llm | parser).invoke(msg)
        except Exception:
            continue

        for seg in (out.get("segments") or []):
            # Clamp to provided window bounds; ensure ordering
            start = float(seg.get("start", w["start"]))
            end = float(seg.get("end", start))
            if end < start:
                start, end = end, start
            start = max(start, w["start"])
            end = max(start, min(end, w["end"] + 15))  # small slack

            quote = str(seg.get("quote") or "").strip()
            reason = str(seg.get("reason") or "").strip()
            snippet = quote or reason

            candidates.append({
                "start": start,
                "end": end,
                "text": snippet[:220]
            })

    merged = _merge_ranges(candidates, min_gap=min_gap_seconds)

    # Final shape for your frontend
    out = []
    for m in merged:
        out.append({
            "timestamp": f"{_fmt(m['start'])} – {_fmt(m['end'])}",
            "start": m["start"],
            "text": m.get("text", "")
        })
    return out
