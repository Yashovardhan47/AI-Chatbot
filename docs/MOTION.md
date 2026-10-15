# Typography and motion

The interface uses self-hosted Sora variable headings and Inter variable body
text. Vite packages Latin and extended Latin WOFF2 files from the Fontsource
dependencies. The font licenses are included in `frontend/public/font-licenses.txt`.
There is no runtime Google Fonts request.

The sliders control in public navigation, account forms and the workspace
topbar selects Expressive, Subtle or Off. The choice is stored locally and
synchronizes across tabs. An active `prefers-reduced-motion` device preference
always forces effective motion off, without overwriting the saved choice.

| Area | Behavior |
| --- | --- |
| Public overview, tour, account pages | Word-staggered display headings; tour-panel and walkthrough entrances. |
| All protected routes | Content fade, semantic title update and heading focus after navigation. The persistent application shell stays mounted. |
| Home, memory, knowledge, continuity, projects, workflows and review | One-time viewport entrances for designated cards and panels. |
| Pointer-capable devices | Gentle perspective feedback on selected summary surfaces, capped at 1.4 degrees per axis. |
| Search, dialogs and motion preferences | Short entrance transition with visible keyboard focus. |
| Chat | One entrance per mounted message; streamed tokens do not restart the entrance or pulse the answer text. |
| Buttons, navigation and forms | Press, hover and focus feedback; no looping body-text effects. |

Expressive mode uses mostly 180–650 ms transitions. Subtle removes heading
stagger, surface tilt and decorative orbit loops; it retains brief fades and
feedback. Off and device reduced motion disable CSS animations/transitions and
JavaScript entrances. Controls and status text remain available.

The motion director observes route content without remounting it. It skips
stream-only mutations, cancels animations and observers on cleanup, avoids
transforming page roots that contain fixed dialogs, and leaves content visible
when animation APIs are unavailable. It never makes an AI or authentication
request. Original heading text and emphasis remain actual DOM text.

Automated checks cover persistence, blocked storage, cross-tab changes, device
overrides, Escape/outside dismissal, focus restoration, exact copyable text,
route focus, shell draft preservation, one-shot entrances, stream stability,
cleanup and fallback without animation APIs. Recovery forms also exercise real
API boundaries through mocks, including failures and actual route tokens.

Responsive CSS is provided, but a browser-control skill is unavailable in this
environment. Visual animation smoothness, screenshots and full browser
end-to-end behavior still need browser QA; a passing jsdom suite is not a
substitute for those checks. No live Google sign-in verification is added by
this frontend update.
