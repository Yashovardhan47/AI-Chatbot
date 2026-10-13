from collections import Counter
from app.models.workspace import MemoryEdge, MemoryFeedback


async def augment_graph(user_id, ranked, eligible):
    allowed = {r["id"]: r for r in eligible}
    hits = {r["id"]: dict(r) for r in ranked}
    frontier = {r["id"] for r in ranked[:3]}
    visited = set(frontier)
    for depth in range(2):
        if not frontier:
            break
        edges = await MemoryEdge.find({"user_id": user_id, "$or": [
            {"source_id": {"$in": list(frontier)}}, {"target_id": {"$in": list(frontier)}}]}).limit(100).to_list()
        following = set()
        for edge in edges:
            for origin, target in ((edge.source_id, edge.target_id), (edge.target_id, edge.source_id)):
                if origin in frontier and target not in visited and target in allowed and len(following) < 12:
                    hits[target] = {**allowed[target], "score": hits[origin]["score"]*.65,
                                    "reason": f"Linked to {origin} via {edge.relation} · hop {depth+1}"}
                    visited.add(target); following.add(target)
        frontier = following
    return sorted(hits.values(), key=lambda r: -r["score"])


async def apply_feedback(user_id, ranked):
    votes = Counter()
    for entry in await MemoryFeedback.find({"user_id": user_id}).to_list():
        for reference in entry.references:
            if reference.get("kind", "memory") == "memory":
                votes[(reference["id"], reference.get("version", 1))] += entry.rating
    for hit in ranked:
        vote = votes[(hit["id"], hit.get("version", 1))]
        if vote:
            hit["score"] += max(-.5, min(.5, vote*.1))
            hit["reason"] += " · adjusted by your recall feedback"
    return sorted(ranked, key=lambda r: -r["score"])
