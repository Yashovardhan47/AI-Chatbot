# NeuroSense research direction

Status: proposal, not an implemented capability or an established originality
claim. Prior-art check: 2026-10-15. This is a focused literature check, not an
exhaustive review or a patent search.

## Recommended question: permission-aware correction impact replay

When a user corrects or revokes a remembered fact, can NeuroSense identify and
repair only the dependent answers and commitments while preserving independently
supported work, without reintroducing evidence that is no longer allowed?

Example: a user changes a project framework from Flask to FastAPI. The system
would show which architecture answers relied on the old choice, which tasks need
review, and which conclusions still have independent evidence. If a related
source is subsequently revoked, a delayed replay job must not restore it or use
it to justify a replacement answer.

The product workflow would be:

1. Preview a revision or revocation in Memory Studio.
2. Inspect an impact list, source quotes and versioned dependencies.
3. Run a scoped shadow replay that does not modify the original transcript.
4. Compare the smallest supported answer changes and unresolved questions.
5. Explicitly approve replacement tasks or annotations. Keep history clearly
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

## What a testable contribution would require

- Versioned evidence dependencies for generated answers and tasks. The existing
  memory receipt records retrieved evidence, not a complete causal proof of every
  claim. Retrieval overlap alone cannot establish that an answer depends on it.
- An owner/project/consent epoch on replay inputs and outputs, rechecked before
  each write. Reusing an old snapshot must not bypass current permissions.
- Independent support tracking, so removing one source does not invalidate a
  conclusion still grounded elsewhere. Unsupported dependencies remain uncertain.
- Deterministic race scenarios: edits during retrieval, source revocation during
  generation, delayed worker retries, project moves and account erasure.
- Explicit separation of revision history, current eligibility and user-approved
  repairs. Never label a deleted fact as recalled current evidence.

## Evaluation before a publication claim

| Measurement | Concrete comparison |
| --- | --- |
| Impact precision/recall | Predicted affected claims/tasks against an annotated dependency oracle; also report unknown dependencies. |
| Repair correctness | Current-state factual correctness and citation validity after the change. |
| Unnecessary disruption | Fraction of independently supported conclusions changed or invalidated. |
| Post-revocation leakage | Forbidden source text/identifiers appearing in retrieval, output or newly persisted artifacts after the revocation barrier. |
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

## Other candidate experiments

- **Decision-sensitive clarification:** ask a question only when competing memory
  interpretations change the recommended action. Measure incorrect-action rate
  against the number of questions asked. Not established as novel.
- **Recall eligibility receipts:** let a user inspect why a candidate fact was
  excluded by scope, revision or consent, without exposing other owners' records.
  Measure debugging usefulness and leakage. Not established as novel.

The implementation in the accompanying UI refresh adds typography, motion
preferences and accessible navigation feedback. It does not implement these
research experiments or advertise them as working product features.
