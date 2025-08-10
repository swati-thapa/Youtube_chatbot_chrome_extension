# services/memory_chain.py

import os
from dotenv import load_dotenv
load_dotenv()

from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser

# ----------------- Memory store -----------------
_STORE: dict[str, ChatMessageHistory] = {}

def _get_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in _STORE:
        _STORE[session_id] = ChatMessageHistory()
    return _STORE[session_id]

def get_session_history(session_id: str) -> ChatMessageHistory:
    return _get_history(session_id)

def seed_session_history(session_id: str, turns: list[dict]):
    """
    turns: [{role: "user"|"assistant", content: "..."}, ...]
    Push them into the same memory store used by all chains below.
    """
    hist = _get_history(session_id)
    for t in turns:
        role = (t.get("role") or "").lower()
        content = t.get("content") or ""
        if not content:
            continue
        if role == "user":
            hist.add_user_message(content)
        else:
            hist.add_ai_message(content)

# Ensure API key is present
if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY not found. Set it in your .env")

_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

# ----------------- MAIN QA CHAIN (uses transcript context) -----------------
qa_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a helpful assistant. Answer ONLY from the provided transcript context. "
     "If the context is insufficient, say you don't know. Never assume facts not present in the context."),
    MessagesPlaceholder("history"),  # prior turns (memory)
    ("human", "Transcript context:\n{context}\n\nUser question: {question}")
])

# Memory-wrapped QA chain (expects {context} + {question})
chain_with_memory = RunnableWithMessageHistory(
    qa_prompt | _llm,
    _get_history,
    input_messages_key="question",
    history_messages_key="history",
)

# ----------------- TOPIC EXTRACTOR (for timestamp keyword) -----------------
topic_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "Given the user's follow-up, extract a concise topic/phrase to search for in the transcript. "
     "Use conversation history to resolve pronouns like it/this/they/he/she. "
     "Return ONLY the topic (few words, no punctuation, no quotes)."),
    MessagesPlaceholder("history"),
    ("human", "Follow-up: {question}\n\nTopic:")
])

# Memory-wrapped topic extractor (expects only {question})
_topic_chain = RunnableWithMessageHistory(
    topic_prompt | _llm | StrOutputParser(),
    _get_history,
    input_messages_key="question",
    history_messages_key="history",
)

def extract_topic_with_memory(question: str, session_id: str) -> str:
    """
    Resolve pronouns using chat memory and return a short topic phrase.
    This does NOT need {context}; it uses memory + question only.
    """
    out = _topic_chain.invoke(
        {"question": question},
        config={"configurable": {"session_id": session_id}}
    )
    return (out or "").strip()
