from flask import Blueprint, request, jsonify
from services.transcript import fetch_transcript
from services.embedding import build_vectorstore
from services.qa_chain import run_qa_chain, format_timestamp
from services.augmentation import chain_with_context
from services.constant import SUMMARY_TRIGGER_KEYWORDS


ask_blueprint = Blueprint("ask", __name__)

@ask_blueprint.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    print(f"Raw JSON: {data}")
    if not data:
        return jsonify({"error": "No JSON received"}), 400

    video_id = data.get("video_id")
    question = data.get("question")
    title = data.get("videoTitle")

    print(f"Received video_id: {video_id}")
    print(f"Received question: {question}")
    print(f"Received title: {title}")

    if not video_id or not question:
        return jsonify({"error": "Missing video_id or question"}), 400

    try:
        transcript_list = fetch_transcript(video_id)
        vectorstore = build_vectorstore(transcript_list)

        # Smart Context Switcher Logic
    

        if any(kw in question.lower() for kw in SUMMARY_TRIGGER_KEYWORDS):
            # Use Intro Summary Block
            intro_context = " ".join([entry['text'] for entry in transcript_list if entry['start'] < 60])
            context = intro_context
            chunks = []  # No related segments for general summary
            print("🔍 Using Intro Summary Block")
        else:
            # Use Retrieval for Specific Queries
            context, chunks = run_qa_chain(vectorstore, question)
            print(f"🔍 Using Vectorstore Retrieval: Retrieved {len(chunks)} segments")

        # Run LLM chain with prepared context
        answer = chain_with_context(context, question)

        return jsonify({
            "answer": answer,
            "chunks": chunks  # Only populated for specific queries
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500