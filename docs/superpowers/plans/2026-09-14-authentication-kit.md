# Authentication Kit Implementation Plan

> Execute with the subagent-driven-development workflow, using disjoint file ownership and independent security review.

**Goal:** Complete identity, Google and email authentication, verification and password recovery.

**Architecture:** Keep Supabase cookie sessions and the existing `/auth` route. Separate account chrome from authentication forms and recovery state. Settings uses the same recovery entry point.

**Tech Stack:** React, TanStack Start, Supabase SSR, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-authentication-design.md`

## Constraints

Public maps and Survival remain available. No tokens in logs or return destinations. Role checks stay server-enforced. Preserve current private-route validation. New passwords require eight characters; existing six-character passwords can sign in. English, French and Arabic copy; existing Kabyle key parity. Controls at least 44px and inputs 16px.

## Tasks

- [x] Account chrome: update `SiteChrome.tsx`, add `AccountMenu.tsx` and verify anonymous, pending, authenticated, role and sign-out states.
- [x] Auth forms: replace `auth.tsx` with full flow UI; add `components/auth` and `auth-flow.ts`. Inspect SDK callback producer, write failing transition tests, implement and run them. Reject forged recovery state and unsafe return paths.
- [x] Settings: add an account/security section showing verified email and actual identities with a password recovery link. Handle sign-out failure without claiming success.
- [x] Localization: provide all new strings in locale modules and run translation parity tests.
- [ ] Provider configuration: inspect Google console and Supabase settings; configure only with real credentials and verify readiness. Validate email sender before claiming delivery.
- [x] Behavioral QA: run local Supabase sign-in, signup, verification, recovery, replay/expired links, OAuth failure and identity/logout. Inspect 390px and desktop layouts in French and Arabic.
- [ ] Closure: typecheck, tests, lint, production build, applicable database CI and independent spec then quality/security review; fix findings, commit and open a PR. Merge requires user approval.

## Verification outcome

879 application tests and TypeScript passed; ESLint has zero errors (65 existing warnings). Spec and security/quality reviews passed after fixes. The final production build passed. Local database tests hit a source_runs foreign-key dependency in the reused QA database; fresh-database CI passed on PR #132, alongside application checks and CodeQL.

Google branding was created by the owner. OAuth client configuration is prepared and awaits credential-creation approval. Resend is signed in and nadhir.app was added; its DKIM and send-subdomain SPF/MX records still need publishing. Cloudflare requires sign-in. Resend's sending-only key selector currently offers only the existing verified domain, so the Nadhir key must wait for verification. No production Supabase Auth settings have been changed. PR #132 remains draft until provider setup and live validation are complete.
