# Remaining priorities — single-run execution

Approved scope: the user's 2026-09-08 request to handle all five remaining priorities.
Reliability design: `../specs/2026-08-31-data-reliability-control-plane-design.md`.

- [ ] Verify live DGPC receipt evidence, FCM and signup delivery. Private test targets and
  provider credentials are owner inputs; never send synthetic subscriber alerts.
- [x] Delivery operations: independent channel queues with leases, bounded retries and
  expiry; per-destination receipts survive retries; paused queues cannot send. Persist
  deduplicated operational incidents, acknowledgement and audited controls. Test database
  permissions, duplicate claims, stale tokens, retry/expiry and cross-channel failures.
- [x] Refresh eight dependency PR intents on current main, including lockfile and caller
  compatibility. Run frozen install, types, all tests, lint, build and workflow validation.
- [x] Zone lifecycle: test growth baselines and 45-minute throttling; observation-ended
  notifications only for previously alerted zones, never an all-clear declaration.
- [x] Recover PR31's useful intent: verified-source assessment and a rate-limited operator
  ensemble preview, without changing fire/risk decisions. Record unavailable credentials
  and unvalidated raster/perimeter products rather than inventing their data.
- [ ] Email/SMS: inspect existing accounts/settings, implement only against a named provider
  with an actual recipient/subscription contract. Provider choice and private receipts remain
  explicit owner inputs if unavailable.
- [ ] Integrate isolated branches, run CI-derived gates, review security/schema and browser
  behavior, open concrete release PRs. Merge approvals remain per named PR.

## Evidence and remaining inputs

Local integrated verification: 703 application tests and 551 SQL assertions pass;
TypeScript, production build, workflow validation and lint pass (66 warnings).
Independent specification and quality reviews pass. A two-session test holds both
channel rows before completing them concurrently; both commit and fixtures are removed.
It passed before and after restricting enqueueing to insert events; no deadlock was
reproduced. CI now requires this concurrency check in addition to pgTAP.
Browser journeys on the local database verified authenticated pause/resume, incident
acknowledgement, actual 40-member ensemble output, and History chart rendering/filtering.
The browser exposed missing operator access to the source replay list; column-level
SELECT plus operator/admin RLS fixes it without exposing raw run identifiers.

Production #121 has deployed. The live delivery worker continued succeeding, but zero
destination receipts were recorded at the live check. Private Telegram chat, email and
subscribed device details have been requested; no synthetic public alert was sent.
No email/SMS provider was named and no provider credentials were found locally. Provider
selection and receipt verification are still required; no sender is presented as working.

Queues expire after 24 hours and stop after eight failed attempts. Budget-only continuation
does not consume a retry. A 15-minute unpaused backlog opens an incident; acknowledgement
does not resolve it. Pausing blocks new sends, while an already accepted request may finish.
Destination receipts cannot prevent duplicates after a provider accepts a send but its
response or the receipt write is lost. Production failure drills remain a rollout step.
