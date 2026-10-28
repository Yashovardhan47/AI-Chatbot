# Run NeuroSense as a Python full-stack application

The frontend is React. FastAPI provides authentication, streaming chat, memory,
knowledge ingestion/retrieval, relationships, continuity, reminders and account
controls. MongoDB stores the workspace. A separate Python worker processes due
commitments and optional reminder email; Redis is optional for revocation caching.

## Docker Desktop on Windows, macOS or Linux

1. Copy the repository-root `.env.example` to `.env`.
2. Generate two private hex values with `python -c "import secrets; print(secrets.token_hex(32))"`.
   Put one in `SECRET_KEY` and the other in `MONGO_PASSWORD`.
3. Configure an Anthropic key or use local Ollama below. Memory, notes, passage
   retrieval, tasks and the inbox work without a language-model provider.
4. Run `docker compose up --build -d` from the repository root.
5. Open `http://localhost:8080`, register and sign in. The public landing page and
   signed-in workspace are separate routes. Local development can auto-verify email
   when SMTP is absent; production requires configured email or Google OAuth.

For local model chat:

```bash
docker compose --profile local-ai up --build -d
docker compose exec ollama ollama pull llama3.2
docker compose exec ollama ollama pull embeddinggemma
```

Set `AI_PROVIDER=ollama` and `EMBEDDINGS_PROVIDER=ollama` in the root `.env`, then
run `docker compose up -d --force-recreate api worker`. Select Local in chat.
Use Build semantic index in Graph and Index in a document's source view. Indexing
runs in batches of 24; repeat until the relevant archive is indexed. An unavailable
semantic service falls back to lexical retrieval and reports that mode.

Use `docker compose logs -f api worker` to diagnose startup or reminder issues.
The database volume persists across container restarts. Avoid deleting volumes
when preserving your data. Set `DEBUG=false` and serve behind HTTPS for an actual
production deployment; refresh cookies then require a secure connection.

## Run without Docker

Use Python 3.12, Node 22 and a running MongoDB instance. Copy `backend/.env.example`
to `backend/.env` and `frontend/.env.example` to `frontend/.env`; fill private
settings rather than relying on credentials committed by older versions.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.lock
uvicorn app.main:app --reload --port 8000
```

In a second backend terminal with the same environment, run `python -m app.worker`.
In the frontend directory, run `npm ci` and `npm run dev`; open port 5173.

## Daily workflow

- Chat: discuss a goal, recall older context, save a session snapshot, and give
  answer feedback that adjusts ranking of the same cited memory version.
- Memory: inspect and correct facts, then turn a remembered goal into a commitment.
- Knowledge: import PDF/DOCX/text/CSV/JSON or save a note; inspect exact passages,
  download the original file, and ask a source-grounded question.
- Graph: connect related facts. Recall may follow up to two explicit links while
  enforcing owner, project, expiry and confirmation boundaries.
- Continuity: add tasks, set due times, repeat daily/weekly, complete, snooze or
  delete them. View user-quote snapshots and in-app due reminders.
- Settings: control automatic capture, snapshots, library use and email reminders;
  export the workspace or explicitly erase stored workspace data.

Google OAuth requires the same client ID in the frontend/backend and authorized
origins for the actual app URL. SMTP reminder email requires mail settings and an
opted-in account. The worker never autonomously creates goals or sends email for
accounts that have not opted in. SMTP retries provide at-least-once attempts, not
a guarantee against duplicates after an ambiguous mail-server timeout.

Scanned PDFs need external OCR. Video/audio understanding, autonomous OS actions
and model fine-tuning are outside this release. Multilingual retrieval depends
on the configured embedding model; extraction rules remain conservative.

## v6 real authentication and hosted frontend

The new NeuroSense interface has a public overview and a distinct authenticated
workspace. Memory Inbox, global search, recent activity and security controls use
the Python backend. There is no sample-data authentication bypass.

To use a separately hosted frontend, deploy the FastAPI API with MongoDB, set
FRONTEND_URL to the exact frontend origin, use DEBUG=false and private SECRET_KEY,
and set REFRESH_COOKIE_SAMESITE=none for cross-site HTTPS cookies. Some browsers
restrict third-party cookies; serving the frontend/API through one HTTPS origin
is the preferred production topology. Use Backend connection on the sign-in page
to provide the actual HTTPS API base URL ending in /api. The interface validates
/api/auth/config before selecting it.

For Google sign-in, create a Google OAuth web client for your own project and set
GOOGLE_CLIENT_ID on the backend. Add your frontend's exact origin to that client's
authorized JavaScript origins. The frontend obtains the public client ID from
/api/auth/config and uses Google's official Identity Services button; it never
asks for a client secret. The full flow cannot be verified live without that
client and an operational server. JWT registration/login, refresh rotation, logout,
all-session revocation and the Google-to-project-JWT route have automated checks;
provider identities are mocked in the Google checks.

The current authentication checks also verify real Google-library RSA signatures
using local signing keys and a stubbed certificate transport. This exercises
signature, audience, issuer, expiry and verified-email rejection without a real
Google account. Live Google consent remains a separate deployment check.

Enable Review captured facts before saving in Memory Inbox or Settings. Captured
facts remain proposals until explicitly approved, and never replace a newer fact
when approved late. Manual memory additions are explicit saves. Session snapshots
remain a separate opt-in historical-quote feature.


## V7 page and account workflow

- `/` is the project overview; `/tour` is a public, clearly labeled interactive
  illustration. The tour never supplies an authentication bypass.
- Sign up or use Google, sign in, and choose review/automatic/manual memory in
  `/setup`. Those choices are saved in MongoDB account preferences.
- `/home` is the authenticated workspace. Its composer carries your draft and
  selected project into a conversation. `/chat` lists actual conversations.
- `/security` checks the current JWT through `/api/auth/session`. Rotate & verify
  performs a real cookie rotation followed by protected verification. Linking
  Google to an existing email account requires that account's current password.
- Upgrade from v6: sign in again. V7 requires issuer, audience, issued-at, expiry,
  token ID, session version and method claims. Access tokens remain in memory;
  the persistent browser marker contains only the account ID. Reload recovery
  uses the HttpOnly refresh cookie. A network error during refresh does not erase
  a session; a rejected cookie ends it. Logout clears private UI immediately.

The hosted tour can be inspected without an API. The live authenticated pages
still require an operational FastAPI/MongoDB deployment. Neither the static Site
host nor its ChatGPT access gate runs that Python application for you.


## Context Lab workflow

After sign-in and first-use memory setup, open `/context-lab` from home or the
workspace navigation. Create a memory and a conversation, track exact claim
support or save an evidence-linked commitment, then preview a correction from
Memory Studio. Apply the exact preview, replay the recorded impact and explicitly
approve the evidence note or task edit. Recall diagnostics and decision
clarification are adjacent tabs. No new external dependency or paid model is
required for these evidence-review operations. See CONTEXT_LAB.md for permission
checks, reference retention, scan limits and the distinction from full AI answer
regeneration.

The public `/#/tour?view=context` panel is an illustrative workflow. Real account
data uses the Python/MongoDB application and its configured provider services.

## Deployment audit and configuration gate

Run `python -m app.preflight` from `backend` before a public deployment. It prints
configuration issues without printing private settings, and exits nonzero while
required settings are missing. A passing configuration check still requires the
live service checks listed in its output. `/api/health` reports process liveness;
`/api/ready` returns 503 when MongoDB cannot be reached. Compose uses readiness.

The root example explicitly sets `DEBUG=true` for local HTTP development.
Compose defaults to `DEBUG=false` when the setting is omitted. Production rejects
an HTTP frontend origin or a development signing key. Preserve the exact HTTPS
origin in `FRONTEND_URL` and in Google authorized JavaScript origins.

Verification links expire after 24 hours and store only a hash. Pending accounts
with links from older versions should request a new link from the expired-link
page. Password reset consumes its token atomically and invalidates sessions.
The browser sends its chat JWT in an authentication frame, waits for `ready`,
then permits messages. Clients using `?token=` must upgrade with this release.

Optional chat attachments require all three `CLOUDINARY_*` values. Compose now
forwards these and the SMTP TLS settings. Uploads are bounded per file and failed
or stale batches attempt to remove completed external uploads. Existing remote
Cloudinary assets are not covered by MongoDB workspace erasure: keep uploads
disabled where complete erasure is required until an asset inventory and durable
cleanup workflow are added. Knowledge Library originals are stored in MongoDB
and are covered by workspace erasure.

The supplied nginx entrypoint limits authentication requests. Host the API only
behind the same protected ingress; configure equivalent limits when deploying
the Python API separately. Resolve real client IPs only from a trusted proxy.
Use current base-image patches, scan and pin their digests for production, and
verify database backups and restoration. See DEPLOYMENT_AUDIT.md for findings,
verification boundaries and the remaining production work.
