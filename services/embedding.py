from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain.docstore.document import Document

def build_vectorstore(transcript_list):
    # transcript_list should be a list of dicts: [{'text': '...', 'start': ...}, ...]

    # Create Document objects with metadata (timestamp)
    docs = []
    for entry in transcript_list:
        docs.append(Document(
            page_content=entry['text'],
            metadata={"start": entry.get('start', 0)}
        ))

    # Optionally, you can chunk further, but ensure to preserve metadata.
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    split_docs = splitter.split_documents(docs)

    return FAISS.from_documents(split_docs, OpenAIEmbeddings())
