# Civil publication and operational readiness

Approved scope: roadmap milestones 1–3. Extend the existing platform, keeping official authority and delivery eligibility separate from public information.

## Outcomes

1. Execute isolated source/delivery failure drills against the real local database and inspect production health read-only. Record exact evidence, unresolved gaps and existing owner-confirmed receipts. Production fault injection requires the owner's pending choice of source/window; no synthetic public sends.
2. Introduce an audited multi-hazard publication lifecycle for reviewed civil information: publish, update, expire and withdraw. Fire, weather, flooding, road and other hazards share provenance, explicit area precision, timestamps and revision history. No changes to automatic emergency thresholds or the DGPC-only Telegram policy.
3. Operators can review individual ITA extraction items, choose a supported administrative area, edit a public summary and validity, publish and later revise/withdraw. Public map and API expose only reviewed publication fields, never raw posts, extraction errors or operator reasons.

## Domain and boundaries

A Civil Publication is attributed information reviewed by an operator. Publication does not make the publisher an authority, confirm the incident, establish an all-clear or authorize instructions. ITA remains a media source. Public display must distinguish expired validity from an authority-declared end. Withdrawal removes the record from active maps but preserves an honest public lifecycle tombstone and private audit.

The existing fire/ONM/official producers and delivery queues remain operational. Generic civil CAP support must express the actual hazard category, revision references and cancellation instead of labelling every record Fire. Public CAP availability is not permission to send it to every channel. New ITA publications are map/API information; notification eligibility is not expanded implicitly.

## Persistence contract

`civil_publications` holds reviewed safe fields: id, ita_report_id, incident_index, hazard (`fire|weather|flood|road|other`), summary, area_id, source_name/source_url/source_published_at, expires_at, state (`published|withdrawn`), revision, published_at, updated_at. Area coordinates are administrative centres labelled as such. Unique report/item prevents duplicate publish; newer source versions remain separate evidence requiring explicit review. No raw input on public rows.

`civil_publication_revisions` is append-only operator-visible audit with actor/reason and prior/new safe payload. All mutations use role-checked transactional RPCs, optimistic expected revision, and row locks. Ordinary users cannot publish, edit, read operator reasons or bypass RPCs. Expiry derives from expires_at at read time, so scheduler failure cannot leave stale active publications.

Public access returns published and withdrawn reviewed records with explicit lifecycle; the live map defaults to published/unexpired only. A deep-linked withdrawn/expired record remains accessible as historical information without a current hazard marker.

## Verification

Test unauthorized roles, duplicate commands, stale revisions, immutable provenance, malformed areas/expiry, terminal withdrawal, update references, current versus expired filtering, raw-data isolation, and media-vs-authority labels. Exercise operator publication and public viewing through the browser. Use database, specification, quality and adversarial reviews before release. Reconcile roadmap/GAPS with actual shipped work and mark unavailable production evidence honestly.
