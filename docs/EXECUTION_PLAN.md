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

| Phase | Epics | Status | Why this order |
|---|---|---|---|
| **0 — Foundations** | EPIC 0, EPIC 1 | ✅ Done | Nothing is project-scoped or persisted without this. |
| **1 — Domain spine** | EPIC 2 (Charter), EPIC 3 (Capture), EPIC 15 (Email) | ✅ Done | Charter is the write-target every case type targets. Capture is the only way content enters. Email is simple and needed by Phase 2 — build it early so Phase 2 isn't blocked on it. |
| **2 — Core workflow** | EPIC 4 (Extraction), EPIC 5 (Meeting Ingestion) | ✅ Done, live-tested | The primary, most-frequent case type. Everything else either spawns from it (Action Item, Clarification) or consumes its output (Epic Definition, Story Authoring). |
| **3 — Spawned cases** | EPIC 6 (Action Item), EPIC 7 (Clarification Item) | ⬜ Not started | Directly spawned by EPIC 5's Commit stage. Can build in parallel with each other. |
| **4 — Authoring prerequisites** | EPIC 9 (Guardrails), EPIC 10 (Retrieval) | ⬜ Not started | Needed by Story Authoring's Check stage and by Change Request Analysis. Can run in parallel with Phase 3 — no shared dependency. |
| **5 — Delivery authoring** | EPIC 8 (Epic Definition), EPIC 11 (User Story Authoring) | ⬜ Not started | Consume confirmed decisions from the charter (Phase 1) and the engines from Phase 4. |
| **6 — External publish** | EPIC 14 (Agile Studio) | ⬜ Not started | Required by EPIC 8 and EPIC 11's Publish steps, and by EPIC 12's Propagate step. Start this *in parallel with Phase 4/5*, built against a stub (§3.E) since no real Agile Studio instance exists yet, so Phase 5 isn't blocked end-to-end. |
| **7 — Change impact** | EPIC 12 (Change Request Analysis) | ⬜ Not started | The most dependency-heavy case type — needs charter, trace links, retrieval, guardrail reuse, and published stories to exist first. |
| **8 — Cross-cutting workspace** | EPIC 13 | ⬜ Not started | A set of views over data produced by Phases 3, 5, 7. Build last, but sketch its query shape during Phase 0 so earlier tables carry the owner/status columns it needs. |
| **9 — Hardening & launch** | EPIC 16 (close-out pass), EPIC 17 (Retention) | ⬜ Not started (partial: audit logging has run since Phase 0) | EPIC 16's checklist runs continuously per-epic, not just here — this phase is the final audit that nothing was skipped. |

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

## 3. Resolved decisions

All gaps identified during planning have been decided. No open questions
remain blocking any phase.

### A. Background job infrastructure — **self-hosted worker**

A Postgres job table + a Node worker process polling it. No third-party queue
vendor. Covers: extraction (EPIC 4), embeddings (EPIC 10), SLA/ageing sweeps
(EPIC 5/6/7), acknowledgement-window promotion (EPIC 5), retention purge
(EPIC 17).

### B. Inbound connectors — **manual upload only for v1**

Transcript/email/document upload is the whole of Phase 1 Capture. Meeting
platform and mailbox connectors are explicitly deferred past v1 — not
scheduled in any phase above.

### C. LLM provider — **configurable per user (BYOK), not a single fixed provider**

Each user configures their own provider/model/API key in personal settings;
every AI call site (extraction, embeddings, guardrail evaluation, duplicate
detection, change-impact analysis) resolves the provider from the
*initiating* user's settings rather than a hardcoded vendor. Implemented via
a provider-agnostic call layer (Vercel AI SDK's unified `"provider/model"`
interface) so call sites never branch on vendor. This adds a new Phase 0
component: **encrypted per-user LLM credential storage + settings UI**,
added to EPIC 1. Embeddings for EPIC 10 retrieval must also resolve per the
acting user's configured provider — if a project mixes providers across
users, retrieval indexing is still coherent only within a single provider's
vector space, so EPIC 10 needs a documented constraint: **a project's
embedding model is fixed at the project level** (likely the Project
Administrator's or Lead BA's configured provider) even though generation
calls (extraction, guardrails) can vary per acting user. This nuance is
tracked as an implementation detail for EPIC 10, not a further open question.

### D. Confidence threshold — **0.80 default**

Candidates scoring ≥ 0.80 are pre-accepted (revertible); below that,
contradicting, or ambiguous candidates require explicit BA decision. Stored
as project-level config (`confidence_score` already exists per-row in the
schema), tunable later without a schema change.

### E. Agile Studio instance — **build against a stub**

No real Pega Infinity instance exists yet. EPIC 14 ships with a stub client
(same interface, mocked responses) so Phase 5/6 Publish steps aren't
blocked. Swap in real OAuth client-credentials once an instance is
provisioned — isolated to EPIC 14's client implementation, no call-site
changes needed elsewhere.

### F. Email provider — **Resend**

### G. Retention/purge semantics — **anonymise, not hard delete**

On retention expiry, `interaction`/`utterance` content is stripped but the
structural rows remain, so `trace_link` and `audit_event` references never
dangle. EPIC 17's purge job updates content columns to null/redacted and
flips a status rather than deleting rows.

### H. Authentication — **both magic link and password**

Supabase Auth supports both; users choose either. Confirmed: client-side
stakeholders never log in (§1 "Out of scope for release one") — `stakeholder`
rows have no auth linkage and are reached only by email.

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
