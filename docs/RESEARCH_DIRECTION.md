# NeuroSense research direction

Status: an experimental implementation is available in Context Lab as of
2026-10-16. This is not an established originality claim. Prior-art check:
2026-10-15. This is a focused literature check, not an exhaustive review or a
patent search. See [CONTEXT_LAB.md](CONTEXT_LAB.md) for the actual workflow,
permissions, API, retained metadata, test procedure and implementation limits.

The implementation includes signed change previews, versioned owner-confirmed
claim support groups, evidence-linked commitments, current-evidence replay,
explicitly approved answer notes/task edits, recall exclusion receipts and a
decision clarification gate. A reproducible 15-case synthetic support-logic
comparison is included in `backend/evaluation/evaluate_context.py`; its results
do not establish research superiority, model quality or world-first novelty.

## Recommended question: permission-aware correction impact replay

When a user corrects or revokes a remembered fact, can NeuroSense identify and
repair only the dependent answers and commitments while preserving independently
supported work, without reintroducing evidence that is no longer allowed?

Example: a user changes a project framework from Flask to FastAPI. The system
would show which architecture answers relied on the old choice, which tasks need
review, and which conclusions still have independent evidence. If a related
source is subsequently revoked, a delayed replay job must not restore it or use
it to justify a replacement answer.

The implemented product workflow is:

1. Preview a revision or revocation in Memory Studio.
2. Inspect an impact list, source quotes and versioned dependencies.
3. Re-resolve recorded, scoped memory evidence without modifying the transcript.
4. Inspect current evidence and unresolved or independently supported claims.
5. Explicitly approve task edits or separate evidence notes. Keep history clearly
   marked as historical; do not silently rewrite past user conversations.

## Closest prior work

| Work | Existing contribution | Implication for NeuroSense |
| --- | --- | --- |
| [Zep (2025)](https://arxiv.org/abs/2501.13956) | Temporal graph memory maintains historical relationships across conversational and business information. | Persistent temporal graph memory by itself is established prior work. |
| [RECON (2026)](https://arxiv.org/html/2607.16716v1) | Evaluates dependency reconstruction, cascade propagation, source conflicts, counterfactual reasoning and temporal tasks. | Correction cascades and counterfactual memory reasoning are already studied. Use these as relevant comparison tasks, not a world-first claim. |
| [StateAuditor (2026)](https://arxiv.org/abs/2608.01619) | Audits response drafts for implicit dependencies on stale state and repairs them. | Updating behavior after memory changes is already studied. A new contribution needs a narrower method and evaluation. |

Inference from this limited review: a worthwhile hypothesis is **minimal repair
under changing permissions and concurrent jobs**, rather than generic memory,
graphs, replay, or correction propagation. These sources do not establish that
the narrower combination is unique. Continue the review before claiming novelty.

## What a research contribution still requires

- Independently annotated claim dependencies and model-generated-answer
  evaluation. Current dependencies are retrieval receipts plus exact claim
  support explicitly confirmed by the owner; they do not prove causal reasoning.
- Evaluation of the implemented account/scope/revision/target checks under real
  database load, failover and long-running worker schedules. The existing owner
  lease is bounded; cross-collection crash atomicity is not established.
- Larger independent-support experiments. The implemented AND/OR support groups
  preserve a complete allowed alternative, while untracked dependencies remain
  unknown. The small authored logic comparison is only a regression aid.
- Broader deterministic race scenarios and production end-to-end measurements.
  Tests already cover revocation during generation, stale approvals, expiry,
  target edits, privacy toggles, project archive and account erasure.
- Explicit separation of revision history, current eligibility and user-approved
  repairs. Never label a deleted fact as recalled current evidence.

## Evaluation before a publication claim

| Measurement | Concrete comparison |
| --- | --- |
| Impact precision/recall | Predicted affected claims/tasks against an annotated dependency oracle; also report unknown dependencies. |
| Repair correctness | Current-state factual correctness and citation validity after the change. |
| Unnecessary disruption | Fraction of independently supported conclusions changed or invalidated. |
| Post-revocation leakage | Revoked fact text or ineligible evidence references entering new model context or review evidence. Account for already-delivered streams and explicitly retained owner-only tombstone/reference IDs separately. |
| Concurrent-write correctness | Stale jobs rejected, latest eligible versions preserved, no deleted record recreated. |
| Practical cost | Added p50/p95 latency, model calls, storage and user approvals. |

Compare against the current retrieval filter, full regeneration, a stale-draft
auditor, dependency-only invalidation, and the proposed permission-aware replay.
Use the same model, context budget and data for each. Ablate permission epochs,
independent support checks and replay depth. Separate synthetic deterministic
cases from consenting human annotations; publish uncertainty and failure cases.
Evaluate any external baseline from its original implementation and documented
configuration rather than assuming a local approximation is equivalent.

An audit can demonstrate behavior for the covered storage paths, versions and
race schedules. It cannot prove that a model has forgotten training data or that
all possible downstream copies have been erased.

## Additional implemented experimental tools

- **Decision clarification:** a bounded, explicit contradiction/stable-slot
  heuristic pauses decision-oriented chat before the provider call. Selected
  current versions guide that turn. It does not prove answer sensitivity or
  detect every ambiguity. Measure incorrect-action rate and question burden.
- **Recall eligibility receipts:** the actual memory ranking and character budget
  are exposed with redacted exclusion counts. Other owners' records never enter
  the scan. Measure debugging usefulness and leakage on a broader workload.

These features are implemented as experimental workflows. Full answer
regeneration, automatic causal dependency discovery, public-benchmark results,
live production authentication verification and publication novelty remain
separate work. No world-first or model-unlearning guarantee is advertised.
