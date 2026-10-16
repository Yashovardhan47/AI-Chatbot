"""Synthetic support-repair logic check, NOT a public research benchmark.

Run from backend: python -m evaluation.evaluate_context --output results.json
No model calls, real account data, MongoDB or credentials are used.
"""
import argparse
import json
from pathlib import Path
from app.services.context_logic import support_survives


def scenarios():
    def ref(identifier, version=1): return {"id": identifier, "version": version}
    a, b, c = ref("a"), ref("b"), ref("c")
    return [
        ("sole_source_revised", [[a]], {"a": 2}, True),
        ("sole_source_revoked", [[a]], {}, True),
        ("unchanged_source", [[a]], {"a": 1}, False),
        ("alternative_survives_revision", [[a], [b]], {"a": 2, "b": 1}, False),
        ("alternative_survives_revocation", [[a], [b]], {"b": 1}, False),
        ("joint_support_loses_one_member", [[a, b]], {"a": 2, "b": 1}, True),
        ("joint_support_loses_all_members", [[a, b]], {}, True),
        ("complete_alternative_group_survives", [[a], [b, c]], {"a": 2, "b": 1, "c": 1}, False),
        ("incomplete_alternative_is_not_enough", [[a], [b, c]], {"a": 2, "b": 1}, True),
        ("every_alternative_changed", [[a], [b]], {"a": 2, "b": 2}, True),
        ("scope_filter_removes_alternative", [[a], [b]], {"a": 2}, True),
        ("shared_group_member_revoked", [[a, b], [a, c]], {"b": 1, "c": 1}, True),
        ("new_version_is_not_old_support", [[ref("a", 2)]], {"a": 3}, True),
        ("exact_new_version_survives", [[ref("a", 2)]], {"a": 2}, False),
        ("untracked_dependencies", [], {"a": 2}, None),
    ]


def evaluate():
    methods = {"invalidate_if_any_reference_changes": lambda groups, versions: any(
                   versions.get(ref["id"]) != ref["version"] for group in groups for ref in group),
               "keep_if_any_reference_survives": lambda groups, versions: not any(
                   versions.get(ref["id"]) == ref["version"] for group in groups for ref in group),
               "complete_alternative_support": lambda groups, versions: not support_survives(groups, versions)}
    report = {"dataset": "NeuroSense authored support-logic scenarios v1", "cases": len(scenarios()),
              "warning": "Closed synthetic support logic only. Baselines are authored heuristics, not external system reproductions. Does not measure model correctness, database races, privacy, public benchmark performance or novelty.",
              "methods": {}}
    for name, classify in methods.items():
        outcomes, tp, fp, fn, correct = [], 0, 0, 0, 0
        for label, groups, versions, expected in scenarios():
            predicted = classify(groups, versions) if groups else None
            outcomes.append({"case": label, "expected_review": expected, "predicted_review": predicted})
            if expected is None: continue
            tp += bool(predicted and expected); fp += bool(predicted and not expected)
            fn += bool(not predicted and expected); correct += predicted == expected
        report["methods"][name] = {"known_cases": len(outcomes)-1, "unknown_cases": 1,
            "correct": correct, "impact_precision": tp/(tp+fp) if tp+fp else None,
            "impact_recall": tp/(tp+fn) if tp+fn else None,
            "unnecessary_invalidations": fp, "missed_repairs": fn, "outcomes": outcomes}
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate()
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({**report, "methods": {key: {k:v for k,v in value.items() if k != "outcomes"} for key,value in report["methods"].items()}}, indent=2))
