# BA Charter — Product Backlog

Source of truth: `Requirements/BA-Charter-Requirements.md`, `ba-workbench-schema.sql`,
`ba-workbench-integrations.yaml`, `meeting-ingestion-process.bpmn`.

Target architecture: standalone Next.js (App Router) + Supabase (Postgres, Auth,
Storage, pgvector). No Pega platform involvement — every Pega "case type" below is
reimplemented as application state machines, server actions, and background jobs.
Agile Studio is treated as an external system reached over REST (not "same
platform" as the requirements assume for a Pega-native build).

Each epic lists: purpose, requirement traceability, key stories, and dependencies.
Sizing is qualitative (S/M/L/XL) — no team velocity exists yet to size in points.

---

## EPIC 0 — Platform Foundations
**Why:** Nothing else can be built without a data model, migrations pipeline, and
a deployable shell.
**Traces to:** Non-functional requirements (§7), integrations (§6).

- Set up Supabase project, Postgres schema migration pipeline (translate
  `ba-workbench-schema.sql`: `VARCHAR(36)` IDs → `uuid`, add `updated_at` /
  `created_at` consistently, enable `pgvector`, `pgcrypto`) — **L**
- App shell: Next.js App Router project, design system baseline, dashboard
  layout/nav, loading/error boundaries — **M**
- Background job infrastructure: a job runner for anything that can't complete
  inside a single HTTP request (extraction, embeddings, retention sweeps). Needs
  an architecture decision — see Open Questions §A. — **L**
- Central audit log writer (`audit_event` insert helper, called from every
  mutating server action, not bolted on later) — **S**
- Environment/config and secrets management (`.env.local` pattern already
  started; extend for LLM, email, storage keys) — **S**

---

## EPIC 1 — Identity, Projects & Membership
**Why:** Every object in the system is project-scoped; nothing is visible without
membership and role.
**Traces to:** §2 Personas, §3.1 Project Setup, `project` / `app_user` /
`project_member` tables.

- Supabase Auth integration; `app_user` row created/synced on first sign-in — **M**
- Roles: Business Analyst, Lead Business Analyst, Delivery Team Member, Project
  Administrator — enforced via RLS policies keyed on `project_member.role_name`,
  not just UI hiding — **L**
- Row-Level Security: every project-scoped table readable/writable only by
  members of that project — **L** (cross-cutting, lands incrementally per table
  as each epic's tables are created, but the *policy pattern* is defined here)
- **Project Setup case** (§3.1), reimplemented as a guided multi-step flow:
  - Initiate: name, client, description, start date, Lead BA, Agile Studio
    project reference — **S**
  - Seed: optional document upload, optional backlog import from Agile Studio,
    optional glossary import — **M** (import parsers depend on EPIC 14)
  - Configure: members + roles, enable integrations, retention period — **M**
  - Activate: Lead BA confirmation gate; project appears in workspace switcher
    only after activation — **S**
- Workspace switcher (cross-project shell, not the full cross-project workspace
  in EPIC 13 — just the project picker) — **S**

---

## EPIC 2 — Knowledge Model & Charter
**Why:** The charter is the thing every other case type reads from or writes
into. Must exist before Meeting Ingestion can "commit to charter."
**Traces to:** §3.8 Charter Update, §5 Data objects (`Charter Entry`/
`knowledge_node`), §8 business rules 1–4.

- `knowledge_node` CRUD scoped to the four layers (System overview, Functional
  areas, Capabilities and rules, Implementation notes), parent/child nesting — **M**
- Versioning: every write creates a new `version_no`, author + timestamp +
  source reference retained, not overwritten in place — **M**
- Conflict detection: a new confirmed decision/entry that contradicts an
  existing node raises a `knowledge_conflict` row rather than silently
  overwriting (§8 rule 2) — **L**
- Conflict resolution UI, Lead BA only (§3.8 rule: "only the Lead Business
  Analyst may resolve a conflict") — **M**
- Coverage indicator per functional area (`coverage_score`) — initial version
  can be a simple heuristic (confirmed nodes / expected nodes); revisit once
  EPIC 10 (retrieval) exists to make it content-aware — **M**
- Enforce: **only confirmed content may be written to the model** (§8 rule 1) —
  this is a guard on every writer, not a standalone feature — **S**

---

## EPIC 3 — Interaction Capture
**Why:** The entry point for all content. Manual upload is the v1 critical path;
live connectors are explicitly phased later (see Open Questions §B).
**Traces to:** §3.2 stage 1 (Capture), §6 Inbound integrations, `interaction` /
`utterance` tables.

- Manual upload: transcript / email / document file → `interaction` row,
  `processing_status = Received` — **M**
- Normalisation: parse into `Utterance` records with sequence, speaker label,
  offset — format-specific parsers (plain transcript, VTT/SRT, email thread) — **L**
- Speaker-to-project-member / stakeholder mapping (manual match UI for
  unmatched speakers) — **M**
- Content indexing hook (fires into EPIC 10 retrieval indexing once that
  exists; stub until then) — **S**
- Retention: `purge_after` computed from project `retention_days` at ingest
  time — **S**
- *(Phase 2, not v1 blocking)* Meeting platform connector, note-taking
  connector, mailbox connector — each is its own integration project once a
  provider is chosen (§Open Questions B) — **XL total, per connector**

---

## EPIC 4 — Extraction Service (AI)
**Why:** Converts raw utterances into candidate decisions/actions/questions —
the core "intelligence" of the product. Explicitly in scope per your
confirmation (external services get built, not assumed).
**Traces to:** §3.2 stage 2, §6 Processing services, `ba-workbench-integrations.yaml`
`/extraction/candidates`, `/extraction/minutes`.

- LLM provider selection and prompt-engineering harness for candidate extraction
  (decisions, action items, clarifications, risks, change signals), each with a
  confidence score and `source_utterance_id` — **L** (blocked on Open
  Questions §C: provider choice)
- Contradiction check against existing `Confirmed` decisions at extraction time
  (`includeContradictionCheck`) — **L**
- Async job: extraction must complete within the 15-minute SLA for a 90-minute
  transcript (§7 Performance) — runs on the background job infra from EPIC 0,
  not inline in a request — **M**
- `extraction/minutes` endpoint: generate minutes draft from a confirmed-only
  decision/action set — **M**
- Confidence threshold configuration (what counts as "high confidence
  pre-accepted" vs. "requires explicit decision") — needs a number; see Open
  Questions §D — **S** once threshold is set

---

## EPIC 5 — Meeting Ingestion Case
**Why:** "The most frequently executed case type" per the requirements — the
primary day-to-day workflow.
**Traces to:** §3.2 (all 5 stages), §8 rules 2–4, BPMN diagram.

- **Confirm stage**: reviewer UI for the candidate list — accept / edit / merge
  / split / reassign / reject per candidate; high-confidence items pre-accepted
  with a revert action; case cannot advance while unresolved contradictions
  remain (maps directly to the BPMN gateway `Gateway_Contradiction`) — **L**
- **Resolve contradiction** sub-flow (Lead BA), re-enters Confirm per the BPMN
  loop (`Flow_06`) — **M**
- **Publish minutes stage**: BA edits generated draft, Lead BA approval gate,
  distribute by email (EPIC 15) to attendees + distribution list — **M**
- **Commit to charter stage**:
  - Decisions written as `Provisional` (§8 rule 3) with supersession links
  - Acknowledgement window per project (`mom_ack_window_hours`); decisions
    auto-promote to `Confirmed` when the window lapses undisputed — needs a
    scheduled job — **L**
  - Dispute handling within the window: reverts affected decisions to
    `Candidate`, reopens the case at Confirm (§8 rule 4) — **M**
  - Spawn child `Action Item` and `Clarification` cases from confirmed items — **M**
  - Mark superseded decisions, record attribution/version — **S**
- Case-level SLA tracking (15-minute minutes-drafted target, §3.2) surfaced as
  a visible timer/alert, not just a backend metric — **S**

**Depends on:** EPIC 2 (charter writes), EPIC 3 (source interaction), EPIC 4
(extraction + minutes generation), EPIC 15 (email distribution).

---

## EPIC 6 — Action Item Case
**Traces to:** §3.3.

- Stages: Assign → In progress → Complete → Verify, as explicit status field +
  transition guards — **M**
- Routing to assigned owner's worklist (feeds EPIC 13) — **S**
- Overdue escalation to Lead BA (needs a scheduled sweep) — **M**
- "Must resolve to a named person" validation (§8 rule 8) — **S**

**Depends on:** EPIC 1 (owners are project members), EPIC 5 (primary spawn
source), EPIC 0 (background sweep for escalation).

---

## EPIC 7 — Clarification Item Case
**Traces to:** §3.4.

- Raise: question, affected functional area, why-it-matters, audience
  classification (Client / Architect / InternalBusiness / DeliveryTeam),
  chasing BA — **M**
- Prepare: surfaces in call-prep views (feeds EPIC 13), grouped by topic — **S**
  (depends on EPIC 13 existing to render into)
- Ask: channel + date captured — **S**
- Answer: answer treated as a candidate decision, routed into the same
  confirm/charter-write path as EPIC 2/5 — **M**
- Confirm: writes to charter, notifies dependent stories/change requests
  (trace-link driven notification) — **M**
- Ageing flag beyond configurable threshold, reported to Lead BA — **M**
  (same scheduled-sweep pattern as EPIC 6 overdue escalation — build once,
  reuse)
- "Must resolve to a named person" validation (§8 rule 8) — **S**

**Depends on:** EPIC 1, EPIC 2 (answer → decision write), EPIC 0 (sweep infra).

---

## EPIC 8 — Epic Definition Case
**Traces to:** §3.5.

- Draft: title, business objective, functional areas, in/out of scope — **S**
- Link: attach source decisions + charter nodes (trace links) — **M**
- Review: Lead BA completeness review, approve/return — **S**
- Publish: create/update Agile Studio epic — **M** (depends on EPIC 14)

**Depends on:** EPIC 2 (confirmed decisions to link), EPIC 14 (publish).

---

## EPIC 9 — Guardrail Engine
**Why:** Shared by User Story Authoring's Check stage and reusable by Change
Request Analysis.
**Traces to:** §3.6 stage 3, `guardrail_rule` / `glossary_term` tables,
`/analysis/guardrail-check`.

- Glossary management: preferred/banned forms per project — **S**
- Guardrail rule types: Vocabulary, SentencePattern, StructureCheck,
  Completeness, each with severity (Info/Warning/Blocking) — **M**
- Evaluation service: runs a story payload against active rules, returns
  findings with suggested corrections — **L**
- Completeness sub-checks called out explicitly in requirements: negative
  paths, error handling, permissions, data migration — **M**
- BA resolution UI: accept or dismiss each finding, Blocking severity prevents
  progression until resolved — **M**

**Depends on:** EPIC 2 (glossary/rules are project-scoped charter-adjacent
config), EPIC 4's LLM harness (reused for rule evaluation, not a new provider
integration).

---

## EPIC 10 — Retrieval Service
**Why:** Powers semantic search, duplicate detection, and change-impact
traversal. Build once, reuse three times.
**Traces to:** §6 Processing services, `/retrieval/search`.

- Embedding pipeline: embed utterances, decisions, knowledge nodes, user
  stories on write (pgvector columns + background job) — **L**
- `/retrieval/search` equivalent: scoped semantic search across the enabled
  object types, ranked, with source references — **M**
- Re-embedding on edit (versioned content must stay searchable against its
  current version) — **S**

**Depends on:** EPIC 0 (pgvector, background jobs), EPIC 3/2/5 (content to
index as it's created).

---

## EPIC 11 — User Story Authoring Case
**Traces to:** §3.6 (all 5 stages), §8 rule 5.

- **Frame**: parent epic, actor, goal, business value, starting/end point — **S**
- **Detail**: prerequisites/dependencies on other stories (`story_dependency`),
  description, Given/When/Then acceptance criteria editor, NFR fields
  (performance/security/accessibility/audit), assumptions/exclusions — **L**
- **Check**:
  - Guardrail evaluation (EPIC 9) against the draft — **S** (integration only,
    engine already built)
  - Completeness check (negative paths, error handling, permissions, data
    migration) — covered by EPIC 9's completeness rules
  - Duplicate detection against existing stories (`/analysis/duplicate-check`,
    built on EPIC 10 retrieval) — **M**
  - BA resolves/accepts each finding before advancing — **S**
- **Review**: peer or Lead BA review, field-level comments (`review` table),
  approve / return-for-rework; returned story re-enters Check (§3.6 stage 4) — **M**
- **Publish**: create/update Agile Studio story, record the external link —
  **blocked without at least one trace link to a confirmed decision** (§8
  rule 5 — hard gate, not a warning) — **M**

**Depends on:** EPIC 8 (parent epics), EPIC 9, EPIC 10, EPIC 14 (publish).

---

## EPIC 12 — Change Request Analysis Case
**Traces to:** §3.7 (all 5 stages).

- **Intake**: description, requester, source reference, urgency — **S**
- **Analyse**:
  - Charter/trace-link traversal to find affected functional areas, rules,
    epics, published stories (`/analysis/change-impact`) — **L**
  - Gap identification: missing acceptance criteria, unspecified error paths,
    absent NFRs, undefined permissions, absent data migration handling — **M**
  - Contradiction detection citing both sides — **M**
  - Coverage-by-area confidence reporting — **S** (reuses EPIC 2 coverage
    scoring)
- **Brainstorm**: prioritised, audience-grouped question list; BA edits the
  list; selected questions become `Clarification Item` cases (EPIC 7) — **M**
- **Decide**: accept / defer to release / reject, with rationale — **S**
- **Propagate**:
  - Generate proposed edits to affected stories/epics, BA approves each
    individually — **L**
  - Push updates to Agile Studio (EPIC 14) — **M**
  - Email notification to affected delivery team members (EPIC 15) — **S**
- Closure guard: cannot close while blocking clarifications are unanswered
  (§8 rule 9) — **S**

**Depends on:** EPIC 2, EPIC 7, EPIC 9 (guardrail reuse on proposed edits),
EPIC 10, EPIC 11 (edits target published stories), EPIC 14, EPIC 15.

---

## EPIC 13 — Cross-Project Workspace
**Traces to:** §4.

- My action items — aggregated open actions across all member projects, with
  source links — **M**
- My clarifications — aggregated open questions the user is chasing, with
  ageing — **M**
- Awaiting my confirmation — extracted candidates pending the user's review — **M**
- Awaiting my review — stories submitted for peer/lead review — **M**
- Call preparation — select a stakeholder/client, assemble every open
  clarification directed at them, grouped by topic, as a meeting agenda — **L**
- Cross-project visibility rule: titles visible everywhere, full context only
  within the owning project subject to membership (RLS-enforced, not just
  UI-filtered) — **M**

**Depends on:** EPIC 6, EPIC 7, EPIC 11 (review queue), EPIC 1 (membership
scoping). Functionally this is a set of cross-project *views* over data that
must already exist — build last among the case types, but its query patterns
should be sketched early so EPIC 6/7/11 tables are shaped to support it
cheaply (e.g. consistent owner/status columns).

---

## EPIC 14 — Agile Studio Integration
**Why:** The requirements assume this is a same-platform object reference; in
the standalone build it's a real external integration.
**Traces to:** §6 Outbound, §8 rule 6–7.

- REST client against Pega Infinity's Agile Studio APIs — OAuth2
  client-credentials, matching the pattern already built and removed earlier
  in this project (`src/lib/pega/*` before the Pega pivot) — can be resurrected
  almost as-is — **M**
- Create/update epic, create/update story — **M**
- Read status back (sprint, story points, status) for display — **M**
- Ownership boundary enforced in code, not just convention: story
  status/sprint/points are never written by this platform (§8 rule 6);
  description/acceptance criteria/business context are never overwritten by a
  read-back sync (§8 rule 7) — **S**
- Backlog import (used by EPIC 1 Seed stage) — **M**

**Depends on:** EPIC 0. Needs a real Pega Infinity + Agile Studio
instance/credentials to integrate against — see Open Questions §E.

---

## EPIC 15 — Email Distribution Service
**Traces to:** §6 Outbound (Email distribution).

- Transactional email provider integration — **S** (provider choice: Open
  Questions §F)
- Templates: minutes of meeting, clarification request, change notification — **M**
- Recipient tracking for minutes (`minutes_recipient.acknowledged_at`) —
  acknowledgement link/webhook that feeds the EPIC 5 commit-to-charter
  auto-promotion logic — **M**

**Depends on:** EPIC 0.

---

## EPIC 16 — Audit, Traceability, Concurrency & Accessibility
**Why:** These are not a late-stage pass — the requirements state every
confirmation/approval/publication/model change is audited, every generated
statement keeps its source reference, and concurrent edits are surfaced, not
discarded. Treated as an acceptance gate applied to every other epic, tracked
here so it isn't silently dropped under schedule pressure.
**Traces to:** §7 (all five NFRs).

- Audit event coverage checklist per case type (confirm every mutating action
  writes `audit_event`) — **M**, ongoing verification
- Traceability checklist: every generated candidate/minutes/story/suggestion
  retains `source_utterance_id` end to end — **M**, ongoing verification
- Optimistic concurrency: use existing `version_no` columns on `decision`,
  `knowledge_node`, `user_story`; surface a conflict UI instead of
  last-write-wins — **L**
- Accessibility: WCAG 2.1 AA pass on authoring/review screens specifically
  (not the whole app) — **M**, needs a dedicated audit pass near the end of
  each epic that ships a new screen, not one at the very end
- Workspace view load-time budget (3s, §7 Performance) — covered by sane
  indexing + pagination, validated per-epic

**Depends on:** nothing new — this is a lens applied across every epic above,
with its own line items so it's plannable and demonstrable rather than vague.

---

## EPIC 17 — Retention & Purge
**Traces to:** §7 Security.

- Scheduled purge job: `interaction` rows past `purge_after` are purged
  (define: hard delete vs. anonymise — Open Questions §G) — **M**
- Manual purge-on-request flow — **S**
- Purge of an interaction must not silently break trace links/audit history
  that reference it (decide: cascade vs. tombstone) — **M**

**Depends on:** EPIC 3, EPIC 0 (scheduler).
