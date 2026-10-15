# Google and JWT verification

V7, 2026-10-15. Google and email sign-in both create **NeuroSense** JWT sessions.
A Google ID token is an input to the login endpoint, never an application bearer.

## Automated evidence

`backend/tests/test_auth_workflow.py` exercises the actual Google Python verifier.
Tests generate temporary RSA keys, sign identity tokens, and substitute only the
certificate HTTP transport. The library still verifies signature, audience,
issuer and expiry. Invalid signatures, another app's audience, expired credentials
and unverified email claims are rejected. A verified Google subject remains the
account identity after its email changes.

Existing password accounts are not linked by email matching. The authenticated
`POST /api/auth/google/link` requires the current password and a verified Google
identity with the same email. After linking, both password and Google sign-in
reach the same workspace. Responses expose enabled methods, never the password,
Google subject, refresh value or session-version secret.

JWT checks reject forged signatures, wrong issuer/audience, expiry, absent required
claims, refresh tokens used as access tokens and invalidated account versions.
API workflow tests register an account, save onboarding preferences, open a chat,
verify a session, rotate cookies, reject replay and revoke access on logout.
Cross-origin cookie mutation requests are rejected. Logout can revoke the refresh
cookie even if the access token has expired.

Frontend checks cover single-flight rotation, rejected-cookie logout, temporary
server errors, cookie recovery after reload, stale response cancellation, immediate
UI cleanup, safe return destinations and distinct public/home routing. Access
JWTs stay in memory. Persistent storage contains a non-credential account marker;
refresh credentials remain in a scoped HttpOnly cookie. Browser Web Locks serialize
rotations across tabs where supported. Older browsers without Web Locks can require
sign-in again after simultaneous refresh attempts in separate tabs.

## Run locally

Follow RUN_WORKSPACE.md, then:

1. Register and sign in. Complete `/setup`; confirm the chosen memory policy in
   Settings. Visit `/home`, type a draft, select a project and open its conversation.
2. Open `/security`. Verify this session calls `GET /api/auth/session`, protected
   by the same signature, claim, account and revocation checks as other API routes.
   It reports the server check time, method, audience, issuer and access expiry.
3. Choose Rotate & verify. The HttpOnly cookie rotates and its previous value
   becomes unusable. Reload the tab; the account should recover through the cookie.
4. Sign out everywhere. Existing access JWTs and refresh sessions must fail.

## Complete live Google verification

This cannot be substituted with a fabricated client ID or mock success screen.
Deploy the Python API and MongoDB, set a private SECRET_KEY, DEBUG=false and the
exact FRONTEND_URL. Prefer one HTTPS origin for frontend/API. Cross-site hosting
needs SameSite=None + Secure refresh cookies and a browser that accepts them.

Create a Google **web** OAuth client in the user's Google Cloud project. Add the
actual frontend origin under authorized JavaScript origins, configure the consent
screen/test users as required, and set GOOGLE_CLIENT_ID on the server. No Google
client secret is required by this GIS ID-token flow. The frontend reads the public
client ID from `/api/auth/config`; do not put server secrets into Vite variables.

Then perform these manual checks with a real Google account:

- Official Google button → provider consent → Python verification → `/setup` or
  requested workspace page → `/security` reports Google and an active refresh cookie.
- Reload, rotate and verify, sign out, and confirm the old bearer fails.
- For an existing email account, Google login must ask for the existing method.
  Sign in with password, explicitly link Google in `/security`, then verify both
  methods reach the same account and saved context.
- A client ID for another origin/app must fail. Check production CORS and the
  browser cookie policy using the actual deployed origins.

At implementation time, the hosted frontend has no deployed API URL or Google
client ID. The public tour works; real hosted login and provider availability are
**not verified**. Automated cryptographic tests are not a completed live OAuth test.
The app also needs operational rate limiting, deployment monitoring, dependency
security review and capacity testing before a public production launch.

Primary implementation references:
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://datatracker.ietf.org/doc/html/rfc8725
