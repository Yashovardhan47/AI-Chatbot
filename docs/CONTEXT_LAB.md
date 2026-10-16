# Context Lab: implemented experimental workflows

Implemented on 2026-10-16. This is an experimental product workflow, not an
established research novelty or an automatically verified reasoning system.

## The user workflow

1. Register or sign in, finish the memory-policy setup, and open the separate
   workspace home. Protected deep links return to their requested destination.
2. Save grounded memories, review proposals and choose a personal/project scope.
3. Chat with eligible context. For a decision query with a recorded contradiction
   or conflicting stable-slot values, choose context before the AI provider is
   called. A choice applies to that turn; it does not rewrite stored memories.
4. On an answer, use **Track claim support** to quote an exact claim and confirm
   its support groups. Every memory in a group is needed; a complete alternative
   group can keep a tracked claim supported after another source changes. These
   are owner assertions, not a proof of the model's actual reasoning.
5. Use **Keep a next step** to write a commitment. The source answer and eligible
   memory versions are linked to it, alongside its own schedule and status.
6. Open **Context Lab** from home, navigation or a Memory Studio detail. Propose
   a correction/removal, preview recorded impact and apply the exact preview.
7. Inspect possible effects separately from owner-confirmed affected claims and
   surviving alternative support. Replay current evidence for the selected item.
8. Explicitly approve a separate answer evidence note or review/edit a commitment.
   Original conversation text remains historical. Task schedules and completion
   status are preserved; competing task edits reject a stale review.

Direct memory edits/removals and automatic stable-slot corrections also create
reference-only change history, so the workflow does not depend on using the Lab
editor. Continuity flags linked commitments when their evidence versions change.

## Other tools

**Recall decisions** runs the same memory ranking and exact character-budget
packing as normal memory recall. It reports included facts, ranked facts that do
not fit the budget/result limit, non-matches, and counts of paused, expired,
unconfirmed, inactive or out-of-scope records. Ineligible text and IDs are withheld.
This tool covers memory records; document/session retrieval is a separate layer.

**Clarify a decision** exposes the same bounded conflict heuristic used by chat.
It considers eligible explicit `contradicts` edges and different values of a
stable slot, matched to a decision-oriented question. Historical questions bypass
the gate. Up to eight versioned choices can resolve separate conflicts. This does
not detect every semantic ambiguity or prove that a choice changes the answer.

## Permission and concurrency behavior

- Owner and active-project checks apply to every target and supporting memory.
- A signed preview binds the owner, account generation, memory version, context
  revision, action and exact corrected text. It expires after 15 minutes.
- A replay expires after 15 minutes. Approval rechecks the account generation,
  memory preference, project, context revision, target fingerprint and current
  eligibility/version of every reference. Expired/revoked evidence is rejected.
- Replay records store references and hashes, not a copied prompt, old memory
  quotations, full answers or a generated replacement answer. Evidence shown in
  a replay/review is resolved from currently permitted memory records.
- Answer reviews are separate records; they never rewrite the original answer.
  Task writes use an expected version and record their replay ID for repeat-call
  idempotence. No language-model call runs inside the mutation lease.
- If context changes during chat generation, the final answer is not persisted
  and the client clears the transient stream. Already delivered/in-flight deltas
  cannot be recalled; this is not a guarantee of retroactive deletion from a
  browser, a provider or an external copy.
- Memory removal deletes that fact and its revisions. Owner-only change history,
  claim offsets and review references may retain its identifier for impact
  auditing. Chat transcripts and commitments remain separate records. **Clear
  all memories** removes the four research record collections too; **Erase
  workspace** includes them and invalidates account sessions.

The existing cross-worker owner lease expires after 60 seconds. The new operations
are bounded and make no external provider call while holding it. Multi-document
crash atomicity, stalls beyond that lease and production load/failover behavior
are not proved by this implementation. Replica-set transactions or a renewed,
fenced mutation protocol are required for stronger deployment guarantees.

## Coverage limits

Impact scans inspect at most 200 matching conversations, 200 commitments and 500
matching claim records, with an explicit incomplete-scan flag. Reports are paged.
Unknown/untracked claim dependencies remain possible. Claim forms list the first
100 eligible memories; recall diagnostics detail the first 200 eligible records.

A replay re-resolves the selected item's recorded memory references and confirmed
support. It proposes an evidence note or a human-reviewed task update. It does
not regenerate a full AI answer or perform automatic causal inference. Document,
session and arbitrary external dependencies are not claimed as tracked here.

The public tour at `/#/tour?view=context` is a labeled interactive illustration
using example data. It makes no API, AI or account write and does not bypass
authentication. Real data lives behind `/context-lab` and the Python API.

## API map

| Method/path | Purpose |
| --- | --- |
| `GET /api/context/changes` | Owner change history with pagination cursors. |
| `POST /api/context/preview` | Read-only, signed correction/removal preview. |
| `POST /api/context/changes` | Apply the exact reviewed change. |
| `GET /api/context/changes/{id}` | Inspect recorded downstream impact. |
| `POST /api/context/replays` | Prepare current-evidence review metadata. |
| `POST /api/context/replays/{id}/apply` | Explicitly approve the evidence note or task edit. |
| `GET /api/context/answers/{chat}/{message}` | Inspect current eligible support choices. |
| `POST /api/context/support` | Confirm exact claim offsets and versioned support sets. |
| `POST /api/context/recall-audit` | Explain memory eligibility, ranking and budget decisions. |
| `POST /api/context/clarify` | Inspect explicit decision conflicts and one-turn choices. |

## Reproducible checks

```bash
cd backend
python -m pytest -q
python -m evaluation.evaluate_context --output evaluation/context-results.json
cd ../frontend
npm test
npm run build
```

`evaluate_context` compares three authored support-logic heuristics on 15 explicit
synthetic scenarios, including an unknown-dependency case. The stored JSON lists
every expected and predicted outcome. This is a logic regression comparison,
not a public benchmark, model-quality result, privacy proof or superiority claim
over an external research system. API tests separately exercise owner/scope
boundaries, revocation, races, JWT access, account erasure and stale approval.

The hosted frontend still requires an operational Python API, database and Google
client configuration for a real live account flow. Browser visual/end-to-end QA
and live Google consent verification are not established by unit tests.
