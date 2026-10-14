# NeuroSense v6 validation

Validation date: 2026-10-14. All inputs are synthetic. No live user database,
paid AI request or real reminder email was used.

## Completed local checks

- **76 backend tests** pass locally. Existing coverage exercises grounded extraction,
  archive recall, slot revisions/current/history/as-of semantics, character budgets,
  user/project boundaries, expiry, pins, pagination, legacy confirmation, deletion,
  privacy enforcement and cancellation of delayed captures through API/WebSocket paths.
  Separate concurrency checks ensure that every accepted manual correction retains
  a revision and that out-of-order automatic captures keep the newest observation.
- New workspace coverage exercises text/PDF/DOCX import, exact page citations,
  deduplication, owner/scope checks, original download, removal and quotas; two-hop
  graph expansion and exclusion of expired linked facts; fake semantic vectors and
  stale-vector rejection; user-only snapshots, early/late context and exclusion of
  private turns; combined context budgets and the library preference.
- Reminder checks exercise concurrent due claims, deduplicated notifications,
  recurring schedules across daylight saving, task version conflicts, snoozing,
  read state, opt-out and SMTP retries with a mock sender.
- Authentication checks exercise local registration/sign-in, single-use refresh
  rotation, MongoDB-backed logout without Redis, verified Google identity with a
  mock verifier, inactive-account rejection and workspace export/erasure. A delayed
  document import cannot restore data after the account session version changes.
- Provider checks use HTTPX MockTransport for the Ollama streaming protocol and
  fake plan output for schema validation. Local live-web requests fail explicitly.
- **22 frontend tests** pass using jsdom and Testing Library. They cover Memory
  Studio actions and evidence, WebSocket readiness and stale response handling,
  account cleanup, document-note/search interaction, explicit graph relationship
  payloads, task completion/version payloads, reminder read state and HTTP/HTTPS
  WebSocket URL construction behind the same-origin proxy.
- Vite production build succeeds, with lazy chunks for the workspace pages.
- Python syntax, whitespace and deployment YAML checks pass. The synthetic memory
  harness runs on 166 records and 8 cases; it is a regression demonstration, not
  an external benchmark or a measurement of model answer accuracy.

## Additional v6 checks

Approval/rejection, owner boundaries, deleted/private source rejection, stale
proposal handling and microsecond ordering are tested through the API. Literal
global search respects owner and project boundaries. All-session revocation
invalidates access and refresh tokens. Public Google configuration excludes server
secrets, cookies are API-scoped, the Google route issues a project JWT, and changed
provider subjects cannot take over a linked account. Frontend checks verify the
official Google callback, absent/unreachable service states, proposal decisions
and safe backend URL selection.

## v6 remote validation

[GitHub Actions run 38513868543](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38513868543)
passed for code commit `9713302352dafc6671775823ba830422a42ad5a4`: all 76 backend
tests against real MongoDB, all 21 frontend tests, the production build and Compose
configuration validation. Google credentials and model/mail services remain mocked
in the tests; a live Google client and deployed API are not configured here.

## Earlier remote validation

[GitHub Actions run 38347441922](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38347441922)
passed for code commit `b14a7ed6b49800c7d2451e29132122a6e9d49016`:

- All 65 backend tests passed against an actual MongoDB 7.0.14 service.
- All 14 frontend tests, the Vite production build and `docker compose config
  --quiet` passed on the runner.

## Validation limits

Local backend tests use `mongomock-motor`. The fixture repairs a mock limitation
that loses partial-index options; real MongoDB uses the declared model index.
`NEUROSENSE_TEST_MONGO_URI` selects a real test server and creates/deletes a unique
throwaway database. The supplied GitHub Actions workflow uses a MongoDB service,
  checks the frontend and validates Compose configuration. The v6 run above verifies
  these checks against the updated code.

No live Anthropic, Ollama model, Google OAuth, SMTP or Cloudinary integration was
executed. Protocol mocks validate the application contract, not provider uptime,
model quality or email delivery. Native MongoDB and browser processes could not
start in this workspace, and Docker is unavailable here. Container builds,
responsive screenshots and actual browser end-to-end checks therefore remain
outstanding. No production deployment, load test, LoCoMo or LongMemEval evaluation
was performed. See RUN_WORKSPACE.md for the configuration needed to run the app.

## Reproduce

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
python -m evaluation.evaluate_memory
# Optional: set NEUROSENSE_TEST_MONGO_URI to a disposable test MongoDB.

cd ../frontend
npm ci
npm test
npm run build

cd ..
# After filling root .env with private values:
docker compose config --quiet
docker compose up --build -d
```
