# NeuroSense v7 validation

Validation date: 2026-10-15. All test accounts, messages and signing keys are
synthetic. No live user database, paid model call or real email was used.

## Completed local checks

- **97 backend tests passed** with mongomock-motor. Coverage includes memory
  extraction, temporal revisions, exact source grounding, privacy, owner/project
  boundaries, review decisions, delayed-write cancellation, document import and
  citations, graph scope, recurring commitments and refresh/session revocation.
- The Google Python library verifies locally signed RSA ID tokens using a local
  certificate transport. Tests reject wrong signatures/audiences/issuers, expiry
  and unverified email, preserve subject-based identity across email changes, and
  require explicit password-confirmed linking for existing email accounts.
- JWT tests verify required claims, audience, issuer, signature, expiry, method,
  token type, account version, cookie rotation/replay, origin checks and logout
  after access expiry. An API workflow registers, signs in, saves memory choices,
  opens a chat, verifies the session, rotates and logs out.
- **44 frontend tests passed** with jsdom and Testing Library. Coverage includes
  distinct public/home pages, preserved protected destinations, first-use setup,
  safe return URLs, project-scoped home drafts, versioned task completion, tour
  interactions, explicit session verification and rotation, in-memory token
  lifecycle, reload recovery, concurrent refresh, temporary failures and stale
  response rejection. Existing memory, knowledge, graph and inbox tests pass.
- Vite production build passed. Pages are split into lazy chunks.
- Source whitespace checks passed. The repository's MongoDB service CI is the
  required check for real-database behavior and Compose configuration.

## What these checks do not establish

The hosted frontend has no deployed Python API or Google client ID. A real Google
account/consent flow and hosted JWT cookie recovery have not been tested. Local
certificate tests validate the cryptographic integration, not the live provider,
authorized origin setup or browser cookie acceptance. Anthropic/Ollama, SMTP and
Cloudinary availability are not established by protocol mocks.

The public `/tour` is an interactive illustration with labeled example records.
It has no authentication bypass and makes no simulated successful session check.
It can be inspected independently from the protected real-data pages.

No browser-control skill is available for this environment, so responsive visual
screenshots and full browser end-to-end checks were not performed. A production
load/security review and independent long-memory benchmark remain outside these
checks. See AUTH_VERIFICATION.md for the concrete live verification procedure.

## Reproduce

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
# Optional: NEUROSENSE_TEST_MONGO_URI=mongodb://localhost:27017 python -m pytest -q
cd ../frontend
npm ci
npm test
npm run build
```

The real-Mongo fixture creates and drops a unique temporary database. Never point
the test URI at a production database. The GitHub workflow uses MongoDB 7.0.14.
