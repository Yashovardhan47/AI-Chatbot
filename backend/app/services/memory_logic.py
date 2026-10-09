"""Pure, reproducible NeuroSense extraction and budgeted lexical retrieval.

This is BM25 + character trigram overlap, NOT a semantic embedding model.
No time-to-live is applied unless the owner explicitly sets an expiry.
"""
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from app.models.memory import MemoryCategory, MemoryKind

STOP = set("a an the i me my you your is are was were am be to of for and or in on at it that this what which do does did about please tell remember knows know have has with how now".split())
EXPANSIONS = {
    "name": {"name"}, "called": {"name"},
    "live": {"location", "city", "address"}, "living": {"location", "city"},
    "where": {"location", "city", "address"}, "moved": {"location", "city"},
    "work": {"job", "role", "company"}, "career": {"goal", "job", "role"},
    "study": {"education", "university", "degree"}, "college": {"education", "university"},
    "graduate": {"education", "graduation"}, "want": {"goal"}, "aim": {"goal"},
    "like": {"preference"}, "prefer": {"preference"}, "skills": {"skill"},
}
SECRET = re.compile(r"(?:password|passwd|api[_ -]?key|secret[_ -]?key|access[_ -]?token|refresh[_ -]?token|otp|pin\s*(?:code|number)|credit.card|card.number)\s*(?:is|:|=)|\b(?:sk-ant-|sk-proj-|AKIA)[A-Za-z0-9_-]+", re.I)
INSTRUCTION = re.compile(r"ignore (?:all |previous |system )?instructions|system prompt|developer message|reveal.*(?:secret|token)|bypass.*(?:auth|security)|<\s*/?\s*(?:system|memory)", re.I)


class Candidate(BaseModel):
    fact: str = Field(min_length=2, max_length=1000)
    quote: str = Field(min_length=2, max_length=1000)
    slot: str = Field(min_length=1, max_length=100)
    category: MemoryCategory = MemoryCategory.other
    kind: MemoryKind = MemoryKind.semantic
    confidence: int = Field(default=85, ge=0, le=100)
    importance: float = Field(default=0.6, ge=0, le=1)
    explicit: bool = False


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip(" .!\t\n")


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[\w]+", text.casefold()) if t not in STOP and len(t) > 1}


def query_tokens(text: str) -> set[str]:
    terms = tokens(text)
    for word in list(terms):
        terms.update(EXPANSIONS.get(word, set()))
    return terms


def fingerprint(text: str) -> str:
    return hashlib.sha256(normalize(text).encode()).hexdigest()[:24]


def safe_fact(text: str) -> bool:
    return not SECRET.search(text) and not INSTRUCTION.search(text)


def grounded(candidate: Candidate, message: str) -> bool:
    # Store verbatim user evidence, never the assistant's paraphrase or guesses.
    return (normalize(candidate.quote) in normalize(message)
            and normalize(candidate.fact) == normalize(candidate.quote)
            and safe_fact(candidate.fact) and candidate.confidence >= 70)


def extract_rules(message: str) -> list[Candidate]:
    if not message or len(message) > 20000 or not safe_fact(message) or "```" in message:
        return []
    candidates = []
    patterns = [
        (r"my name is\s+[^.!?\n]+", "profile.name", "personal"),
        (r"i (?:now |currently )?(?:live|am living|moved) (?:in|to)\s+[^.!?\n]+", "profile.location", "personal"),
        (r"i (?:am studying|study) (?:at|in)\s+[^.!?\n]+", "profile.education", "personal"),
        (r"i (?:will )?graduate in\s+\d{4}", "profile.graduation", "personal"),
        (r"my (?:career |main |long.term )?(?:goal|aim) is\s+[^.!?\n]+", "goal.primary", "goal"),
        (r"i want to become\s+[^.!?\n]+", "goal.career", "goal"),
        (r"i (?:now |currently )?work (?:at|for|as)\s+[^.!?\n]+", "profile.work", "personal"),
        (r"i prefer\s+[^.!?\n]+", "preference", "preference"),
        (r"i (?:use|know)\s+[^.!?\n]+", "skill", "skill"),
    ]
    explicit = bool(re.search(r"\b(?:remember|save|keep in mind)\b", message, re.I))
    # Questions, quotes, hypothetical statements and negations require review.
    if "?" not in message and not re.search(r"\b(?:if|imagine|suppose|pretend|not|don't|do not)\b|[\"“”]", message, re.I):
        for pattern, slot, category in patterns:
            prefix = r"(?:^|[.!\n]\s*)(?:(?:actually|correction|(?:please )?remember(?: that)?)[,:]?\s+)?"
            for match in re.finditer(prefix + "(?P<quote>" + pattern + ")", message, re.I):
                quote = match.group("quote").strip()
                if slot in {"preference", "skill"}:
                    # Separate unrelated preferences instead of treating all
                    # likes/skills as one mutually exclusive fact.
                    slot += "." + fingerprint(quote)
                candidate = Candidate(fact=quote, quote=quote, slot=slot, category=category,
                                      confidence=95, importance=0.8, explicit=explicit)
                if grounded(candidate, message):
                    candidates.append(candidate)
    if explicit and not candidates:
        match = re.match(r"\s*(?:please\s+)?(?:remember|save|keep in mind)(?:\s+that)?\s*[:,-]?\s+(.+)", message, re.I | re.S)
        if match and len(match.group(1)) <= 1000 and "?" not in message:
            quote = match.group(1).strip()
            if safe_fact(quote):
                candidates.append(Candidate(fact=quote, quote=quote, slot="note." + fingerprint(quote),
                                            kind="episodic", confidence=100, explicit=True))
    # One message may correct itself; latest statement wins for a stable slot.
    return list({c.slot: c for c in candidates}.values())[:5]


def utc_naive(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def observation_order(value: datetime) -> int:
    from datetime import timedelta
    return (utc_naive(value) - datetime(1970, 1, 1)) // timedelta(microseconds=1)


def recall_all(query: str) -> bool:
    return bool(re.search(r"what.*(?:remember|know).*\b(?:me|myself)\b|all (?:my )?memories", query, re.I))


def _trigrams(text: str) -> set[str]:
    text = normalize(text)
    return {text[i:i + 3] for i in range(max(0, len(text) - 2))}


def rank_memories(records: list[dict], query: str, project_id: Optional[str] = None,
                  now: Optional[datetime] = None, as_of: Optional[datetime] = None) -> list[dict]:
    now = utc_naive(now or datetime.utcnow())
    if as_of:
        snapshot = []
        target = utc_naive(as_of)
        for record in records:
            observed = utc_naive(record.get("valid_from") or record["created_at"])
            if observed <= target:
                snapshot.append(record)
                continue
            past = [revision for revision in record.get("revisions", [])
                    if utc_naive(revision["valid_from"]) <= target < utc_naive(revision["valid_until"])]
            if past:
                snapshot.append({**record, **past[-1], "updated_at": past[-1]["valid_from"]})
        records = snapshot
    eligible = [r for r in records if r.get("active", True)
                and r.get("project_id") in {None, project_id}
                and (r.get("expires_at") is None or utc_naive(r["expires_at"]) > now)
                and (r.get("confirmed") or r.get("provenance") in {"user", "rules", "extractor"})]
    query_terms = query_tokens(query)
    docs = [tokens(r["fact"] + " " + (r.get("slot") or "") + " " + " ".join(r.get("tags", []))) for r in eligible]
    frequency = Counter(t for doc in docs for t in doc)
    avg_len = sum(map(len, docs)) / max(1, len(docs))
    ranked = []
    for record, terms in zip(eligible, docs):
        overlap = query_terms & terms
        trigrams = _trigrams(query) & _trigrams(record["fact"])
        fuzzy = len(trigrams) / max(1, len(_trigrams(query)))
        if not overlap and not recall_all(query) and not record.get("pinned"):
            continue
        lexical = sum(math.log(1 + (len(docs) - frequency[t] + .5) / (frequency[t] + .5))
                      * 2.2 / (1 + 1.2 * (.25 + .75 * len(terms) / max(1, avg_len))) for t in overlap)
        updated = utc_naive(record.get("updated_at") or record["created_at"])
        age_days = max(0, (now - updated).total_seconds() / 86400)
        # Recency is a small tie-breaker; important old facts remain retrievable.
        recency = 1 / (1 + age_days / 365)
        score = lexical + .3 * fuzzy + .15 * recency + .2 * record.get("importance", .6)
        score += .2 * record.get("confidence", 85) / 100 + (1 if record.get("pinned") else 0)
        reason = "Matched: " + ", ".join(sorted(overlap)) if overlap else ("Pinned by you" if record.get("pinned") else "Memory overview")
        ranked.append({**record, "score": round(score, 4), "reason": reason})
    return sorted(ranked, key=lambda item: (-item["score"], str(item.get("id", ""))))


def pack_context(ranked: list[dict], budget: int = 6000, limit: int = 8,
                 as_of: Optional[datetime] = None, include_history: bool = False) -> tuple[str, list[dict]]:
    context, receipts = [], []
    used = 2  # JSON brackets; exact character budget, no invented token count.
    for record in ranked:
        if len(receipts) >= limit:
            break
        fact, version, quote = record["fact"], record.get("version", 1), record.get("source_quote", "")
        observed = record.get("valid_from") or record["created_at"]
        source_chat_id = record.get("source_chat_id")
        if as_of and utc_naive(observed) > utc_naive(as_of):
            past = [r for r in record.get("revisions", []) if utc_naive(r["valid_from"]) <= utc_naive(as_of) < utc_naive(r["valid_until"])]
            if not past:
                continue
            fact, version, quote, observed = past[-1]["fact"], past[-1]["version"], past[-1]["source_quote"], past[-1]["valid_from"]
            source_chat_id = past[-1].get("source_chat_id")
        item = {"id": str(record["id"]), "fact": fact, "version": version,
                "observed_at": observed.isoformat(), "scope": record.get("project_id") or "personal"}
        if include_history and not as_of:
            item["previous_versions"] = [{"fact": r["fact"], "version": r["version"],
                                           "valid_from": r["valid_from"].isoformat(), "valid_until": r["valid_until"].isoformat()}
                                          for r in record.get("revisions", [])]
        encoded = json.dumps(item, ensure_ascii=False)
        cost = len(encoded) + (1 if context else 0)
        if used + cost > budget:
            # Skip rather than truncating evidence into a misleading half-fact.
            continue
        context.append(encoded)
        used += cost
        receipts.append({"id": str(record["id"]), "version": version, "fact": fact,
                         "score": record["score"], "reason": record["reason"],
                         "source_chat_id": source_chat_id, "source_quote": quote})
    return "[" + ",".join(context) + "]", receipts
