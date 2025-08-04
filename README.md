Project Description
This project is a YouTube Chatbot Chrome Extension designed to allow users to interactively ask questions about a YouTube video and receive instant AI-generated responses. It leverages LangChain for building a retrieval-augmented generation (RAG) pipeline, Flask as the backend API server, and JavaScript for the frontend Chrome extension interface.

Key Features:
Extracts video transcripts and indexes them for efficient retrieval.

Provides a conversational interface for users to ask context-specific questions related to the video content.

Returns precise answers with timestamp references for relevant video segments.

Seamless integration within the YouTube page using a floating chatbot widget.

Tech Stack:
LangChain: For building the QA pipeline, embedding transcript chunks, and querying the vectorstore.

Flask (Python): Backend REST API that handles transcript processing, LangChain-based retrieval, and serving chatbot responses.

JavaScript (Chrome Extension): Frontend popup and content script that injects the chatbot into the YouTube page and communicates with the Flask backend.
