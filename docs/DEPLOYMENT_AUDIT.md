# NeuroSense deployment audit — 28 October 2026

Repository: `Yashovardhan47/AI-Chatbot`, branch `chatbot-update`.
Starting commit: `d3712762d39af814e1a1b7184b3703ad7f924fd4`.

**Status: suitable for controlled staging after configuration; public production
is not cleared by this audit.** The existing hosted URL is a frontend tour. It
does not host FastAPI, MongoDB, Google OAuth configuration or a language model.

## Corrections in this audit

| Area | Verified problem | Change |
| --- | --- | --- |
| Repository | 18,304 local/generated files were tracked, including both `.env` files, a Python environment, npm dependencies and bytecode | Removed them from the current Git tree while keeping local copies; added a CI hygiene check. History is preserved. Inspected environment values were placeholders/local settings; no live credential disclosure was established. |
| Dependencies | npm reported 16 affected packages; the Python environment included affected JWT, multipart, SMTP, database and framework dependencies | Updated affected versions, replaced python-jose/ecdsa with PyJWT, added production/development locks and CI audits. Baseline Python reports included duplicate advisory records and development tooling, so their raw count is not a count of distinct production exploits. |
| Password reset | Two concurrent requests could both consume one reset token | Compare-and-set checks token, expiry, active account and generation; exactly one reset wins and sessions are invalidated. |
| Account writes | Slow uploads and whole-user saves could overwrite newer security/privacy fields | Atomic field updates, generation checks and owner guards for password, profile, deactivation, project/chat creation, feedback and document mutations. |
| Verification | Verification tokens were stored raw without an expiry; no resend path | Hashed 24-hour verification tokens, single-use atomic verification and a generic resend response with recovery UI. |
| Verification UI | StrictMode could issue two requests for a single-use link and display the second failure | Shares the pending verification request; regression test covers the successful effect replay. |
| Google/JWT | Dependency changes required preserving token validation and generation checks | Retained strict algorithm/issuer/audience/expiry/type checks, Google identity checks, explicit linking, refresh rotation and revocation; session issuance rechecks the account generation. |
| Chat transport | Access JWTs were placed in WebSocket query strings | Bounded first-frame authentication, origin checks and a server `ready` acknowledgement; the composer retains its draft until authentication succeeds. |
| Projects | Malformed IDs raised server errors; archived projects could still be fetched/updated; fields were unbounded | Consistent owned-active lookup, 404 responses, bounded/trimmed inputs and guarded writes. |
| Attachments | Unbounded reads, synchronous provider calls and whole-user statistics saves | Bounded validation of the entire batch, threaded provider I/O with timeouts, atomic statistics and rollback attempts on failure or stale sessions. Unconfigured storage returns 503. |
| Knowledge | DOCX XML used a general parser; project state was not rechecked after parsing | Defused XML parsing, existing expansion limits retained, project recheck inside the import guard, guarded indexing/deletion and context invalidation on deletion. |
| Frontend state | Delayed failures/mutations could modify state after account changes | Epoch checks in project and chat stores. |
| Deployment | Static health response could not detect database loss; Compose omitted upload and SMTP TLS settings | Database readiness endpoint, healthcheck integration, configuration preflight, explicit production defaults and forwarded integration settings. |
| Ingress | No authentication request limit in the bundled nginx configuration | Added an authentication rate limit and forwarded client address chain; separate API hosting must provide equivalent ingress protection. |

## Verification

- Backend: 136 tests passed locally after the audit fixes, using an isolated
  mongomock-motor database. CI runs the same suite against real MongoDB.
- Frontend: 81 tests passed across 21 files; Vite production build passed.
  CI and the publication record provide the pushed-commit checks.
- Production lock and development lock: `pip-audit` reported no known
  vulnerabilities in their resolved dependency sets. `npm audit` reported zero.
  These are point-in-time advisory checks, not a proof of security.
- `pip check`, Git whitespace checks and repository hygiene checks passed.
- Browser QA on the managed preview: landing page and the illustrative Context
  Lab preview → apply → replay → approve flow rendered and completed.
- Local Docker is unavailable in the audit environment. CI checks Compose,
  builds the web container and validates nginx configuration. No local full-stack
  container startup, external SMTP delivery, paid AI call or real Google consent
  was performed.

## Required before public production

1. Provide a private signing key, `DEBUG=false`, exact HTTPS frontend origin,
   authenticated production MongoDB, an explicit working AI provider, SMTP and
   the owner's Google OAuth web client. Run `python -m app.preflight` in the
   deployment environment; then check actual Google consent, JWT refresh/logout,
   email verification/reset, AI streaming and the reminder worker there.
2. Add durable ownership/lifecycle records and retryable cleanup for external
   Cloudinary attachments before offering complete erasure of those files.
   Current workspace erasure deletes MongoDB data; it does not delete all
   previously uploaded external assets. Leave optional uploads disabled until
   the required retention policy is implemented.
3. Strengthen owner mutations with transactions/fencing and crash recovery before
   promising atomic multi-document corrections or erasure. The existing 60-second
   lease serializes ordinary requests; it is not a transaction and cannot protect
   against a process resuming after lease expiry. Avoid placing slow external
   work inside it. This audit does not claim crash-atomic behavior.
4. Load-test realistic long histories and move chat messages into paginated,
   separate records for sustained heavy use. Embedded arrays and account-wide
   exports must not grow toward MongoDB's document/memory limits unnoticed.
5. Configure trusted ingress, monitoring, alerts, backups and a restore drill;
   scan and pin container images by digest. The dependency audit does not inspect
   operating-system packages in container images.

Motor remains on its supported critical-fix line in this release. Plan migration
to the PyMongo Async driver and a compatible Beanie version before Motor's
critical-fix support ends on 14 May 2027, as stated in the driver documentation:
https://motor.readthedocs.io/en/stable/

## Strong next research directions

These are proposed extensions, not implemented features or claims of world-first
novelty. A literature review and reproducible comparison are still required.

1. **Purpose-limited recall:** attach user-approved purpose and expiry conditions
   to a memory, then record why it was permitted for this answer. Measure
   constraint violations, useful recall and abstention against normal
   project-scoped retrieval. This would extend the existing scope/privacy flags.
2. **Verifiable forgetting across derived data:** inventory documents, embeddings,
   external files and review records; execute deletion as a durable workflow and
   retain content-free completion receipts. Evaluate whether deleted information
   can reappear after retries, crashes or delayed jobs. This would extend the
   current reference-aware memory deletion and address the external-file gap.
3. **Long-horizon evaluation workspace:** compare retrieval and answering on
   changing preferences, temporal updates and implicit constraints, recording
   model, prompts, cost, latency, leakage and abstention. Keep held-out cases and
   answer grading separate from tuning. Local deterministic tests are not a
   substitute for these experiments.

Relevant primary research: LongMemEval evaluates extraction, multi-session and
temporal reasoning, updates and abstention; LoCoMo-Plus adds evaluation of latent
constraints that may not be explicitly queried later.

- https://arxiv.org/abs/2410.10813
- https://arxiv.org/abs/2602.10715
