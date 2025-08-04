from langchain_core.prompts import PromptTemplate
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser

prompt = PromptTemplate(
    template="""
      You are a helpful assistant.
      Answer ONLY from the provided transcript context.
      If the context is insufficient, just say you don't know.


      {context}
      Question: {question}
    """,
    input_variables = ['context', 'question']
)


def chain_with_context(context, question):
    from langchain_core.prompts import PromptTemplate
    from langchain_openai import ChatOpenAI
    from langchain_core.output_parsers import StrOutputParser

    prompt = PromptTemplate(
        template="""
        You are a helpful assistant.
        Answer the user's question based on the following transcript context.
        mention timestamps in your answer when user asks for specific parts of the video.
        If the context is insufficient, just say you don't know.

        {context}
        Question: {question}
        """,
        input_variables=['context', 'question']
    )

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    parser = StrOutputParser()

    full_chain = prompt | llm | parser

    return full_chain.invoke({"context": context, "question": question})
