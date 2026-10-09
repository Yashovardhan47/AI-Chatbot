# NeuroSense AI

## Goal and repository analysis

NeuroSense is the persistent memory engine integrated into the existing NeuroFusion
FastAPI + MongoDB + React chatbot. It retains explicitly stated user facts across
sessions and server restarts, retrieves relevant evidence, and records how facts
change. The remote branch is `chatbot-update`; `chatbot_update` was not present.

Before this change the application stored a single `MEMORY:` string generated in
an assistant answer, compared exact strings for duplicates, and supplied the newest
50 records to every chat. Three recent raw chats were also injected into new
sessions. Facts had no update history, project scope or retrieval explanation.
Deletion merely marked records inactive. There were no backend memory tests.

## Implemented capabilities

- Durable MongoDB storage: no automatic age-based deletion. Optional explicit
  expiry is supported by the create API; expiry affects recall, not archival storage.
- Grounded capture: rule extraction stores literal first-person source quotes.
  Names, locations, education, graduation, work, skills, preferences and goals have
  conservative rules. Explicit “Remember …” can store an event or note. Unsupported
  phrasing may require manual entry or the optional model extractor.
- Semantic facts, episodic events and procedural workflows are available as
  memory types. These are storage categories, not three separately trained models.
- Stable slots (for example `profile.location`) identify mutually exclusive facts.
  A new value atomically replaces the current value and archives the old value
  with its original source and observation interval. Unrelated notes use distinct
  keys. New preferences with different wording are separate notes unless corrected
  by the user; semantic contradiction resolution is not generally solved.
- Personal memories may apply across projects. Project memories apply only inside
  their project. All reads, writes, revisions and sources are owner-scoped.
- Recall uses BM25 over terms, character trigrams, bounded recency, importance and
  optional user pins. It examines the owner's scoped archive rather than a newest
  50-item window. It is a lexical retriever, not an embedding model.
- Whole facts fit an exact character budget. Oversized evidence is skipped, never
  chopped into misleading fragments. This budget is not a provider token count.
- Recall supports explicit `as_of` dates and supplies past versions for historical
  questions. Dates record when the user told the system something, not necessarily
  when the real-world event occurred. Backdated event extraction is future work.
- Missing evidence yields an empty recall packet. The AI is instructed to abstain
  from inventing memories and to cite `[memory:ID:vVERSION]` when using a fact.
- Memory Studio: add, inspect source quotations, correct, pin, confirm older
  ungrounded memories, delete and inspect revision history. Recall Explorer previews
  selection and reasons without calling an AI provider.
- Pause recall/capture for the whole account; disable automatic capture while
  keeping explicit saves; or skip both for an individual chat message.
- Memory facts and revisions are deleted from the memory collection. Stored answer
  receipts contain references, not duplicate facts. Original chat transcripts and
  previously generated answer text remain separate; deleting memory is not transcript
  erasure. Previously opened pages or in-flight answers may still display prior
  evidence. Normal new turns never mine old chats to silently recreate deleted facts.
- Chat and the multi-agent endpoint use the same scoped memory retrieval path.
  Document RAG remains grounded in the supplied document rather than personal facts.

## Write, retrieve and answer

1. Authenticate the user and validate project ownership.
2. Save the user message, with an immutable message identifier.
3. If memory is enabled, extract quoted user facts from that message only.
4. Update each scoped slot with a unique index and a compare-and-swap version check.
   Owner writes share a MongoDB lease. Deletion, correction and manual saves advance
   a generation counter, cancelling extraction that started before those actions.
   Older delayed turns cannot overwrite a newer observation in the same slot.
5. Rank allowed current facts and pack whole evidence entries within the budget.
6. Provide structured evidence to the AI as untrusted data, with source IDs.
7. Save the answer and a receipt describing selected IDs, versions, scores and budget.

Credentials and obvious system-instruction patterns are filtered. This is a
defense in depth, not a claim of complete prompt-injection resistance. The source
of information always matters: an assistant answer is never used as a memory fact.

## Research contribution and honest novelty claim

**Working title:** NeuroSense: Evidence-Grounded, Scope-Aware Temporal Memory for
Persistent Conversational Assistants.

Persistent memory alone is established prior work. This implementation is a
research prototype, not a demonstrated new state of the art or a publication
guarantee. Its testable direction is a joint evaluation of budgeted long-term
recall, current-fact consistency, source traceability, project boundaries, and
user-directed correction/deletion. A combination of features is not by itself
proof of scientific novelty.

Relevant primary sources:

- [LoCoMo, ACL 2024](https://aclanthology.org/2024.acl-long.747/): long multi-session
  conversations and long-term memory evaluation.
- [LongMemEval](https://arxiv.org/abs/2410.10813): extraction, multi-session reasoning,
  temporal reasoning, knowledge updates and abstention.
- [Mem0](https://arxiv.org/abs/2504.19413): scalable extraction, consolidation and
  retrieval of long-term memories.
- [APEX-MEM](https://arxiv.org/abs/2604.14362): temporal, entity-centric graph memory.

**Hypotheses to test, not achieved claims:**

1. Grounded, versioned facts reduce outdated-fact recall compared with a flat
   archive at the same evidence budget.
2. Query-relevant selection recalls old important facts better than a recency
   window at matched budgets.
3. Explicit scopes and inspectable receipts reduce unwanted cross-project recall
   without materially harming allowed recall.

The included synthetic harness compares recency-only, flat lexical and NeuroSense
retrieval on old facts, corrections, temporal queries, expired facts, boundaries
and unknowns. It measures evidence recall, abstention, forbidden-fact cases,
retrieval time and context size. It does not measure LLM answer accuracy. It is a
tiny regression suite, not LoCoMo/LongMemEval results. Baselines share owner/scope
filtering; their remaining differences are documented in the script.

For a publication: evaluate held-out LoCoMo and LongMemEval questions, use the same
reader model and context budget, report confidence intervals over conversations,
run ablations for time, source grounding, pinning and budgets, and measure corrected
facts, empty evidence, unwanted recall, latency and actual provider token cost.
Compare with current Mem0 and temporal-memory baselines, disclose all configurations
and dataset exposure, and release reproducible outputs before claiming novelty.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/memory/?offset=0&limit=100` | Paginated memory library |
| `POST /api/memory/` | Save an owner-confirmed fact, type, scope and optional expiry |
| `GET /api/memory/stats` | Counts, revisions and privacy status |
| `POST /api/memory/recall` | Inspect evidence for a query, scope, budget and optional `as_of` |
| `GET /api/memory/{id}` | Source and revision history |
| `PATCH /api/memory/{id}` | Correct, confirm or pin using `expected_version` |
| `DELETE /api/memory/{id}` | Delete the fact and all revisions |
| `DELETE /api/memory/` | Delete all memory records, including inactive legacy records |
| `PUT /api/users/preferences` | Set `memory_enabled` and `memory_auto_capture` |

Example recall request:

```json
{"query":"Where did I live?","as_of":"2026-09-01T00:00:00Z","budget":6000,"limit":8}
```

## Limits and next steps

Retrieval currently scans the allowed archive and scales linearly; indexes prepare
for candidate filtering, but a full search/vector index and a graph retriever are
not implemented. Very large archives and many revisions need separate collections
and indexed candidate retrieval before reaching MongoDB's document size limit.
Extraction is conservative and English-first. Semantic equivalence, multilingual
capture, external document ingestion, multi-hop graph reasoning, temporal event
inference, learned memory admission and measured uncertainty remain future work.

Per-record edits use atomic compare-and-swap and unique slot indexes. A per-owner
MongoDB lease serializes writes across workers; a generation counter prevents
pending extraction from undoing owner deletion or correction. Leases expire after
60 seconds to recover from crashes; pathological stalls beyond that require
transactions or stronger fencing. An in-flight answer already has its context.
Production also needs
database backups, transport/storage encryption, quotas, secure secret provisioning
and provider integration tests. The memory feature does not train/fine-tune the
underlying LLM; it learns facts by storing and retrieving them.
