"""Deterministic, inspectable research heuristics; no claim of causal inference."""
import hashlib
import re
from datetime import datetime
from app.services.memory_logic import normalize, utc_naive


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def eligible(memory, project_id, now=None):
    now = now or datetime.utcnow()
    return (memory.active and memory.project_id in {None, project_id}
            and (memory.confirmed or memory.provenance in {"user", "rules", "extractor"})
            and (memory.expires_at is None or utc_naive(memory.expires_at) > now))


def reference(memory):
    return {"id": str(memory.id), "version": memory.version}


def support_survives(support_sets, versions):
    """Each inner group is jointly needed; outer groups are alternatives."""
    return any(group and all(versions.get(ref["id"]) == ref["version"] for ref in group)
               for group in support_sets)


def decision_request(query):
    if re.search(r"\b(previous|earlier|history|historical|used to|before)\b", query, re.I):
        return False
    return bool(re.search(r"\b(choose|recommend|plan|decide|decision|should|use|build|which|next step)\b", query, re.I))


def conflict_pairs(memories, edges, relevant_ids):
    """Only explicit contradictions or distinct values of the same stable slot."""
    by_id = {str(m.id): m for m in memories}
    pairs = {tuple(sorted((e.source_id, e.target_id))) for e in edges
             if e.relation == "contradicts" and e.source_id in by_id and e.target_id in by_id}
    slots = {}
    for memory in memories:
        if memory.slot and not memory.slot.startswith(("note.", "preference.", "skill.")):
            for other in slots.get(memory.slot, []):
                if normalize(memory.fact) != normalize(other.fact):
                    pairs.add(tuple(sorted((str(memory.id), str(other.id)))))
            slots.setdefault(memory.slot, []).append(memory)
    return sorted(pair for pair in pairs if set(pair) & relevant_ids)
