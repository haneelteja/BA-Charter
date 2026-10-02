# BA Charter — Execution Plan

Companion to `docs/BACKLOG.md`. This document sequences the epics, states the
architecture decisions the sequencing depends on, and lists every gap found
while reading the requirements that needs a decision before — or shortly
after — the phase that touches it starts.

---

## 1. Phase sequencing

Phases are dependency order, not fixed-length sprints — a phase starts once its
inputs exist, and phases 3–6 have real parallel work once their shared
prerequisites (Phase 0–2) land.

| Phase | Epics | Why this order |
|---|---|---|
| **0 — Foundations** | EPIC 0, EPIC 1 | Nothing is project-scoped or persisted without this. |
| **1 — Domain spine** | EPIC 2 (Charter), EPIC 3 (Capture), EPIC 15 (Email) | Charter is the write-target every case type targets. Capture is the only way content enters. Email is simple and needed by Phase 2 — build it early so Phase 2 isn't blocked on it. |
| **2 — Core workflow** | EPIC 4 (Extraction), EPIC 5 (Meeting Ingestion) | The primary, most-frequent case type. Everything else either spawns from it (Action Item, Clarification) or consumes its output (Epic Definition, Story Authoring). |
| **3 — Spawned cases** | EPIC 6 (Action Item), EPIC 7 (Clarification Item) | Directly spawned by EPIC 5's Commit stage. Can build in parallel with each other. |
| **4 — Authoring prerequisites** | EPIC 9 (Guardrails), EPIC 10 (Retrieval) | Needed by Story Authoring's Check stage and by Change Request Analysis. Can run in parallel with Phase 3 — no shared dependency. |
| **5 — Delivery authoring** | EPIC 8 (Epic Definition), EPIC 11 (User Story Authoring) | Consume confirmed decisions from the charter (Phase 1) and the engines from Phase 4. |
| **6 — External publish** | EPIC 14 (Agile Studio) | Required by EPIC 8 and EPIC 11's Publish steps, and by EPIC 12's Propagate step. Start this *in parallel with Phase 4/5*, stub it until a real Agile Studio instance is available (Open Question E) so Phase 5 isn't blocked end-to-end. |
| **7 — Change impact** | EPIC 12 (Change Request Analysis) | The most dependency-heavy case type — needs charter, trace links, retrieval, guardrail reuse, and published stories to exist first. |
| **8 — Cross-cutting workspace** | EPIC 13 | A set of views over data produced by Phases 3, 5, 7. Build last, but sketch its query shape during Phase 0 so earlier tables carry the owner/status columns it needs. |
| **9 — Hardening & launch** | EPIC 16 (close-out pass), EPIC 17 (Retention) | EPIC 16's checklist runs continuously per-epic, not just here — this phase is the final audit that nothing was skipped. |

```
Phase 0 ──► Phase 1 ──► Phase 2 ──┬──► Phase 3 ──┐
                                   │              ├──► Phase 8 ──► Phase 9
                                   └──► Phase 4 ──► Phase 5 ──► Phase 7 ──┘
                                                       ▲
                                        Phase 6 ───────┘ (parallel, stubbed early)
```

---

## 2. Architecture decisions this plan assumes

These aren't open questions — they're the defaults the sequencing above is
built on. Flagging them so you can object before Phase 0 starts.

1. **Stack stays Next.js (App Router) + Supabase** (Postgres, Auth, Storage,
   pgvector), continuing what's already in the repo — no reason to switch
   given the standalone decision.
2. **Schema**: adopt `ba-workbench-schema.sql` close to as-written. Translate
   `VARCHAR(36)` → `uuid`, add `pgvector` columns where EPIC 10 needs them,
   add RLS policies per project membership. The schema in the requirements is
   already normalized and matches the data-object list in §5 — no redesign
   needed, just a dialect translation.
3. **Case-type-as-state-machine**: every Pega "case type" becomes a row with a
   `status` enum (already present in the schema: `decision.status`,
   `action_item.status`, etc.) plus server-side guards that enforce legal
   transitions — there is no generic workflow engine; each case type's
   transition logic is written directly.
4. **Background jobs**: a Postgres-backed job queue (table + polling worker),
   not a third-party workflow product, given this is explicitly meant to stay
   a standalone, self-contained app. Used for: extraction (EPIC 4),
   embeddings (EPIC 10), SLA/ageing sweeps (EPIC 5/6/7), acknowledgement-window
   promotion (EPIC 5), retention purge (EPIC 17).
5. **Agile Studio integration (EPIC 14) reuses the deleted `src/lib/pega/*`
   OAuth2 client-credentials pattern** from earlier in this project — that
   code solved exactly this problem (server-side REST calls against Pega
   Infinity) before being removed for the unrelated case-types/case-view
   prototype. Resurrecting it is low-risk.

---

## 3. Open questions — need your decision

Grouped by the phase they block. Phase 0–1 items are hard blockers; later ones
can be decided while earlier phases are in progress.

### A. Background job infrastructure (blocks Phase 0)
Options: (a) a simple Postgres table + a long-running Node worker process
you host yourself, (b) a managed queue (e.g. Inngest, Trigger.dev), (c)
Supabase Edge Functions + `pg_cron` for the scheduled parts (SLA sweeps,
retention) plus a separate worker for the heavier extraction jobs. This
affects hosting cost and ops complexity more than application code — pick
based on how much infra you want to run yourself.

### B. Inbound connectors (blocks Phase 1, partially)
The requirements list meeting-platform, note-taking, and mailbox connectors
as inbound sources, but manual upload is always available and is explicitly
the only path specified in enough detail to build without more input. **Do
you want any live connector (Zoom/Teams/Google Meet transcripts, Gmail/Outlook
mailbox) in the v1 scope, or is manual upload the whole of Phase 1 Capture for
now?** Each connector is effectively its own integration project (OAuth,
webhook or polling, provider-specific transcript formats).

### C. LLM provider for extraction/retrieval/analysis (blocks Phase 2)
Needed for: candidate extraction, minutes generation, guardrail evaluation,
duplicate detection, change-impact analysis, and the embedding model for
retrieval. One provider can likely cover all of these. No default has been
chosen yet.

### D. Confidence thresholds (blocks Phase 2)
The requirements say "high confidence items are pre-accepted" and "low
confidence and contradicting items require explicit decision" (§3.2) but
never state the numeric cutoff. Needs a starting value (e.g. 0.8) that can be
tuned per project later — the schema already supports per-row
`confidence_score`, so this is a config value, not a schema change.

### E. Agile Studio instance (blocks Phase 6, not earlier)
EPIC 14 needs real Pega Infinity + Agile Studio OAuth client credentials to
integrate against. Until available, Phase 6 ships against a stub so EPIC 8/11
Publish steps aren't blocked. **Is there an existing Infinity instance to
target, or does this get provisioned later?**

### F. Email provider (blocks Phase 1, low risk)
Needs a transactional email provider (e.g. Resend, SendGrid, SES) for minutes
distribution, clarification requests, and change notifications. Any mainstream
provider works — flagging only because a choice has to be made, not because
it's architecturally significant.

### G. Retention/purge semantics (blocks Phase 9, low urgency)
"Purgeable on request" (§7 Security) — does purge mean hard delete of the
`interaction`/`utterance` rows, or anonymisation (strip content, keep
structural rows so trace links and audit history don't dangle)? Affects
EPIC 17's design, not anything earlier.

### H. Authentication model (blocks Phase 0)
Supabase Auth email/password or magic-link is the default assumption for
internal users (Business Analyst, Lead BA, Delivery Team Member, Project
Administrator). Client-side stakeholders explicitly never log in (§1 "Out of
scope for release one") — they're `stakeholder` rows contacted only by email,
which matches the schema (`stakeholder` has no auth linkage). **Confirming
this reading is correct before Phase 0 builds the auth/role layer against it.**

---

## 4. What's deliberately not re-litigated here

- The requirements' business rules (§8) and NFRs (§7) are treated as
  authoritative and are cited directly in `BACKLOG.md` story acceptance
  criteria — no reinterpretation.
- The four-layer charter structure (§3.8) is adopted exactly as specified.
- Ownership boundary with Agile Studio (§8 rules 6–7: status/sprint/points are
  Agile-Studio-owned; description/acceptance-criteria/business-context are
  platform-owned) is treated as a hard integration contract, not a
  suggestion — EPIC 14 enforces it in code.
