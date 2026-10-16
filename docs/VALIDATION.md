# NeuroSense validation

Validation date: 2026-10-16. All test accounts, messages and signing keys are
synthetic. No live user database, paid model call or real email was used.

## Context Lab workflow integration

[GitHub Actions run 38847078254](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38847078254)
passed for code commit `1158630fb34f1c3e2cee0fefc98d32cffaa5f1ae`:
**123 backend tests against real MongoDB**, **78 frontend tests**, Vite production
build and Compose configuration validation.

The existing Site successfully deployed source commit
`2d509a9893309a1752b9d669f6ac22463b594489`. Its static-host HashRouter variant
passed the same 78 frontend tests and production build before packaging. Source
comparison confirmed it matches the canonical frontend plus that router adapter.

- [Interactive Context Lab example](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/tour?view=context)
- [Protected real-data Context Lab](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/context-lab)


Implemented experimental workflows now include exact signed change previews,
owner-confirmed alternative claim support, evidence-linked commitments,
current-evidence replay, reviewed answer notes/task edits, recall decision
receipts and an explicit contradiction/stable-slot clarification gate in chat.
See [CONTEXT_LAB.md](CONTEXT_LAB.md) for behavior, limits and API paths.

Backend validation: **123 tests passed** with mongomock-motor. This includes
signed-preview binding, alternative/joint support, uncertain receipt impact,
versioned task repair and repeat-call idempotence, revocation/expiry, concurrent
target edits, privacy toggles, archived projects, clarification-before-provider,
selected-context prompts, real application JWT access, account/memory erasure,
withholding an answer changed during generation and rejecting clarification
questions as task/claim sources. GitHub CI with real MongoDB is the deployment
verification for these checks.

Frontend validation: **78 tests passed** and the Vite production build passed.
The frontend checks cover preview-before-commit, exact preview receipts, stale
approval rejection, scope/budget diagnostics, explicit clarification choices,
protected return destinations, source-linked task writes, support groups,
modal focus/draft retention, duplicate send prevention and the public tour.

The authored 15-case support-logic comparison is saved in
`backend/evaluation/context-results.json`. It is a synthetic regression aid;
it is not a public benchmark, model-quality result or novelty evidence.

No deployed Python API, Google client ID or live browser Google flow is provided
by this integration. Real provider verification and browser visual/end-to-end QA
remain operational checks. References/tombstone IDs are retained for owner-only
impact review until memory clear or workspace erasure; copied memory text is not
stored in replay/review records. No causal-inference, full-answer regeneration,
model-unlearning or multi-document crash-atomicity guarantee is claimed.

## Typography and motion refresh

[GitHub Actions run 38689851397](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38689851397)
passed for code commit `22d62bafde43e3a2ec9e0f2470a0dd6a29ebcfdb`:
97 backend tests against real MongoDB, 64 frontend tests, Vite production build
and Compose configuration validation.

The existing Site successfully deployed source commit
`88d05da37b19f183cfc665592ff5450e143365f7`. The static-host HashRouter variant
passed the same 64 frontend tests and production build before packaging; source
comparison confirmed it matches the canonical frontend plus that router adapter.
The archive contains the self-hosted font subsets and their licenses.

- [Updated public overview](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/)
- [Interactive UI tour with example data](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/tour)


Local validation: **64 frontend tests**, **97 backend tests** with
mongomock-motor, and the Vite production build passed. The build packages four
self-hosted variable-font subsets. No runtime font CDN is required.

New checks cover persisted and cross-tab motion settings, reduced-motion
overrides, blocked storage, accessible keyboard dismissal/focus, actual heading
text, navigation without losing the shell draft, single card entrances,
streamed-answer stability, cancelled animations/observers and missing browser
animation APIs. Updated recovery pages exercise API error/retry, actual reset
tokens and verification failure. See MOTION.md for route coverage and limits.

No browser-control skill is available, so animation smoothness and responsive
visual screenshots were not verified in a browser. No live Google sign-in or
hosted Python-service verification is added by this UI change. Proposed research
features and prior-art overlap are documented in RESEARCH_DIRECTION.md; the
proposal is not represented as an implemented or proven world-first feature.

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
- **52 frontend tests passed** with jsdom and Testing Library. Coverage includes
  distinct public/home pages, preserved protected destinations, first-use setup,
  safe return URLs, project-scoped home drafts, versioned task completion, tour
  interactions, explicit session verification and rotation, in-memory token
  lifecycle, reload recovery, concurrent refresh, temporary failures and stale
  response rejection. Existing memory, knowledge, graph and inbox tests pass. New checks cover visible
  Google unavailability, inline credential rejection, setup diagnostics, the official
  Google callback returning to a requested document, and the presentation walkthrough.
- Vite production build passed. Pages are split into lazy chunks.
- Source whitespace checks passed. The repository's MongoDB service CI is the
  required check for real-database behavior and Compose configuration.

## Verified GitHub CI and published interface

[GitHub Actions run 38682934156](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38682934156)
passed for code commit `7de7d7058c3e5af6f344ee401b893e376f972ec4`:
97 backend tests against real MongoDB 7.0.14, 44 frontend tests, Vite production
build and Compose configuration validation. The real Google verification library
still uses local test keys/certificates; this is not a live OAuth consent check.

The existing Site was successfully published from frontend source commit
`c2967577ecf0924b6c6f6e1bf60a6b67f1f1124e`. Its static-host variant uses HashRouter
and passed the same 44 frontend tests before packaging.

- [Public overview](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/)
- [Interactive example-data tour](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/tour)
- [Protected workspace home](https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/home)

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


## Presentation refresh

The public overview now uses an original code-rendered neural illustration,
editorial typography, a cream/plum/lavender palette and a four-step memory story.
Playback starts only on request; reduced-motion styles disable decorative motion.
The account shell, sign-in pages and tour share that identity. Public feature
links open specific tour panels, including project-scoped memory connections.

Local validation: 52 frontend tests and the production build passed. The
presentation makes no new live Google or hosted Python availability claim.


[Presentation refresh CI run 38685829644](https://github.com/Yashovardhan47/AI-Chatbot/actions/runs/38685829644)
passed for code commit `eec09b0249e51435e9aef4e82d167ff3cb1d6361`: 97 backend tests against real MongoDB,
52 frontend tests, production build and Compose configuration validation.
The matching static-host source `bbd410917383d0ff3f563de8d24b3d1ca37886d0` passed all 52 frontend
tests and was successfully published to the existing Site.

Google activation diagnostics are available at
https://neurosense-ai-workspace-demo.kummarayashovardhan.chatgpt.site/#/auth-setup.
The hosted API and Google client ID remain unconfigured; the page reports that
state explicitly. No live provider login is claimed by these automated checks.
