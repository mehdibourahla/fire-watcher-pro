# Navigation review — 9 September 2026

Scope: deployed nadhir.app and source at main `23d9951c1345d46f50bb3266c329dec494a0d119`. Read-only review; no application changes, messages, reports or account mutations. Browser ran signed out. Authenticated user/operator/admin navigation was inspected in source, not certified through signed-in browser sessions.

## Findings

| Priority | Finding | Evidence | Recommended correction |
| --- | --- | --- | --- |
| P2 | Requested destination is lost during authentication. Alerts, Settings, reporting and admin deep links all redirect to bare `/auth`; successful sign-in always goes to `/zones`. Reporting category query parameters are lost too. | Live mobile Alerts click and direct `/admin` both reached bare `/auth`. `src/routes/_authenticated/route.tsx:17,35`; `src/routes/auth.tsx:29,32`. Post-login result is source-confirmed, not tested with a real account. | Carry a validated same-origin internal return destination, including search, through authentication; restore it with replacement navigation after login. |
| P2 | Desktop has no navigable Alerts entry. The only route link is the bottom tab, which disappears at 1024px. The header bell opens subscription setup, not the alert feed. | Desktop header/footer link inventory lacks `/alerts`; `src/components/SiteChrome.tsx:44,58,265`. Source search found no other user-facing Alerts link. Settings is reachable indirectly through My zones. | Add consistent account navigation containing My zones, Alerts and Settings on desktop and mobile. |
| P2 | Survival entry Cancel can leave the application. | Fresh browser tab → `/survival` → Cancel reproduced `about:blank`. `src/routes/survival/index.tsx:395` calls unguarded `window.history.back()`. | Return to an internal origin when known, otherwise home; never depend solely on browser history for this action. |
| P2 | Authorized operational roles lack the main panel entry. | `src/components/SiteChrome.tsx:211–212` shows it only for `admin`, while `src/lib/admin-access.ts` permits operator, report_moderator, translator and incident_editor. Applies to desktop and mobile menu. Source-confirmed; no production roles were changed to reproduce. | Use `canReachPanel(roles)` for entry visibility, retaining per-section role restrictions. |

## Verified working

- Public link transitions to Forecast, History, Sources, About, Contribute, API and Privacy produced matching page headings and titles after navigation settled. Terms rendered correctly; browser Back returned to it.
- Mobile Menu opens and closes after choosing History/Forecast; bottom tabs are visible and the active Forecast tab has `aria-current="page"`.
- No document/header horizontal overflow on the tested signed-out page at widths 320, 390, 768, 1024, 1280 and 1440px. This does not certify authenticated admin-header sizing.
- Survival activation, SOS/check-in/open-area navigation, their return links, and confirmed Exit back to the map worked. No telephone or sharing action was invoked.
- Signed-out Alerts and admin access redirect to authentication. Unknown URL renders 404 with a Go home link.

## Limits

No signed-in role sessions, native iPhone testing, expired-session transitions, or exhaustive keyboard/screen-reader audit were performed. Arabic initial rendering and English switching were observed, but the full Arabic/French navigation matrix was not exercised. A Cloudflare analytics script is blocked by CSP; no tested navigation failure was attributable to it. Early URL-only samples returned the previous page heading while navigation was pending; checks were repeated after content settled, so this was not classified as a defect.

## Repairs and verification

All four findings are repaired on `codex/navigation-fixes`. Authentication uses an explicit protected-route allowlist, preserves search and fragment, and verifies existing sessions before automatic return. The outgoing authenticated layout stops verification once navigation leaves protected routes. Account dropdown and mobile menu share My zones, Alerts and Settings. Panel visibility uses existing role eligibility. Survival Cancel links home.

Local browser evidence at port 4197:
- Signed-out Alerts → login → Alerts, and report → login → `/report?kind=road_blocked#details` both passed with the local fixture account.
- A cached session with `/auth/v1/user` returning 403 stayed on login with `returnTo=/alerts`; it did not loop. Sign-out stayed on home after navigation settled.
- Account dropdown opens by keyboard, Escape closes it and restores trigger focus; Settings navigation passed. Widths 320, 390, 768, 1024 and 1440 had no horizontal overflow on the tested page.
- Local operator saw the panel link on desktop and mobile and could navigate to the panel. The temporary operator role was removed; signed-out navigation omitted the panel link.
- A fresh tab opening Survival then Cancel reached home, replacing the reproduced blank-page failure.

864 application tests, TypeScript, lint (zero errors; 65 existing warnings), and production build pass. Independent specification and quality reviews pass. No production account changes, notifications, reports, schema changes or deployment were performed. Native iPhone and the complete role/locale matrix remain outside this bounded verification.
