"""Real, optional Ollama vector retrieval with an explicit lexical fallback."""
import math
import httpx
from app.core.config import settings
from app.services.memory_logic import fingerprint


async def encode_texts(texts: list[str]) -> list[list[float]]:
    if settings.EMBEDDINGS_PROVIDER != "ollama":
        raise ValueError("Semantic retrieval is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(settings.OLLAMA_URL.rstrip("/") + "/api/embed",
            json={"model": settings.EMBEDDINGS_MODEL, "input": texts, "truncate": False})
        response.raise_for_status()
        vectors = response.json().get("embeddings", [])
    if len(vectors) != len(texts) or not vectors or any(not vector for vector in vectors):
        raise ValueError("Incomplete embeddings")
    if any(len(vector) != len(vectors[0]) or any(not math.isfinite(value) for value in vector) for vector in vectors):
        raise ValueError("Invalid embeddings")
    return vectors


def cosine(left, right):
    if not left or len(left) != len(right):
        return 0.0
    norm = math.sqrt(sum(x*x for x in left) * sum(x*x for x in right))
    return sum(a*b for a, b in zip(left, right))/norm if norm else 0.0


async def hybrid_rank(records, query, lexical):
    if settings.EMBEDDINGS_PROVIDER == "none":
        return lexical, "lexical"
    vectors = [r for r in records if r.get("embedding") and r.get("embedding_model") == settings.EMBEDDINGS_MODEL
               and r.get("embedding_fingerprint") == fingerprint(r["fact"])]
    if not vectors:
        return lexical, "lexical · index not built"
    try:
        query_vector = (await encode_texts([query]))[0]
    except Exception:
        return lexical, "lexical · semantic provider unavailable"
    hits = {r["id"]: dict(r) for r in lexical}
    for record in vectors:
        similarity = cosine(query_vector, record["embedding"])
        if similarity >= settings.EMBEDDINGS_MIN_SIMILARITY:
            hit = hits.get(record["id"], {**record, "score": 0, "reason": "Semantic match"})
            hit["score"] += 2 * similarity
            hit["reason"] += f" · semantic similarity {similarity:.2f}"
            hits[record["id"]] = hit
    return sorted(hits.values(), key=lambda r: -r["score"]), "hybrid lexical + embeddings"
