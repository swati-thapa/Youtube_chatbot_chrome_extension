# routes/ask.py
from flask import Blueprint, request, jsonify
import re, string

# --- your existing services ---
from services.transcript import fetch_transcript                 # uses YouTubeTranscriptApi
from services.embedding import build_vectorstore
from services.qa_chain import run_qa_chain
from services.constant import SUMMARY_TRIGGER_KEYWORDS, timestamp_trigger_phrases
from services.memory_chain import seed_session_history , extract_topic_with_memory
from services.segments_llm import find_segments_with_llm  # NEW: LLM-based segment finder

# --- NEW: memory-enabled chain (RunnableWithMessageHistory) ---
from services.memory_chain import chain_with_memory

ask_blueprint = Blueprint("ask", __name__)


@ask_blueprint.route("/ask", methods=["POST"])
def ask():
    data = request.get_json() or {}
    print(f"Raw JSON: {data}")

    video_id = (data.get("video_id") or "").strip()
    question = (data.get("question") or "").strip()
    title = data.get("videoTitle")
    history_turns = data.get("history") or []

    print(f"Received video_id: {video_id}")
    print(f"Received question: {question}")
    print(f"Received title: {title}")


    if history_turns:
        try:
            from services.memory_chain import get_session_history
            hist = get_session_history(video_id)
            print(f"history before clear: {len(hist.messages)}")
            hist.clear()                                 # avoid duplicates
            seed_session_history(video_id, history_turns[-8:])
            print(f"history after seed:  {len(hist.messages)}")
        except Exception as _:
            pass
    if not video_id or not question:
        return jsonify({"error": "Missing video_id or question"}), 400

    try:
        # 1) Get transcript via YouTube API (list of dicts: {'text','start',...})
        transcript_list = fetch_transcript(video_id)
        print("Transcript fetched successfully.")

        # 2) Timestamp-mode: if the user explicitly asked for timestamps, short-circuit here
        ql = question.lower()
        

        ql = question.lower()
        ql_norm = re.sub(r"\s+", " ", ql)                # normalize 'time stampof' -> 'time stampof' (keeps detection robust)

        if any(trigger in ql_norm for trigger in timestamp_trigger_phrases):
            # Resolve pronouns/topic via memory
            topic = extract_topic_with_memory(question, session_id=video_id) or ql.split()[-1]
            topic = topic.strip(string.punctuation + "\"' ")
            print(f"⏱  Timestamp mode. Topic extracted: '{topic}'")

            # Ask LLM to find segments
            matches = find_segments_with_llm(topic, transcript_list, session_id=video_id)

            # Fallback to your old keyword finder if nothing returned
            if not matches:
                from services.qa_chain import find_keyword_segments
                matches = find_keyword_segments(transcript_list, topic)

            answer = (f"Here are the timestamps where '{topic}' is mentioned in the video:"
                    if matches else f"The transcript does not contain the topic '{topic}'.")
            return jsonify({"answer": answer, "chunks": matches})

        # 3) Build vectorstore over the transcript for retrieval
        vectorstore = build_vectorstore(transcript_list)

        # 4) Choose context: summary intro vs retrieval chunks
        if any(kw in ql for kw in SUMMARY_TRIGGER_KEYWORDS):
            # brief intro for general "what is this video about" style questions
            intro_context = " ".join([e["text"] for e in transcript_list if e.get("start", 0) < 60])
            context, chunks = intro_context, []
            print("🔍 Summary mode: using intro context.")
        else:
            context, chunks = run_qa_chain(vectorstore, question)
            print(f"🔍 Retrieval mode: retrieved {len(chunks)} segments.")

        # 5) MAIN CHANGE: invoke the memory-enabled chain
        # Use video_id as the session_id so the model “remembers” prior turns per video
        # Some LangChain versions return AIMessage with .content; others return str.
        result = chain_with_memory.invoke(
            {"context": context, "question": question},
            config={"configurable": {"session_id": video_id}}
        )
        answer = getattr(result, "content", result)



        return jsonify({
            "answer": answer,
            "chunks": chunks   # only populated for retrieval queries; empty for summary
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
