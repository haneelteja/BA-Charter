# BA Charter — Application Requirements

## 1. Application overview

BA Charter is an internal platform for Business Analysts. It ingests raw project
communication (meeting transcripts, emails, chat), converts it into confirmed
decisions and action items, maintains a living charter for each project, and
produces delivery artifacts — minutes of meeting, epics, user stories and change
impact analysis.

The platform is project-scoped. A Business Analyst may work on many projects, and a
project may have many Business Analysts. All requirement content, decisions and
artifacts belong to exactly one project.

Backlog artifacts are created and managed in Pega Agile Studio. BA Charter is the
authoring and reasoning layer; Agile Studio is the delivery system of record.

### Primary business goals

- Remove manual effort in writing minutes of meeting and chasing action items
- Guarantee every user story traces back to a confirmed decision and its source
- Maintain an accurate, queryable charter describing what each application does
- Detect gaps, contradictions and open questions before development begins
- Keep requirement language consistent across analysts and projects

### Out of scope for release one

- Client or external stakeholder login
- Automated code generation
- Test case management
- Time tracking and resource costing

---

## 2. Personas

### Business Analyst
Primary user. Uploads meeting transcripts and emails, confirms extracted decisions
and action items, authors epics and user stories, raises clarifications, and
responds to change requests. Works across multiple projects concurrently.

### Lead Business Analyst
All Business Analyst abilities, plus: resolves contradictions in the project
charter, approves user stories for publication to Agile Studio, approves
minutes of meeting for distribution, and manages the project glossary and
guardrail rules.

### Delivery Team Member
Read access to published stories and project overview. Receives distributed minutes
of meeting and notification of change impacts. Does not author content.

### Project Administrator
Creates projects, manages project membership and roles, configures integrations,
and manages retention settings.

---

## 3. Case types

### 3.1 Project Setup

Purpose: establish a project workspace and its initial charter.

Stages and steps:

1. **Initiate**
   - Capture project name, client name, description, start date
   - Assign Lead Business Analyst
   - Select delivery target (Agile Studio project reference)
2. **Seed**
   - Upload existing requirement documents (optional)
   - Import existing backlog from Agile Studio (optional)
   - Import glossary terms (optional)
3. **Configure**
   - Add project members and assign roles
   - Enable meeting and mailbox integrations
   - Set retention period for source material
4. **Activate**
   - Lead Business Analyst confirms setup
   - Project becomes available in workspace switcher

### 3.2 Meeting Ingestion

Purpose: turn a raw meeting record into confirmed decisions, action items and
distributed minutes. This is the most frequently executed case type.

Stages and steps:

1. **Capture**
   - Receive source: uploaded transcript, uploaded email, connected meeting
     platform, or forwarded mail
   - Normalise into a single Interaction record
   - Map speakers to project members
   - Index content for retrieval
2. **Extract**
   - Generate candidate decisions, action items, open questions, risks and
     change signals
   - Attach a source reference and confidence score to every candidate
   - Detect contradictions against existing confirmed knowledge
3. **Confirm**
   - Business Analyst reviews the candidate list
   - High confidence items are pre-accepted and may be reverted
   - Low confidence and contradicting items require explicit decision
   - Business Analyst may edit, merge, split, reassign or reject any candidate
   - Case cannot advance while contradictions remain unresolved
4. **Publish minutes**
   - Generate minutes of meeting from confirmed content only
   - Business Analyst reviews and edits
   - Lead Business Analyst approves
   - Distribute by email to attendees and distribution list
5. **Commit to charter**
   - Write decisions into the project charter as Provisional
   - Decisions become Confirmed when an attendee acknowledges the minutes, or
     automatically once the acknowledgement window lapses without dispute
   - A dispute raised within the window reverts the affected decisions to
     Candidate and reopens the Confirm stage
   - Provisional decisions may be used for drafting but not for publication
   - Create Clarification and Action Item child cases
   - Mark superseded decisions
   - Record attribution and version

Service level: minutes of meeting drafted within fifteen minutes of source upload.

### 3.3 Action Item

Purpose: track a single committed task through to completion.

Stages and steps:

1. **Assign** — owner, due date, priority, source reference
2. **In progress** — owner updates status and adds notes
3. **Complete** — owner records outcome
4. **Verify** — raising Business Analyst confirms closure

Routing: to the assigned owner's worklist. Escalates to the Lead Business Analyst
when overdue.

### 3.4 Clarification Item

Purpose: track an open question through to a confirmed answer.

Stages and steps:

1. **Raise**
   - Capture question, affected functional area, why it matters
   - Classify audience: client, internal architect, internal business, delivery team
   - Assign a chasing Business Analyst
2. **Prepare**
   - Item becomes available in call preparation views for its audience
   - Related open items are grouped by topic
3. **Ask**
   - Raised in a call, or sent by email
   - Record channel and date asked
4. **Answer**
   - Capture the answer and who gave it
   - Answer is treated as a candidate decision
5. **Confirm**
   - Business Analyst confirms the answer
   - Answer is written to the project charter
   - Dependent stories and change requests are notified

Ageing: items unanswered beyond a configurable threshold are flagged in the
workspace and reported to the Lead Business Analyst.

### 3.5 Epic Definition

Purpose: group related confirmed decisions into a deliverable capability.

Stages and steps:

1. **Draft** — title, business objective, affected functional areas, in and out of scope
2. **Link** — attach source decisions and charter nodes
3. **Review** — Lead Business Analyst reviews completeness
4. **Publish** — create or update the corresponding Agile Studio epic

### 3.6 User Story Authoring

Purpose: produce a delivery-ready user story under a guided, consistent structure.

Stages and steps:

1. **Frame**
   - Parent epic, actor, goal, business value
   - Starting point and trigger
   - End point and success outcome
2. **Detail**
   - Prerequisites and dependencies on other stories
   - Description
   - Acceptance criteria in Given / When / Then form
   - Non functional requirements: performance, security, accessibility, audit
   - Assumptions and explicit exclusions
3. **Check**
   - Automated guardrail evaluation against project glossary, banned terms,
     preferred sentence patterns and story template
   - Completeness check for negative paths, error handling, permissions and
     data migration
   - Duplicate detection against existing stories
   - Business Analyst resolves or accepts each finding
4. **Review**
   - Peer Business Analyst or Lead Business Analyst reviews
   - Comments are captured against specific fields
   - Reviewer approves or returns for rework
   - A returned story moves to Returned For Rework and re-enters the Check stage
5. **Publish**
   - Create or update the Agile Studio story
   - Record the link between platform story and Agile Studio story

Every published story must carry at least one trace link to a confirmed decision.
Publication is blocked where no link exists.

### 3.7 Change Request Analysis

Purpose: understand the full consequence of a requested change before it is accepted.

Stages and steps:

1. **Intake**
   - Capture request description, requester, source reference, urgency
2. **Analyse**
   - Traverse the charter and trace links to identify affected functional
     areas, business rules, epics and published stories
   - Identify undefined areas: missing acceptance criteria, unspecified error
     paths, absent non functional requirements, undefined permissions, absent
     data migration handling
   - Identify contradictions with existing confirmed decisions, citing both sides
   - Report knowledge coverage confidence for each affected area
3. **Brainstorm**
   - Present a prioritised question list, grouped by who can answer it
   - Business Analyst adds, removes and reprioritises questions
   - Selected questions are raised as Clarification Item cases
4. **Decide**
   - Accept, defer to a later release, or reject
   - Record the rationale
5. **Propagate**
   - Generate proposed edits to affected stories and epics
   - Business Analyst approves each edit individually
   - Update Agile Studio items
   - Notify affected delivery team members by email

### 3.8 Charter Update

Purpose: maintain the project charter, the structured definition of what the
application does.

The charter has four layers:

1. **System overview** — purpose, actors, systems in scope, boundaries
2. **Functional areas** — modules, user journeys, major capabilities
3. **Capabilities and rules** — behaviour, validation rules, business logic
4. **Implementation notes** — integrations, technical constraints, data handling

Rules:

- Only confirmed content may be written to the model
- Every node is versioned with author, timestamp and source reference
- A new entry contradicting an existing entry raises a conflict rather than
  overwriting it
- Only the Lead Business Analyst may resolve a conflict
- Each functional area carries a coverage indicator showing how well the charter
  covers it

---

## 4. Cross-project workspace

A personal workspace spanning every project the user is a member of.

- **My action items** — all open actions assigned to the user, with source links
- **My clarifications** — open questions the user is chasing, with ageing
- **Awaiting my confirmation** — extracted candidates pending review
- **Awaiting my review** — stories submitted for peer or lead review
- **Call preparation** — select a stakeholder or client and the workspace assembles
  every open clarification directed at that party, grouped by topic, with context
  and reason. Used as a meeting agenda.

Item titles are visible across projects. Full context opens within the owning
project workspace, subject to project membership.

---

## 5. Data objects

- **Project** — workspace root, holds all content
- **Project Member** — user and role within a project
- **Interaction** — a normalised source record: transcript, email, chat or note
- **Utterance** — an addressable segment of an Interaction, used for source references
- **Decision** — a confirmed statement of intent, with supersession links
- **Action Item** — a committed task with an owner and due date
- **Clarification** — an open question with an audience and chasing owner
- **Charter Entry** — an entry in one of the four charter layers
- **Epic** — a deliverable capability
- **User Story** — a delivery-ready requirement
- **Acceptance Criterion** — a Given / When / Then clause belonging to a story
- **Change Request** — a requested change and its analysis
- **Trace Link** — a typed edge between any two objects, carrying a source reference
- **Glossary Term** — project vocabulary with preferred and banned forms
- **Guardrail Rule** — a language or structure rule applied at authoring time
- **Minutes Document** — a generated, approved and distributed meeting record
- **Release** — a named delivery increment that epics, stories and change requests
  are targeted at
- **Review** — a review event with comments and an outcome

---

## 6. Integrations

### Inbound

- **Meeting platform connector** — retrieve transcripts and meeting metadata
- **Note taking connector** — retrieve meeting notes and summaries
- **Mailbox connector** — receive forwarded project email
- **Manual upload** — transcript, email and document files

### Processing services

- **Extraction service** — produce candidate decisions, actions, questions and
  risks from an Interaction, each with a confidence score and source reference
- **Retrieval service** — semantic search over project history and charter
- **Analysis service** — change impact traversal and gap identification

### Outbound

- **Email distribution** — minutes of meeting, clarification requests, change notifications
- **Agile Studio** — create and update epics and stories, read status back. Agile
  Studio runs on the same platform, so this is a direct object reference rather than
  an external service call. No synchronisation layer is required.
- **Document export** — minutes and requirement packs

---

## 7. Non functional requirements

- **Security** — project data is visible only to project members. Source transcripts
  carry a configurable retention period and are purgeable on request.
- **Auditability** — every confirmation, approval, publication and model change is
  recorded with actor, timestamp and prior value.
- **Traceability** — every generated statement retains a reference to the utterance
  it derived from. No generated content is published without a human approval event.
- **Performance** — extraction completes within fifteen minutes for a ninety minute
  transcript. Workspace views load within three seconds.
- **Accessibility** — authoring and review screens meet WCAG 2.1 AA.
- **Concurrency** — two analysts editing the same story is detected and surfaced;
  edits are never silently discarded.

---

## 8. Key business rules

1. No content enters the charter without an explicit human confirmation event.
2. A decision that contradicts a confirmed decision must be resolved by a Lead
   Business Analyst before either can be used downstream.
3. Decisions derived from distributed minutes are Provisional until acknowledged or
   until the acknowledgement window lapses. Provisional decisions may inform drafts
   but cannot support publication of a story to Agile Studio.
4. Minutes disputed within the acknowledgement window revert their decisions to
   Candidate and reopen the meeting case at the Confirm stage.
5. A user story cannot be published to Agile Studio without at least one trace link
   to a confirmed decision.
6. Story status, sprint assignment and story points are owned by Agile Studio and
   are never overwritten by the platform.
7. Description, acceptance criteria and business context are owned by the platform.
8. Action items and clarifications must resolve to a named person.
9. A change request may not be closed while it has unanswered clarifications marked
   as blocking.
