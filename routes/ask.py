from flask import Blueprint, request, jsonify
from services.transcript import fetch_transcript
from services.embedding import build_vectorstore
from services.qa_chain import run_qa_chain  # Updated to return context + chunks
from services.augmentation import chain_with_context  # Renamed function to avoid confusion

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
        # Step 1: Fetch Transcript
        transcript_list = fetch_transcript(video_id)

        # Step 2: Build Vectorstore
        vectorstore = build_vectorstore(transcript_list)

        # Step 3: Retrieve top chunks and format context
        context, chunks = run_qa_chain(vectorstore, question)

        # Step 4: Run LLM with context
        answer = chain_with_context(context, question)

        # Step 5: Return Answer + Clickable Timestamps Data
        return jsonify({
            "answer": answer,
            "chunks": chunks  # Each chunk has 'text' and 'timestamp'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
