# Admin console revamp

Date: 2026-09-24. Owner decisions taken under Mehdi's "full ownership" mandate. Builds on
`2026-09-04-admin-panel-design.md`; its authority rule stands: every admin write is a
`security definer` function that checks the role and calls `record_admin_audit` in the same
transaction.

## Problems (inventory of de7d64b)

1. **Work is filed by data source, not by job.** The ITA editorial queue lives inside Sources, 3rd of 9 blocks; source health is 8th. Citizen reports, ideas and translations share one tab strip without counts.
2. **Triage doesn't lead anywhere.** Its rows aren't links. It merges citizen reports and translations into one number, and it never mentions ITA review, operational incidents, gaps or delivery backlog.
3. **Views are too thin to decide from.** Fires have no place or level. Incidents have no location. Source health has no reason code. Audit has no actor name and no target.
4. **Global and destructive actions are single clicks** (kill switch, pauses, incident status, fire resolution, gap replay), and some skip a reason the RPC accepts. Two writes bypass the audit entirely: the authority warning relay and citizen report moderation. So does one RLS policy: "operators resolve fires".
5. **Nothing is shared.** No page header, table, status badge, confirm dialog or loading and error convention; the shadcn kit is installed but unused. Raw enums and UUIDs show throughout, and Arabic and Kabyle are mixed with English.

## Decisions

### Information architecture

A sidebar organised by job, filtered by role. Every queue entry shows a live count.

| Group | Entry | Route | Roles |
|---|---|---|---|
| — | Overview | `/admin` | all panel roles |
| Review | ITA publications | `/admin/ita` | operator, admin |
| | Citizen reports | `/admin/reports` | report_moderator, admin |
| | Fires | `/admin/fires` | operator, admin |
| | Translations | `/admin/translations` | translator, admin |
| | Ideas | `/admin/ideas` | report_moderator, admin |
| Operations | Sources | `/admin/sources` | operator, admin |
| | Broadcasts | `/admin/broadcasts` | admin |
| | Risk | `/admin/risk` | operator, admin |
| Reference | DGPC incidents | `/admin/incidents` | incident_editor, operator, admin |
| | Places | `/admin/places` | operator, admin |
| Admin | People | `/admin/people` | admin |
| | Audit | `/admin/audit` | all panel roles |
| | Tools | `/admin/tools` | admin |

`/admin/queues` is deleted: its three tabs become three routes, so each gets a count in the nav. Operators no longer see Broadcasts, which the page refused them anyway.

### Counts

- One RPC, `admin_attention_counts()` (security definer, role-aware), returns one row per work item with its count and the age of its oldest item. The rows are: ITA review, ITA failed, citizen reports pending, fires awaiting, translation keys pending, ideas pending, open operational incidents, open gaps, sources unhealthy, and delivery backlog.
- It returns only the items the caller's roles can act on. The sidebar and Overview both read it, refetching every 30 s.

### Overview (replaces Triage)

- **Top line:** a system verdict — broadcasting on or off, and how many sources are unhealthy — each linking to its page.
- **Below:** "Needs action", one row per non-empty work item with its count and oldest age, each linking to the queue. When everything is empty, "Nothing needs action".

### Review pages

- **List + detail split** on desktop; the detail opens in a full-height Sheet on mobile. Every decision takes one reason field where the RPC accepts one.
- **ITA:** three tabs.
  - *Needs decision* (review and failed): the detail shows the post, the agent's reasoning and what it searched, a searchable area picker instead of a 1,605-option select, a default expiry at the lease, and Publish / Discard.
  - *Publications* (live, expired, withdrawn): revise or withdraw.
  - *Feed*: the last ITA reports with their agent state, and extraction retry. Raw JSON only behind a "Technical details" disclosure.
- **Fires:** each fire shows commune and wilaya, fire level, state, detections, confidence, and a map link. Filters by level and state. Resolution happens in the detail: "Not a fire" asks for a reason; "Ended" asks for confirmation.
- **Citizen reports:** moderated through the new audited RPC. The fire link lists nearby fires first.
- **Translations:** grouped by key, filtered by locale.

### Operations

- **Sources:**
  - A health verdict plus one table: source, state badge, age against its thresholds, reason code, and last success or attempt. Pause and resume need a reason and a confirmation.
  - Open operational incidents first, resolved ones behind a "Resolved" toggle.
  - Gaps with replay (reason plus confirmation).
  - The ITA, text recovery, archive, push-test and ensemble blocks move out.
- **Broadcasts:** the kill switch sits behind a confirm dialog that requires a reason. It also holds the relay form (in a dialog, now through the audited RPC) and the audit table with readable actors. Delivery channels stay on Sources: operators may pause a channel and Broadcasts is admin-only, so moving them would remove an operator capability.
- **Risk:** status badges, loading and error states, a reason per discard.

### Reference and Admin

- **DGPC incidents:** location, a readable authority label, evidence, and the source link. Status changes happen in a dialog with a reason.
- **Places:** search, pagination and wilaya.
- **People:**
  - A table: member, roles as badges, last seen, zones.
  - Role changes happen in a detail Sheet with checkboxes and one confirm step, with extra friction for granting admin.
  - No more five one-click "Make …" buttons per row.
- **Audit:** readable action labels, actor name or job, target link, and filters by domain and by person vs system.
- **Tools** (admin only): source archive (with an HTTP status filter), text recovery, push self-test, ensemble preview.

### Shared kit (`src/components/admin/kit/`)

`PageHeader`, `StatusBadge`, `ConfirmDialog` (optional required reason), `QueryState` (loading, error and empty in one place), `SplitView`, and `formatWhen` (app locale, relative time with an absolute tooltip). Built on the installed shadcn primitives: sidebar, table, badge, tabs, alert-dialog, sheet, command, skeleton.

### Security fixes (first)

- `relay_authority_warning(...)` replaces the direct insert. The insert policy and grant are revoked.
- `moderate_citizen_report(_id, _status, _note, _cluster)` replaces the direct update. The update policy is revoked, and `reviewed_by` is set server-side.
- The "operators resolve fires" update policy is dropped. `resolve_fire` is the only path.

### Language

The admin ships complete in en, fr and ar. The Kabyle admin bundle is merged over the French one, the same way the weather namespace already borrows French. Kabyle strings win where they exist, and a Kabyle operator never sees English. New keys are written in all three languages. Dates use the app locale.

### Out of scope

- Aliases and settlements editing (`admin_unit_aliases` UI).
- Revoking `service_role` from ingest.
- Screening registry UI.
- Snapshot diff for risk.
