# Security policy

Nadhir publishes wildfire information for Algeria. A vulnerability here can mislead people
about a physical danger, so please report privately first and give us a chance to fix it.

## Reporting a vulnerability

Use GitHub's private reporting: **Security → Advisories → Report a vulnerability** on this
repository. That opens a private thread visible only to the maintainers.

Please do not open a public issue, and do not post proof-of-concept details publicly, until a
fix is released.

Include what you did, what you observed, and why it matters. A short reproduction beats a
scanner export.

Expect a first reply within about a week. This is a small project, not a funded team.

## In scope

- Anything that lets one user read or modify another user's data — watch zones are effectively
  home locations and profiles hold phone numbers, so cross-tenant access is the most serious
  class of bug here.
- Authentication or authorisation bypass, including privilege escalation to `moderator` or
  `admin`.
- Anything that lets an unauthenticated caller write to the database or trigger the ingestion
  or alerting endpoints.
- Injection, SSRF, or remote code execution in the app or its workers.
- Exposure of server-side credentials. The Supabase **publishable** key is public by design and
  is not a vulnerability; the **service role** key, `NADHIR_CRON_SECRET`, and the FIRMS and
  EUMETSAT credentials are not.
- Anything that would let someone publish a false fire or a false all-clear.

## Known and already documented

These are tracked in [GAPS.md](GAPS.md) and are not new findings:

- Citizen report uploads have no EXIF stripping, captcha, or antivirus scan.
- Sign-up has no captcha, and the auth API accepts a 6-character password while the UI asks
  for 8.
- Any authenticated user can read the `user_roles` table, which reveals who the moderators and
  admins are.

Reports that restate these are welcome only if you have a concrete exploit that goes further
than the description there.

## Out of scope

- Missing hardening headers with no demonstrated impact.
- Rate-limiting or denial of service against public read endpoints.
- Findings from automated scanners with no working proof.
- Social engineering, physical attacks, or anything requiring a compromised maintainer device.
- Reports that Nadhir's danger ratings are wrong. That is a known calibration problem, not a
  security issue — see GAPS.md §1.1.

## A note on the data

Nadhir is not an official source and is not a government warning system. Detections come from
satellites with real false-positive and latency characteristics. Treat the data accordingly.
