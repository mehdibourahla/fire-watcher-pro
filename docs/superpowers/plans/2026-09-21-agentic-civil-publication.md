# Agentic civil publication

User-approved direction: **Agentic >>> Deterministic**. Agents investigate and decide meaning; code enforces permissions, evidence integrity, execution budgets and delivery restrictions. No confidence-score cutoff substitutes for a publication decision. This supersedes mandatory operator review for every ITA incident in the previous civil-publication plan.

## Contract

Citizens see attributed media information with honest administrative precision and expiry. Operators see the decision, geographic evidence, uncertainty and investigation history, and can override publication through the existing audited form. Only material unresolved uncertainty needs human review. ITA remains ineligible for outbound alerts.

The agent searches the national administrative catalogue using Arabic/French hypotheses, can refine queries using parent areas, inspects recent publications to identify duplicate reports, and returns publish, hold, discard or review. Returned identifiers must have appeared in tool evidence. Knowledge can guide queries but cannot establish coordinates. Road sections may publish at a supported encompassing administrative area; this does not pretend to be a surveyed road geometry. Missing road geometry alone need not require review.

Immutable decisions include model/version, source extraction, tool results, reason, selected area, expiry and duplicate relationship. A service-only, source-job-fenced transaction applies decisions and publication atomically. Human publications and revisions take precedence. Failures retry with capped backoff until source expiry and remain visible in a paginated attention queue. Holds get a later investigation without consuming a failure budget. Infrastructure failures never become fabricated semantic decisions.

Automatic publication cannot supersede any previously published version of the same source post, including withdrawals. Operators can explicitly publish the newest corrected source, atomically withdrawing all earlier active publications and retaining their history. All source-post writers serialize on the same identity lock.

## Milestone implementation

1. Build a bounded tool-using decision agent and reusable administrative search tool. Test Arabic road-section investigation, unsupported IDs/quotes, duplicate decisions, uncertainty, and exhausted budgets.
2. Add private decision ledger and processing queue with lease fencing, audit actor distinction and atomic publication. Test anonymous/operator/service permissions, idempotency, stale jobs and operator precedence.
3. Wire ITA processing for new and existing extracted reports, preserving extraction retries and source health. Surface decisions and prefill review location/hazard in the operator UI.
4. Verify app, SQL, production build and independent spec/security review. Produce a reviewable PR; deployment waits for named merge approval.

## Subsequent integration

### Official-source reconciliation slice

Extend the existing investigation with a bounded tool for current, attributed DGPC incident evidence. The agent decides whether coverage is redundant, adds useful context, or conflicts; similarity of area/time alone never makes that decision. Exact source quotes and observed incident/mention identifiers ground each relationship. Redundant coverage can be discarded; useful additional information can still publish as ITA. Warnings and satellite detections are deliberately excluded from this incident-identity slice.

Persist the relationship in the private immutable decision ledger and show it in operator history. Citizens benefit from fewer redundant publications; public attribution, official incident state and notification eligibility remain unchanged. Recheck the official evidence at persistence so a changed/unlisted incident triggers retry rather than applying a stale comparison. An unavailable evidence tool is a retryable failure, not an empty successful search.

Validate unseen IDs, invented quotes, duplicate/publication contradictions, stale official mentions, transaction rollback, and provider failure. Run a real-model read-only comparison, full application/SQL checks, and independent specification then quality/database review before opening the next PR.

Evidence: 997 application tests and 989 SQL assertions pass, including v1-history compatibility, stale place/status rejection, useful context publication and zero broadcasts. The existing human/agent concurrency regression passes. Independent specification, quality and database reviews passed. A live Gemini probe initially misclassified repetition as context; the revised instructions require identifying the concrete added fact. The final read-only run preserved a real Tipaza road report, discarded a synthetic exact repeat of actual DGPC evidence, and retained a synthetic road-obstruction update as useful context. These three scenarios are limited semantic evidence, not a reliability-rate claim; no probe wrote to production.

The same evidence-first approach extends to DGPC interpretation, multi-source event reconciliation, weather relevance and recovery planning. Polygon/road-provider evidence is required before precise point/corridor rendering. This milestone uses existing honest administrative-area rendering; it does not invent geometry or reclassify ITA as an official warning. Existing official channel restrictions, kill switches and safety-instruction policy remain mandatory execution constraints.

## Verification evidence

- Real Gemini probe against the existing Tipaza source and production administrative catalogue: proposed publication in Tipaza wilaya after finding Fouka and Douaouda under that parent; no production writes. It is a retrospective replay with existing publication context excluded, not a live deployment.
- Regression tests cover offset timestamps, normalized whitespace, observed parent identifiers, invalid evidence, bounded investigation, provider failures and persistence rejection. Unit model responses test orchestration; the real-model probe separately tests semantic behavior.
- SQL exercises role boundaries, atomic publication, immutable history, hold/retry recovery, source correction, withdrawal precedence and manual reconciliation. Two-session human/agent race fails against the original manual writer and passes with the shared identity lock.
- Local browser: disposable operator signs in, sees both prior decisions, opens the prefilled area/hazard/summary, is blocked without a reason, then publishes successfully with a persisted human audit entry and zero broadcasts.
- Public-map browser check: attributed-media notice, AI/human-review disclosure, expiry, and explicit area-centre precision all visible. Disposable local records removed afterward.
- Final local checks: 989 application tests, 966 SQL assertions, concurrency regression, TypeScript and production build pass. Lint: zero errors, 66 existing warnings. Independent specification, quality and database reviews passed; this evidence does not establish production deployment.
