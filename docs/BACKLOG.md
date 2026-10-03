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

## EPIC 0 — Platform Foundations — ✅ implemented (Phase 0)
**Why:** Nothing else can be built without a data model, migrations pipeline, and
a deployable shell.
**Traces to:** Non-functional requirements (§7), integrations (§6).

- Set up Supabase project, Postgres schema migration pipeline (translate
  `ba-workbench-schema.sql`: `VARCHAR(36)` IDs → `uuid`, add `updated_at` /
  `created_at` consistently, enable `pgvector`, `pgcrypto`) — **L**
- App shell: Next.js App Router project, design system baseline, dashboard
  layout/nav, loading/error boundaries — **M**
- Background job infrastructure: Postgres job table + self-hosted Node worker
  (resolved, see `EXECUTION_PLAN.md` §3.A) for anything that can't complete
  inside a single HTTP request (extraction, embeddings, retention sweeps) — **L**
- Central audit log writer (`audit_event` insert helper, called from every
  mutating server action, not bolted on later) — **S**
- Environment/config and secrets management (`.env.local` pattern already
  started; extend for LLM, email, storage keys) — **S**

---

## EPIC 1 — Identity, Projects & Membership — ✅ implemented (Phase 0)
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
- Per-user LLM provider settings (BYOK): provider + model + encrypted API key,
  used by every AI call site platform-wide (resolved decision, see
  `EXECUTION_PLAN.md` §3.C) — **M**

---

## EPIC 2 — Knowledge Model & Charter — ✅ implemented (Phase 1)
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

## EPIC 3 — Interaction Capture — ✅ implemented (Phase 1)
**Why:** The entry point for all content. Manual upload is the whole of v1
Capture (resolved decision, see `EXECUTION_PLAN.md` §3.B) — no live connector
is scheduled in this plan.
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
- *(Post-v1, not scheduled)* Meeting platform connector, note-taking
  connector, mailbox connector — deferred entirely; revisit as a new phase
  only if a future need arises — **XL total, per connector**

---

## EPIC 4 — Extraction Service (AI) — ✅ implemented (Phase 2)

**Why:** Converts raw utterances into candidate decisions/actions/questions —
the core "intelligence" of the product. Explicitly in scope per your
confirmation (external services get built, not assumed).
**Traces to:** §3.2 stage 2, §6 Processing services, `ba-workbench-integrations.yaml`
`/extraction/candidates`, `/extraction/minutes`.

- Provider-agnostic prompt-engineering harness for candidate extraction
  (decisions, action items, clarifications, risks, change signals), each with
  a confidence score and `source_utterance_id` — resolves the LLM provider
  from the initiating user's BYOK settings (EPIC 1), not a hardcoded vendor
  (resolved decision, `EXECUTION_PLAN.md` §3.C) — `src/lib/ai/extraction.ts`
- Contradiction check against existing `Confirmed` decisions at extraction
  time — done in the same LLM call, with existing confirmed statements
  passed as context (no retrieval/embedding service yet — EPIC 10, Phase 4)
  — `src/jobs/handlers/extractCandidates.ts`
- Async job: runs on the EPIC 0 job queue, not inline in a request —
  `extract_candidates` job type
- Minutes draft generation — done synchronously in a server action instead
  of the job queue (single LLM call over already-accepted candidates, not
  the long-running per-utterance pass extraction needs) —
  `src/lib/ai/minutes.ts`, `generateMinutes` action
- Confidence threshold: 0.80 default read from `project.confidence_threshold`
- **New schema**: `extraction_candidate` table (migration `0010`) — holds
  all five candidate kinds pre-commit. Not in the original
  `ba-workbench-schema.sql`; justified because `action_item.status` has no
  Candidate-equivalent value and the BPMN flow makes clear decision/
  action_item/clarification rows aren't created until Commit, after minutes
  distribution — see migration comment for the full reasoning.
- **Live-tested** against OpenRouter (`openai/gpt-4.1-mini`) and Resend:
  `extractCandidates` correctly produced all five candidate kinds including
  a true contradiction detection, `generateMinutesDraft` produced valid
  HTML, and a real email sent via Resend. Found and fixed a real bug in the
  process: OpenAI's strict structured-output mode requires every schema
  property in `required` — zod's `.optional()` (vs. `.nullable()`) drops a
  key from `required` when converted to JSON Schema, which OpenAI then
  rejects outright. Every maybe-absent field in the extraction schema is
  `.nullable()` only now. Also added `maxOutputTokens` caps to both calls
  (sane regardless of the account-credit limit that surfaced it).
- **OpenRouter** added as a third BYOK provider (migration `0011`) — one
  key, any model id (e.g. `openai/gpt-4.1-mini`, `anthropic/claude-sonnet-4.5`)
  via the OpenAI-compatible SDK pointed at OpenRouter's base URL. Now the
  default option in Settings.

---

## EPIC 5 — Meeting Ingestion Case — ✅ implemented (Phase 2)

**Why:** "The most frequently executed case type" per the requirements — the
primary day-to-day workflow.
**Traces to:** §3.2 (all 5 stages), §8 rules 2–4, BPMN diagram.

- **Confirm stage**: reviewer UI for the candidate list — accept / reject /
  revert per candidate (`confirm-actions.ts`); high-confidence items
  pre-accepted with a revert action; case cannot advance while any candidate
  is still Pending, which covers unresolved contradictions since those stay
  Pending until resolved (maps to the BPMN gateway `Gateway_Contradiction`).
  **Deferred, not built**: merge/split candidates — accept/edit/reject
  covers the common path; merge/split adds real complexity (what happens to
  source_utterance_id, confidence scoring across merged items) for a case
  that didn't come up in verification. Revisit if real usage needs it.
- **Resolve contradiction** sub-flow (Lead BA only, role-checked) —
  `resolveContradiction` action, re-enters Confirm per BPMN `Flow_06`.
- **Publish minutes stage**: LLM-drafted minutes (`generateMinutes`), BA
  edits (`updateMinutes`), Lead-BA approve step combined with distribute
  into one action (`approveAndDistribute`) — the requirements describe them
  sequentially but don't require a human step between approval and sending.
- **Commit to charter stage** (`commitToCharter`, runs inside
  `approveAndDistribute`):
  - Decisions written as `Provisional` (§8 rule 3) with supersession links
    when a candidate resolved a contradiction
  - Action items/clarifications need a resolved owner (§8 rule 8) but
    extraction only gives free-text `suggestedOwner` — exact case-insensitive
    name match against project members, else falls back to the committing
    Lead BA. Noted in code as a placeholder pending a real
    owner-assignment UI.
  - Acknowledgement window scheduled via the job queue
    (`promote_provisional_decisions`, `run_after` = now + `mom_ack_window_hours`)
  - Dispute handling (`disputeMinutes`): reverts affected decisions to
    `Candidate`, resets their `extraction_candidate` rows to `Pending`,
    reopens the interaction at `Extracted` (§8 rule 4). **Deferred**: dispute
    is an authenticated in-app action for any project member, not a public
    tokenized link for external recipients — building real unauthenticated
    ack/dispute links is its own scope.
  - Risk / ChangeSignal candidates have no persistent home in the schema —
    they stay as Accepted `extraction_candidate` rows for traceability only.
- Case-level SLA timer/alert (15-minute target) — **not built**; the job
  queue enforces nothing about timing yet, just FIFO + retry.

**Depends on:** EPIC 2 (charter writes), EPIC 3 (source interaction), EPIC 4
(extraction + minutes generation), EPIC 15 (email distribution).

---

## EPIC 6 — Action Item Case — ✅ implemented (Phase 3)

**Traces to:** §3.3.

- Stages: Open → InProgress → Completed → Verified, plus Cancelled, as
  explicit status field + transition guards (owner/raiser/Lead-BA gated) —
  `action-items/actions.ts`
- Worklist page grouped by status, with an Overdue badge computed from
  `due_date` — `action-items/page.tsx`. **Not built**: a true cross-project
  "my action items" view — that's EPIC 13's job, this page is per-project only.
- Overdue escalation: self-rescheduling sweep job (`sweep_action_item_overdue`,
  hourly, idempotent via `escalated_at`) writes an `Escalated` audit event —
  no notification/inbox system exists yet, so "escalates to the Lead BA"
  means it's visible in the project's audit trail and the Overdue badge,
  not a push notification.
- "Must resolve to a named person" (§8 rule 8) — enforced structurally since
  Phase 2's commit (owner_user_id is NOT NULL with a resolution fallback).

**Depends on:** EPIC 1 (owners are project members), EPIC 5 (primary spawn
source), EPIC 0 (background sweep for escalation).

---

## EPIC 7 — Clarification Item Case — ✅ implemented (Phase 3)

**Traces to:** §3.4.

- Raise: created at Meeting Ingestion commit time (Phase 2); audience
  classification defaults to InternalBusiness since extraction doesn't
  infer audience — editing that after creation isn't built yet.
- Prepare / Ask: status transitions with channel + date captured —
  `clarifications/actions.ts`. **Not built**: surfacing in call-prep
  views — that's EPIC 13.
- Answer: creates a real `decision` row at `Candidate` status (not routed
  through the Meeting Ingestion extraction/contradiction pipeline — this is
  a direct BA-recorded answer, not LLM output).
- Confirm: promotes that decision straight to `Confirmed` — not subject to
  the Provisional/acknowledgement-window path, since §8 rule 3 scopes that
  specifically to decisions derived from distributed minutes. "Notifies
  dependent stories/change requests" is a no-op: EPIC 11/12 don't exist yet
  for there to be anything to notify.
- Ageing: same self-rescheduling sweep pattern as EPIC 6
  (`sweep_clarification_ageing`), threshold per-project
  (`project.clarification_ageing_days`, default 14).
- "Must resolve to a named person" (§8 rule 8) — enforced structurally since
  Phase 2's commit (chasing_user_id is NOT NULL with a resolution fallback).

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

## EPIC 9 — Guardrail Engine — ✅ implemented (Phase 4)

**Why:** Shared by User Story Authoring's Check stage and reusable by Change
Request Analysis.
**Traces to:** §3.6 stage 3, `guardrail_rule` / `glossary_term` tables,
`/analysis/guardrail-check`.

- Glossary management (preferred/banned forms) and guardrail rule CRUD
  (Vocabulary/SentencePattern/StructureCheck/Completeness, Info/Warning/
  Blocking severity, active/inactive toggle) — `guardrails/actions.ts`
- Evaluation: Vocabulary is deterministic exact-match scanning (more
  reliable than an LLM for banned-term detection), everything else —
  SentencePattern, StructureCheck, and the explicit completeness sub-checks
  (negative paths, error handling, permissions, data migration) — is one
  LLM call — `src/lib/ai/guardrails.ts`
- **Interactive checker, not a persisted gate**: there's no `user_story` row
  to attach findings/dispositions to yet (EPIC 11 not built), so this ships
  as a standalone tester — paste a story-shaped payload, get findings back.
  The engine itself (`evaluateGuardrails`) is what EPIC 11's Check stage
  will call directly once stories exist; the accept/dismiss-with-persistence
  UI described in the original story is deferred until there's something
  real to persist it against.

**Depends on:** EPIC 2 (glossary/rules are project-scoped charter-adjacent
config), EPIC 4's provider-agnostic LLM harness (reused for rule evaluation,
not a new provider integration).

---

## EPIC 10 — Retrieval Service — ✅ implemented (Phase 4)

**Why:** Powers semantic search, duplicate detection, and change-impact
traversal. Build once, reuse three times.
**Traces to:** §6 Processing services, `/retrieval/search`.

- Embedding pipeline: `embed_object` job (real handler now, was a Phase 0
  stub) embeds utterance/decision/knowledge_node/user_story content on
  write, enqueued from every existing write point (interaction capture,
  charter create/update, Meeting Ingestion commit, clarification answer) —
  `src/jobs/handlers/embedObject.ts`. Skips enqueueing entirely for a
  project with no embedding model configured, so it's a progressive
  enhancement, not a hard requirement.
- Embedding generation is per-user BYOK but the *model* is fixed at project
  level (resolved decision, `EXECUTION_PLAN.md` §3.C) — a Lead BA sets
  `embedding_provider`/`embedding_model` on the project page;
  `resolveProjectEmbeddingModel` then borrows the acting user's matching
  credential. Constrained to openai/openrouter (Anthropic has no embeddings
  endpoint) via a CHECK constraint.
- `/retrieval/search` equivalent: `search_project_embeddings` — a single
  `SECURITY DEFINER` Postgres function unioning ranked results across all
  four embeddable tables, with an explicit membership check inside (it
  bypasses RLS to read across tables efficiently, but not the "must be a
  project member" floor every other table enforces) — `search/page.tsx`.
- Re-embedding on edit: not a separate code path — every write point just
  enqueues `embed_object` again, which always overwrites the embedding
  column rather than appending to it.

**Verified against the live Supabase project**: ranking was tested with
fabricated vectors (confirmed correct cosine-similarity ordering, ~0.997 for
a near-identical vector vs. -0.997 for a near-opposite one) since no LLM/
embeddings API key was available in this environment to generate real ones;
the membership guard was confirmed to reject a non-member's search attempt.
The embeddings API call itself (`resolveProjectEmbeddingModel` /
`embedText`) is implemented but unexercised pending a credential — same gap
as Phase 2 before OpenRouter was wired in.

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

- Stub client first: same interface as the real REST client, mocked
  responses, so Phase 5/6 Publish steps aren't blocked (resolved decision,
  `EXECUTION_PLAN.md` §3.E) — **S**
- Real REST client against Pega Infinity's Agile Studio APIs — OAuth2
  client-credentials, matching the pattern already built and removed earlier
  in this project (`src/lib/pega/*` before the Pega pivot) — can be
  resurrected almost as-is once an instance exists — **M**
- Create/update epic, create/update story — **M**
- Read status back (sprint, story points, status) for display — **M**
- Ownership boundary enforced in code, not just convention: story
  status/sprint/points are never written by this platform (§8 rule 6);
  description/acceptance criteria/business context are never overwritten by a
  read-back sync (§8 rule 7) — **S**
- Backlog import (used by EPIC 1 Seed stage) — **M**

**Depends on:** EPIC 0. The stub ships in Phase 6; swapping to the real
client is deferred until a Pega Infinity + Agile Studio instance exists.

---

## EPIC 15 — Email Distribution Service — ✅ implemented (Phase 1)
**Traces to:** §6 Outbound (Email distribution).

- Transactional email provider integration — **Resend** (resolved decision,
  `EXECUTION_PLAN.md` §3.F) — **S**
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

- Scheduled purge job: `interaction`/`utterance` rows past `purge_after` are
  anonymised — content columns redacted, structural rows retained (resolved
  decision, `EXECUTION_PLAN.md` §3.G) — **M**
- Manual purge-on-request flow, same anonymise semantics — **S**
- Anonymise rather than delete specifically so trace links and audit history
  referencing a purged interaction never dangle — **M**

**Depends on:** EPIC 3, EPIC 0 (scheduler).
