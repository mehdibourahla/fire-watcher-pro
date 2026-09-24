# Admin console revamp — plan

Spec: `docs/superpowers/specs/2026-09-24-admin-console-revamp.md`. Branch `admin-revamp`, one commit per phase.

**Gates after each phase:**

- `bunx tsc --noEmit`
- `bun run test`
- `bun run lint`
- `supabase test db` on the isolated stack (`scratchpad/dbtest.sh`, W=wt-audit), plus the CI concurrency scripts when SQL changes

Browser check against the local dev server and the isolated Supabase stack, seeded with an admin user.

## Phases

- [x] **P0 Security.**
  - `relay_authority_warning` and `moderate_citizen_report` RPCs with `record_admin_audit`.
  - Revoke the insert and update policies they replace.
  - Drop the "operators resolve fires" policy.
  - `admin_attention_counts()` RPC.
  - pgTAP first.
- [x] **P1 Kit + shell.**
  - `components/admin/kit/*` (PageHeader, StatusBadge, ConfirmDialog, QueryState, SplitView, formatWhen).
  - Shell on the shadcn Sidebar with groups, role filtering and counts.
  - New section config.
  - The Kabyle admin bundle merges over the French one.
- [x] **P2 Overview.** It replaces Triage, reads `admin_attention_counts`, and every row links to its queue.
- [x] **P3 ITA route.** Needs decision / Publications / Feed, an area combobox, and removal from Sources.
- [x] **P4 Queues split.** `/admin/reports` (new RPC), `/admin/translations` (grouped by key), `/admin/ideas`. Delete `/admin/queues`.
- [x] **P5 Fires.** Place, level, map link, filters, and resolution in the detail with a reason or a confirmation.
- [x] **P6 Sources + Tools.** Health table with reason and age, incidents open-first, gaps. Tools page for archive (status filter), text recovery, push test and ensemble.
- [x] **P7 Broadcasts.** Kill switch behind a confirm plus reason, delivery channels moved in, relay dialog through the RPC, readable audit.
- [x] **P8 Risk, DGPC incidents, Places.** States, reasons, location, search, pagination.
- [x] **P9 People + Audit.** Member table plus role Sheet with confirmation. Audit with labels, actor names, targets and filters.
- [ ] **P10 i18n + polish.**
  - Complete ar and fr for every admin key.
  - RTL pass.
  - Mobile pass.
  - Remove dead keys and components (grep proof).
