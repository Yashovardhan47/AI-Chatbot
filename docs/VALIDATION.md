# NeuroSense integration validation

Validation date: 2026-10-09. All test inputs are synthetic. No live user database
or paid AI provider was used.

## Completed checks

- **36 backend tests**: quoted extraction, conservative rejection of unsupported
  inputs, archive recall after 150 newer facts, ODM reinitialization against the
  same persisted test database, duplicates, current/history/as-of semantics,
  bounded evidence size, user/project boundaries, expiry, pins, manual corrections,
  optimistic-version conflicts, pagination, confirmation of legacy facts, deletion,
  pausing, and privacy enforcement through the actual WebSocket route.
- Slow extraction tests: deletion, clear-all, correction and pause cancel pending
  capture. Older delayed turns cannot overwrite a newer observation. Microsecond
  ordering is retained separately from BSON's millisecond datetime precision.
- Authentication checks: refresh tokens, inactive accounts, foreign chats and
  deleted chats cannot open the memory-backed WebSocket route.
- **9 frontend tests** using jsdom and Testing Library: Memory Studio source/history,
  add/correct/pin/delete API payloads and real IDs, recall evidence, privacy controls,
  load failures, socket readiness, stale-chat responses, clean final response text,
  logout cleanup and late responses belonging to a prior account.
- Frontend Vite production build completed successfully.
- The synthetic retrieval harness ran successfully on 166 memory records and 8
  cases. It compares a recency window, flat lexical evidence and NeuroSense.
  This is a reproducible regression demonstration, not an external benchmark.

## Validation limits

Backend tests use `mongomock-motor`, not a live MongoDB server. The test fixture
explicitly repairs a mock limitation that drops partial-index options; the model
declares the intended partial unique index. The fixture accepts a real test server
through `NEUROSENSE_TEST_MONGO_URI`; each run uses and deletes a unique temporary
database. A temporary MongoDB binary could not start in this workspace.

AI responses were stubbed in integration tests. Optional provider-based extraction,
real Anthropic streaming, Google OAuth, SMTP and Cloudinary were not tested against
live services. Rule extraction and manual memory/recall require no AI key.

Frontend tests verify interaction and state behavior in jsdom. Native browser
processes failed to start in this workspace, so screenshot, responsive layout and
real-browser end-to-end verification remain outstanding. Production deployment,
load tests and LoCoMo/LongMemEval evaluation were not performed.

## Reproduce

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
python -m evaluation.evaluate_memory
# Optional: set NEUROSENSE_TEST_MONGO_URI to a disposable local test MongoDB.

cd ../frontend
npm ci
npm test
npm run build
```
