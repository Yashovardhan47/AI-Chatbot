from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
import json
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.memory import Memory
from app.core.config import settings

router = APIRouter(prefix="/api/rag", tags=["rag"])


def get_client():
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not set")
    import anthropic
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class RAGQuery(BaseModel):
    query: str
    document_text: str
    document_name: str = "document"
    model: str = "claude-sonnet-4-6"


def chunk_text(text: str, chunk_size=2000) -> List[str]:
    words = text.split()
    return [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size - 100)] or [text]


@router.post("/query")
async def rag_query(body: RAGQuery, user: User = Depends(get_current_user)):
    client = get_client()
    chunks = chunk_text(body.document_text)
    q_words = set(body.query.lower().split())
    scored = sorted([(len(q_words & set(c.lower().split())), c) for c in chunks], reverse=True)
    context = "\n\n---\n\n".join(c for _, c in scored[:3])

    sys = f"Answer ONLY from the document context provided. Document: {body.document_name}"
    prompt = f"Document:\n{context}\n\nQuestion: {body.query}"
    answer = client.messages.create(model=body.model, max_tokens=2048, system=sys, messages=[{"role":"user","content":prompt}]).content[0].text
    return {"answer": answer, "chunks_used": min(3, len(chunks)), "total_chunks": len(chunks)}


@router.post("/web-search")
async def web_intelligence(body: dict, user: User = Depends(get_current_user)):
    client = get_client()
    query = body.get("query", "")
    model = body.get("model", "claude-sonnet-4-6")
    try:
        response = client.messages.create(
            model=model, max_tokens=2048,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            system="Search for current info, summarize, cite sources.",
            messages=[{"role": "user", "content": query}]
        )
        answer = " ".join(b.text for b in response.content if hasattr(b, "text"))
        return {"answer": answer, "source": "web_search"}
    except Exception:
        response = client.messages.create(model=model, max_tokens=1024, messages=[{"role":"user","content":query}])
        return {"answer": response.content[0].text, "source": "training_knowledge"}
