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
  **Merge/split** (migration `0019`): check two or more same-type Pending
  candidates and merge them into one new Pending candidate (confidence
  averaged, source_utterance_id/owner/due date carried from whichever
  merged one has them first), or split one Pending candidate into several
  by entering one statement per line. Both go through the normal
  accept/reject flow afterward like any other candidate. Originals are
  marked `Merged`/`Split` (terminal, not deleted) and linked to the
  result(s) both ways (`merged_from_candidate_ids`/`merged_into_candidate_id`,
  `split_from_candidate_id`/`split_into_candidate_ids`) so the lineage stays
  queryable — the resulting row(s) still carry only one
  `source_utterance_id` each, same structural limit every committed
  decision/action_item/clarification row already has.
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
    reopens the interaction at `Extracted` (§8 rule 4). Also reachable via
    the public tokenized link below — both share
    `src/lib/minutes/dispute.ts` so they land on identical state.
  - Risk / ChangeSignal candidates have no persistent home in the schema —
    they stay as Accepted `extraction_candidate` rows for traceability only.
- Case-level SLA timer/alert (migration `0021`): Requirements §3.2 —
  "minutes of meeting drafted within fifteen minutes of source upload."
  `sweep_meeting_ingestion_sla` (`src/jobs/handlers/sweepMeetingIngestionSla.ts`)
  flags any interaction with no `minutes_document` fifteen minutes after
  `ingested_at`, setting `interaction.sla_breached_at` (idempotent, same
  pattern as `action_item.escalated_at`) and logging an `Escalated` audit
  event. Surfaced as a red "SLA breached" badge on the interactions list
  and detail page, same visual pattern as the Overdue badge on action
  items — there's still no notification/inbox system, so "alert" means
  visible-in-app, not pushed. **Caveat inherited from the existing sweep
  architecture, not specific to this one**: recurrence is the daily Vercel
  Cron (`vercel.json`) plus whichever app request's `after()` happens to
  drain the queue next — same as every other sweep in this codebase, no
  standing worker — so in practice this flags breaches after the fact,
  not within the 15-minute window itself. A true real-time alert would
  need a much tighter cron schedule or a standing worker; revisit if real
  usage needs the alert sooner than "next time someone opens the app."

**Depends on:** EPIC 2 (charter writes), EPIC 3 (source interaction), EPIC 4
(extraction + minutes generation), EPIC 15 (email distribution).

---

## EPIC 6 — Action Item Case — ✅ implemented (Phase 3)

**Traces to:** §3.3.

- Stages: Open → InProgress → Completed → Verified, plus Cancelled, as
  explicit status field + transition guards (owner/raiser/Lead-BA gated) —
  `action-items/actions.ts`
- Worklist page grouped by status, with an Overdue badge computed from
  `due_date` — `action-items/page.tsx` (per-project). The cross-project "my
  action items" view lives in EPIC 13's workspace instead
  (`workspace/page.tsx`), now built.
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
  `clarifications/actions.ts`. Surfaced in EPIC 13's call-prep view
  (`workspace/call-prep/page.tsx`), now built.
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

## EPIC 8 — Epic Definition Case — ✅ implemented (Phase 5)

**Traces to:** §3.5.

- Draft: title, business objective, in/out of scope — `epics/actions.ts`.
  **Not built**: linking to "functional areas" as a distinct concept —
  charter entries (`knowledge_node`) serve that role via Link instead.
- Link: attach source decisions + charter nodes as `trace_link` rows
  (`link_type = 'DerivedFrom'`); submitting for review is gated on at least
  one link existing.
- Review: Lead-BA-only approve/return-for-rework, recorded in `review`.
- Publish: calls the EPIC 14 stub client (`src/lib/agileStudio/client.ts`,
  built now rather than waiting for Phase 6, so this isn't blocked) and
  stores the returned reference on `agile_studio_ref`.

**Depends on:** EPIC 2 (confirmed decisions to link), EPIC 14 (publish —
stubbed, see above).

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
- The guardrails page's own checker (`StoryChecker`) is a standalone
  tester with no persistence — paste a story-shaped payload, get findings
  back — since it predates EPIC 11's `user_story` row to attach them to.
  EPIC 11's own Check stage, now built, calls the same engine
  (`evaluateGuardrails`) directly and does persist: `guardrail_pass` on the
  story row gates "Submit for review" without re-running the check every
  time (see EPIC 11). The accept/dismiss-per-finding UI from the original
  story spec is still not built — only pass/fail as a whole persists.

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
- Backfill (EPIC 19 follow-up, `src/lib/ai/embeddingBackfill.ts`): content
  created before a project had a model configured was silently never
  embedded, with no job ever enqueued for it and no later trigger to catch
  up — found via a production project with an uploaded document stuck at
  "no embedding, no job." `setEmbeddingConfig` now walks every embeddable
  table for rows still missing an embedding and enqueues them, every time
  it's saved (idempotent — only ever enqueues what's actually missing).
- Embedding generation is per-user BYOK but the *model* is fixed at project
  level (resolved decision, `EXECUTION_PLAN.md` §3.C) — a Lead BA sets
  `embedding_provider`/`embedding_model` on the project page;
  `resolveProjectEmbeddingModel` then borrows the acting user's matching
  credential. Constrained to openai/openrouter (Anthropic has no embeddings
  endpoint) via a CHECK constraint.
- `/retrieval/search` equivalent: `search_project_embeddings` — a single
  `SECURITY DEFINER` Postgres function unioning ranked results across all
  embeddable tables, with an explicit membership check inside (it
  bypasses RLS to read across tables efficiently, but not the "must be a
  project member" floor every other table enforces) — `search/page.tsx`.
  Widened from the original 4 types (Utterance/Decision/KnowledgeNode/
  UserStory) to 10 (migration `0023`, EPIC 19) — Epic/ActionItem/
  Clarification/ChangeRequest/Guardrail/Document now embed and search too.
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

## EPIC 11 — User Story Authoring Case — ✅ implemented (Phase 5)

**Traces to:** §3.6 (all 5 stages), §8 rule 5.

- **Frame**: parent epic, actor, goal, business value, starting/end point —
  set at creation; not re-editable afterward (Detail is, Frame isn't — a
  deliberate simplification, not an oversight).
- **Detail**: prerequisites, description, Given/When/Then acceptance
  criteria editor, dependencies on other stories (`story_dependency`), NFR
  fields, assumptions/exclusions — `stories/actions.ts`. Every save
  re-enqueues embedding (EPIC 10) so duplicate detection stays current.
- **Check** (`runStoryCheck`, client-invoked so results render without a
  page reload — `StoryCheckPanel.tsx`):
  - Guardrail evaluation reuses EPIC 9's `evaluateGuardrails` directly
  - Duplicate detection reuses EPIC 10's retrieval function
    (`checkDuplicateStories`) scoped to `UserStory`, threshold 0.85
    similarity — returns no matches gracefully if the story hasn't
    finished embedding yet (embedding is async) or if no embedding model
    is configured
  - `guardrail_pass` persists on the story row so "Submit for review" can
    gate on it without re-running the check every time
- **Review**: any project member (not Lead-gated — §3.6 stage 4 says "peer
  or Lead," unlike Epic review which is Lead-only); approve or
  return-for-rework, which correctly re-enters Check per the spec (status
  goes back to an editable state, not all the way to Draft).
- **Publish**: §8 rule 5 hard gate enforced — blocked without at least one
  `Implements` trace link to a confirmed decision, verified against the
  live database (both the blocked and unblocked paths). Calls the same
  EPIC 14 stub client as Epic publish.

**Depends on:** EPIC 8 (parent epics), EPIC 9, EPIC 10, EPIC 14 (publish —
stubbed).

---

## EPIC 12 — Change Request Analysis Case — ✅ implemented (Phase 7)
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

## EPIC 13 — Cross-Project Workspace — ✅ implemented (Phase 8)
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

## EPIC 14 — Agile Studio Integration — 🟡 stub + unverified real client (Phase 5)

**Why:** The requirements assume this is a same-platform object reference; in
the standalone build it's a real external integration.
**Traces to:** §6 Outbound, §8 rule 6–7.

- ✅ Stub client: same interface the real REST client implements, mocked
  responses (`src/lib/agileStudio/client.ts`) — built during Phase 5 rather
  than waiting for Phase 6, so EPIC 8/11 Publish steps weren't blocked
  (resolved decision, `EXECUTION_PLAN.md` §3.E). EPIC 8 and EPIC 11 publish
  actions both call it and store the returned reference on
  `agile_studio_ref`, verified against the live database. Still the
  default — `getAgileStudioClient()` only switches to the real client once
  `AGILE_STUDIO_BASE_URL` is set, which it isn't anywhere yet.
- 🟡 Real REST client, scaffolded but **genuinely unverified** — no Pega
  Infinity + Agile Studio instance exists to test it against, and none of
  the git history in this repo has the pre-pivot `src/lib/pega/*` OAuth2
  code this note used to say could be "resurrected" from (searched; it's
  not there). Built from scratch instead, in two parts with very different
  confidence levels:
  - `src/lib/agileStudio/oauth.ts`: RFC 6749 §4.4 client-credentials grant
    with HTTP Basic client auth (§2.3.1) — the standard pattern any
    correctly configured Pega OAuth2 Client Registration speaks, regardless
    of org. Token caching with expiry, unit-tested with a mocked `fetch`
    (`oauth.test.ts`) — this part is solid.
  - `src/lib/agileStudio/restClient.ts`: create/update epic, create/update
    story against `POST`/`PATCH /api/v1/cases` — matches Pega Platform's
    documented case-management REST API shape, a reasonable starting point,
    not a blind guess. The case type names and field names inside each
    request body (`AgileStudio-Work-Epic`, `Title`, `SourceEpicId`, …) are
    genuinely org-specific guesses with no way to verify them without a
    real instance — left env-configurable (`AGILE_STUDIO_EPIC_CASE_TYPE`
    etc.) specifically so correcting them is a config change, not a code
    change. Unit-tested for request shape only (`restClient.test.ts`) —
    that confirms the client sends what it's supposed to, not that a real
    instance accepts it.
  - Ownership boundary (§8 rule 6) already enforced in the request bodies
    themselves: `updateEpic`/`updateStory`'s payloads have no
    sprint/status/points fields to accidentally include.
- Read status back (sprint, story points, status) for display — **not
  built** — needs a real instance's response shape to know what to read.
- Ownership boundary for read-back (§8 rule 7 — description/acceptance
  criteria/business context never overwritten by a sync) — **not built**,
  same reason: no read-back exists yet to bound.
- Backlog import (used by EPIC 1 Seed stage) — **not built**.

**Depends on:** EPIC 0. Pointing `getAgileStudioClient()` at a real instance
is a one-line env var (`AGILE_STUDIO_BASE_URL`) once one exists — but the
case type/field names in `restClient.ts` will need correcting against
whatever that instance's actual Agile Studio case types turn out to be,
and the remaining items above (read-back, backlog import) still need
building once that real shape is known.

---

## EPIC 15 — Email Distribution Service — ✅ implemented (Phase 1)
**Traces to:** §6 Outbound (Email distribution).

- Transactional email provider integration — **Resend** (resolved decision,
  `EXECUTION_PLAN.md` §3.F) — **S**
- Templates: minutes of meeting, clarification request, change notification — **M**
- Recipient tracking for minutes: `minutes_recipient` rows are written at
  distribution time (who was sent what), each with its own unguessable
  `ack_token` (migration `0018`). Each recipient's email carries a link to
  `/minutes/[token]` — a public, unauthenticated page (no Supabase session;
  reads/writes go through the service-role client, scoped by the token
  alone) where they can acknowledge (sets `acknowledged_at`) or dispute
  (reuses the EPIC 5 dispute logic) without an app account. Auto-promotion
  to `Confirmed` still runs purely on the `mom_ack_window_hours` timer —
  acknowledgement is tracked and visible, not a gate on promotion; a real
  dispute still is, via the shared revert logic, same as the authenticated
  path.

**Depends on:** EPIC 0.

---

## EPIC 16 — Audit, Traceability, Concurrency & Accessibility — ✅ implemented (Phase 9, see note)
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

**Phase 9 verification pass — what was actually found and done:**

- Audit checklist ran against every `actions.ts` across every case type.
  Found and fixed three real gaps: `acceptCandidate`/`rejectCandidate`/
  `revertCandidate` (confirm-actions.ts) had zero audit coverage despite
  `acceptCandidate` being the literal confirmation event §7 requires;
  `reviewEpic` and `reviewStory` recorded the Approve/ReturnForRework
  decision in the `review` table but never wrote an `audit_event` for it.
  All five now log. Routine non-confirming status flips (start/complete an
  action item, mark a clarification asked, etc.) are deliberately left
  unaudited, matching the existing pattern elsewhere.
- Traceability checklist: verified `source_utterance_id` propagates
  end-to-end through `commitToCharter` (Decision/ActionItem/Clarification
  all carry it) and through `extractCandidates`'s candidate inserts. No
  gap found.
- Optimistic concurrency: implemented and verified against the real
  database (not just typechecked) on `updateKnowledgeNode` and
  `updateStoryDetail` — the two actions where a BA edits free-text content
  that another BA could be editing concurrently. `decision` has no
  equivalent direct-edit action yet (decisions are append-only via
  supersession, not edited in place), so there's nothing to retrofit there.
- Accessibility: added `role="alert"` / `role="status" aria-live="polite"`
  to every dynamic result/error panel (StoryChecker, StoryCheckPanel,
  AnalysisPanel, BrainstormPanel) so screen readers announce outcomes
  without a page reload.
  **Automated WCAG 2.1 A/AA scan, done later** (`tests/e2e/accessibility.spec.ts`):
  this environment has no screen reader to drive a manual AT walkthrough,
  but it does have a real Chromium via Playwright, which is enough to run
  axe-core (the same engine behind Lighthouse/Deque's own tooling)
  against every major authenticated page (seeded with one of nearly every
  entity type, so empty-state markup doesn't hide real structural issues)
  plus the public sign-in/forgot-password/reset-password/minutes-ack
  pages. Found and fixed 7 real violations on the first run: an empty-state
  `<div>` as a direct, non-`<li>` child of a `<ul>` (delivery partners); four
  unlabeled form controls — a date input, a title input, and three
  `<select>`s across clarifications/epics (and the same pattern proactively
  fixed on the story detail page's status-gated link forms, which the seed
  data's Draft-status story didn't happen to trigger); and one color-contrast
  miss (4.46:1 vs 4.5:1 required) on a red text button sitting directly on
  `--background` instead of inside a `<Card>` (`--surface`) like every other
  red text button in the app — darkened to `red-700` for that one case.
  Zero violations on re-scan. **What this genuinely doesn't cover**: real
  screen reader behavior (NVDA/JAWS/VoiceOver announcement quality — ARIA
  correctness is necessary but not sufficient for that), true keyboard-only
  walkthroughs by a human, and cognitive/plain-language review — axe-core
  catches what's mechanically detectable, not the full WCAG 2.1 AA
  standard. That gap is real and is for a human with actual AT to close,
  not something to claim done here.
- Workspace load-time budget: existing indexes (`idx_action_item_owner_status`,
  `idx_clarification_chasing_status`, etc.) already cover the per-user
  filters the workspace queries use; RLS narrows every query to the
  caller's own member projects before those filters even apply, so no new
  index was needed at this scale.

---

## EPIC 17 — Retention & Purge — ✅ implemented (Phase 9)
**Traces to:** §7 Security.

- Scheduled purge job: `interaction`/`utterance` rows past `purge_after` are
  anonymised — content columns redacted, structural rows retained (resolved
  decision, `EXECUTION_PLAN.md` §3.G) — **M**
- Manual purge-on-request flow, same anonymise semantics — **S**
- Anonymise rather than delete specifically so trace links and audit history
  referencing a purged interaction never dangle — **M**

**Depends on:** EPIC 3, EPIC 0 (scheduler).

`src/jobs/handlers/retentionPurge.ts` implements both halves against the
`purge_after`/`is_purged` columns already on `interaction` from Phase 0:
`handleRetentionPurge` (the scheduled sweep, wired into the daily cron
alongside the other sweeps) and `purgeInteraction` (the shared redaction
logic, also called directly by the manual "Purge now" action, Lead-BA-gated,
on the interaction detail page). Verified against the real database that
the due-query correctly includes/excludes rows by `purge_after`/`is_purged`
and that redaction leaves the structural row and FK-referencing rows intact.

---

## EPIC 18 — Delivery Partners — ✅ implemented

**Why:** Requested standalone of the original requirements/BA domain — tracks
real-world delivery/logistics vendors per project, not project-delivery
("Delivery Team Member" the role, or "delivery" of stories/epics) which
already exist elsewhere in the app under different names.

- `delivery_partner`: per-project vendor master data with a `priority_order`
  the app renumbers on reorder (migration `0016`) — configured, reordered
  (up/down), and deactivated/deleted from the new "Delivery partners" tab
  (`projects/[id]/delivery`).
- `delivery`: one delivery per recipient; on creation it's auto-assigned to
  the first active partner in priority order. Lifecycle: Pending → Assigned
  → InTransit → Delivered, with Failed as the terminal state when every
  active partner has been tried.
- `delivery_attempt`: full per-partner history for one delivery, since
  fallback can cycle through several partners — this is what per-partner
  analytics aggregate over (a partner's record must reflect every attempt
  it actually handled, not just deliveries that ended with it).
- Fallback routing: "Partner declined / failed" on the delivery's current
  attempt advances to the next active partner by `priority_order`, or marks
  the delivery Failed if none remain. Shared between that manual action and
  the automatic path below via `src/lib/delivery/assignNextPartner.ts`, so
  both land on identical state.
- Automatic SLA-timeout fallback (migration `0017`): `delivery_partner.sla_hours`
  is per-partner (one vendor might promise 2-hour pickup, another next-day),
  null means manual-only. `sweep_delivery_timeout`
  (`src/jobs/handlers/sweepDeliveryTimeout.ts`), wired into the same daily
  cron as the other sweeps, declines any attempt whose partner has an
  `sla_hours` set and `assigned_at + sla_hours` has passed, then falls back
  through `assignNextPartner` — same outcome as a human clicking decline,
  logged as an `Escalated` audit event. No extra idempotency flag needed:
  falling back changes `assigned_at` to the new attempt's timestamp, so the
  same delivery won't match the sweep's own query again until that new
  attempt's own SLA elapses.
- Per-partner analytics on the same page: volume handled (attempt count),
  success rate (Delivered ÷ (Delivered + Declined) among resolved
  attempts), average turnaround (resolved_at − assigned_at on Delivered
  attempts), and delivered spend (sum of `delivery.cost` for deliveries
  this partner completed) — computed in-page from `delivery_attempt`/
  `delivery` rows, same small-scale-aggregation-in-JS style as `coverage_score`
  elsewhere rather than a materialized view.
- RLS: same project-membership floor as every other table (`delivery_partner`,
  `delivery` directly; `delivery_attempt` one join away via `delivery_id`,
  same pattern as `utterance`/`acceptance_criterion`).

---

## EPIC 19 — Project Chat (RAG) & Sidebar Navigation — ✅ implemented

**Why:** Requested directly — a ChatGPT-style conversational interface as the
project's main screen, answerable from everything in the project (not just
the 4 types EPIC 10 originally embedded), with every tab reachable from a
persistent left sidebar instead of the old hub-page card grid.

- **Sidebar restructure**: new `projects/[id]/layout.tsx` renders a
  persistent left `<nav>` (`ProjectSidebarNav.tsx`, active-tab highlighting
  via `usePathname()`) across every project tab. The old hub page
  (`projects/[id]/page.tsx`) is now the Chat page itself; its Members
  section and Embedding-model config became their own routes,
  `projects/[id]/members` and `projects/[id]/settings`.
- **Retrieval widened** (migration `0023`, see EPIC 10 above): Epic,
  ActionItem, Clarification, ChangeRequest, Guardrail, and the new Document
  type all gained an `embedding` column and a `search_project_embeddings`
  union arm. `enqueueEmbedding` calls added at every create/update write
  point for the 5 newly-embeddable domain types (`epics/actions.ts`,
  `changes/actions.ts`, `guardrails/actions.ts`, `clarifications/actions.ts`,
  and the Meeting Ingestion commit path in `minutes-actions.ts` — the latter
  two previously had no embedding call at all for ActionItem/Clarification).
- **Document upload** (migration `0022`): a private Supabase Storage bucket
  (`project-documents`, path convention `{project_id}/{document_id}/
  {file_name}`, RLS checking the first path segment against
  `project_member`) plus a `project_document` table. `.txt`/`.md` read
  directly; `.pdf` via `pdf-parse` (v2's `PDFParse` class API, not the old
  v1 function-style API); `.docx` via `mammoth` — `src/lib/documents/
  extractText.ts`. Extraction runs synchronously in the upload action
  (`documents-actions.ts`) so a bad file fails loudly immediately rather
  than silently in the background job queue; embedding itself still goes
  through the async `embed_object` job like everything else.
- **Chat**: one shared conversation per project (not private per user) —
  `project_chat_message` (migration `0022`), insert/select-only like
  `audit_event`. `src/app/api/projects/[id]/chat/route.ts` (a Route
  Handler, not a Server Action — Next.js only supports returning an
  arbitrary streaming `Response` from the former) retrieves via the same
  `searchProject` every tab uses, builds a RAG system prompt
  (`src/lib/ai/projectChat.ts`), resolves the asking user's own BYOK model
  (`resolveUserLanguageModel`, EPIC 4's helper — no new provider plumbing),
  and streams the answer back via the `ai` SDK's `streamText` +
  `toUIMessageStream`/`createUIMessageStreamResponse` (the client posts the
  full running conversation each turn — see `ChatPanel.tsx` — so the route
  never re-reads history from the database itself, only the initial
  page load does, via `dbRowsToUIMessages`). Client side: `@ai-sdk/react`'s
  `useChat` (a separate package from `ai` in this installed version — not
  previously a dependency).
- Real LLM-generation round trips aren't covered by automated tests, same
  as every other BYOK AI feature (extraction, guardrails, change analysis)
  — verify manually. `tests/e2e/project-chat.spec.ts` covers sidebar
  navigation, document upload (success and unsupported-type paths), and
  the chat route's auth/membership guards (401/403), all of which don't
  require a real model call.

**Depends on:** EPIC 4 (BYOK model resolution), EPIC 10 (retrieval).
