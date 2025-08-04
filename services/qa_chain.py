from langchain.chains import RetrievalQA
from langchain_openai import ChatOpenAI

def run_qa_chain_1(vectorstore, question: str) -> str:
    qa_chain = RetrievalQA.from_chain_type(llm=ChatOpenAI(), retriever=vectorstore.as_retriever())
    return qa_chain.run(question)

def run_qa_chain_2(vectorstore,question: str):
    retriver = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 3})
    return retriver

def format_timestamp(start_seconds):
    hours = int(start_seconds // 3600)
    minutes = int((start_seconds % 3600) // 60)
    seconds = int(start_seconds % 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes}:{seconds:02d}"

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

