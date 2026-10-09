"""Small synthetic evidence-retrieval comparison; not a published benchmark.

Run from backend: python -m evaluation.evaluate_memory --output results.json
"""
import argparse
import json
import statistics
import time
from datetime import datetime, timedelta
from pathlib import Path
from app.services.memory_logic import query_tokens, tokens, rank_memories, pack_context


def synthetic_scenario():
    origin = datetime(2022, 1, 1)
    now = datetime(2026, 10, 1)
    def memory(identifier, fact, **kwargs):
        return {"id": identifier, "fact": fact, "slot": identifier, "version": 1,
                "active": True, "provenance": "user", "confirmed": True, "project_id": None,
                "created_at": origin, "updated_at": origin, "valid_from": origin, **kwargs}
    memories = [
        memory("goal.primary", "My goal is to become a data scientist"),
        memory("profile.name", "My name is Yashovardhan"),
        memory("profile.location", "I now live in Bengaluru", version=2, valid_from=now,
               updated_at=now, revisions=[{"fact": "I live in Anantapur", "version": 1,
                   "valid_from": origin, "valid_until": now, "source_quote": "I live in Anantapur"}]),
        memory("project.alpha", "Project Alpha uses FastAPI and MongoDB", project_id="alpha"),
        memory("project.beta", "Project Beta uses Flask and PostgreSQL", project_id="beta"),
        memory("expired", "My temporary exam deadline is September", expires_at=now - timedelta(days=1)),
    ]
    for n in range(160):
        memories.append(memory(f"recipe.{n}", f"I tried cooking recipe number {n}", created_at=now, updated_at=now))
    cases = [
        {"name": "old_goal", "query": "What is my career goal?", "expected": ["My goal is to become a data scientist"]},
        {"name": "old_name", "query": "What is my name?", "expected": ["My name is Yashovardhan"]},
        {"name": "current_location", "query": "Where do I live?", "expected": ["I now live in Bengaluru"], "forbidden": ["I live in Anantapur"]},
        {"name": "historical_location", "query": "Where did I live?", "as_of": now - timedelta(days=2), "expected": ["I live in Anantapur"]},
        {"name": "project_context", "query": "Which backend does my project use?", "project_id": "alpha", "expected": ["Project Alpha uses FastAPI and MongoDB"], "forbidden": ["Project Beta uses Flask and PostgreSQL"]},
        {"name": "personal_project_boundary", "query": "Which backend does my project use?", "expected": [], "forbidden": ["Project Alpha uses FastAPI and MongoDB", "Project Beta uses Flask and PostgreSQL"]},
        {"name": "expired_deadline", "query": "What is my exam deadline?", "expected": [], "forbidden": ["My temporary exam deadline is September"]},
        {"name": "unknown_fact", "query": "What is my favorite planet?", "expected": []},
    ]
    return memories, cases, now


def baseline(records, case, method):
    scoped = [record for record in records if record.get("project_id") in {None, case.get("project_id")}]
    if method == "recent_50":
        chosen = sorted(scoped, key=lambda item: item["updated_at"], reverse=True)[:50]
        return [item["fact"] for item in chosen[:3]]
    # Fair owner/scope filtering is shared. Flat lexical baseline has no expiry
    # or current-vs-historical semantics; it sees past facts as standalone entries.
    flattened = scoped + [{**item, "fact": revision["fact"]} for item in scoped for revision in item.get("revisions", [])]
    terms = query_tokens(case["query"])
    scored = [(len(terms & tokens(item["fact"] + " " + item["slot"])), item["fact"]) for item in flattened]
    return [fact for score, fact in sorted(scored, reverse=True)[:3] if score]


def evaluate():
    records, cases, now = synthetic_scenario()
    report = {"dataset": "NeuroSense synthetic regression v1", "memory_records": len(records),
              "cases": len(cases), "top_k": 3, "context_budget_chars": 1200,
              "warning": "Evidence retrieval only. No LLM answer quality, public-benchmark score or research superiority claim.",
              "methods": {}}
    for method in ["recent_50", "flat_lexical", "neurosense"]:
        outcomes, timings = [], []
        for case in cases:
            start = time.perf_counter()
            if method == "neurosense":
                ranked = rank_memories(records, case["query"], case.get("project_id"), case.get("as_of", now), as_of=case.get("as_of"))
                context, used = pack_context(ranked, budget=1200, limit=3, as_of=case.get("as_of"))
                returned = [item["fact"] for item in used]
                context_chars = len(context)
            else:
                returned = baseline(records, case, method)
                context_chars = len(json.dumps(returned))
            timings.append((time.perf_counter() - start) * 1000)
            expected = set(case["expected"])
            correct = len(expected & set(returned))
            outcomes.append({"case": case["name"], "returned": returned,
                "evidence_recall_at_3": correct / len(expected) if expected else None,
                "abstention_correct": not returned if not expected else None,
                "forbidden_fact_returned": bool(set(case.get("forbidden", [])) & set(returned)),
                "context_chars": context_chars})
        fact_cases = [outcome["evidence_recall_at_3"] for outcome in outcomes if outcome["evidence_recall_at_3"] is not None]
        unknown_cases = [outcome["abstention_correct"] for outcome in outcomes if outcome["abstention_correct"] is not None]
        report["methods"][method] = {"mean_evidence_recall_at_3": statistics.mean(fact_cases),
            "abstention_accuracy": statistics.mean(unknown_cases),
            "forbidden_fact_cases": sum(outcome["forbidden_fact_returned"] for outcome in outcomes),
            "mean_context_chars": statistics.mean(outcome["context_chars"] for outcome in outcomes),
            "mean_retrieval_ms": round(statistics.mean(timings), 3), "outcomes": outcomes}
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate()
    if args.output:
        args.output.write_text(json.dumps(report, indent=2))
    print(json.dumps({"dataset": report["dataset"], "methods": {
        method: {key: value for key, value in result.items() if key != "outcomes"}
        for method, result in report["methods"].items()}}, indent=2))
