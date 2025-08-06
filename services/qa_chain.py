from langchain.chains import RetrievalQA
from langchain_openai import ChatOpenAI

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

# Keyword-based Timestamp Search (Simple Scan through Transcript)
def find_keyword_segments(transcript_list, keyword):
    """
    Scans through the transcript and returns all segments where the keyword is mentioned.
    """
    keyword_lower = keyword.lower()
    results = []

    for entry in transcript_list:
        if keyword_lower in entry['text'].lower():
            start = entry.get('start', 0)
            timestamp = format_timestamp(start)
            results.append({
                "text": entry['text'],
                "timestamp": timestamp
            })

    return results
