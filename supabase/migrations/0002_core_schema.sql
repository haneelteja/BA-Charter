-- Core domain schema, translated from Requirements/ba-workbench-schema.sql.
--
-- Translation rules applied uniformly:
--   VARCHAR(36) id columns            -> uuid, default gen_random_uuid() on PKs
--   TIMESTAMP                         -> timestamptz
--   status comments ("-- Open, ...")  -> explicit CHECK constraints
--   missing created_at                -> added for audit/sort consistency
--   app_user.user_id                  -> same id as auth.users(id), not a separate uuid
--
-- Embedding columns (vector(1536)) are added directly on the tables EPIC 10
-- needs to index, rather than a side table, since one row = one embeddable
-- unit for all of them. 1536 matches OpenAI's text-embedding-3-small; revisit
-- if a project's configured embedding provider uses a different dimension
-- (EPIC 10 §3.C note: embedding model is fixed per project).

-- app_user mirrors auth.users 1:1. Row is created by the handle_new_user
-- trigger in 0006_auth_sync.sql, not inserted directly by application code.
create table app_user (
    user_id               uuid         not null,
    full_name             varchar(200) not null,
    email                 varchar(200) not null,
    is_active             boolean      default true,
    created_at            timestamptz  not null default now(),
    primary key (user_id),
    foreign key (user_id) references auth.users(id) on delete cascade
);

create table project (
    project_id            uuid         not null default gen_random_uuid(),
    project_name          varchar(200) not null,
    client_name           varchar(200),
    description           varchar(2000),
    status                varchar(30)  not null check (status in ('Setup', 'Active', 'OnHold', 'Closed')),
    lead_ba_id            uuid,
    agile_studio_ref      varchar(100),
    retention_days        int          default 365,
    mom_ack_window_hours  int          default 48,
    confidence_threshold  numeric(4,3) default 0.800,
    embedding_provider    varchar(60),
    start_date            date,
    created_at            timestamptz  not null default now(),
    primary key (project_id),
    foreign key (lead_ba_id) references app_user(user_id)
);

create table project_member (
    member_id             uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    user_id               uuid         not null,
    role_name             varchar(40)  not null check (role_name in ('BusinessAnalyst', 'LeadBA', 'DeliveryMember', 'Administrator')),
    joined_at             timestamptz  not null default now(),
    primary key (member_id),
    unique (project_id, user_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (user_id)    references app_user(user_id) on delete cascade
);

create table stakeholder (
    stakeholder_id        uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    full_name             varchar(200) not null,
    email                 varchar(200),
    organisation          varchar(200),
    is_client_side        boolean      default false,
    created_at            timestamptz  not null default now(),
    primary key (stakeholder_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create table interaction (
    interaction_id        uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    source_type           varchar(40)  not null check (source_type in ('Transcript', 'Email', 'Chat', 'ManualNote', 'Document')),
    source_system         varchar(60),
    title                 varchar(300),
    occurred_at           timestamptz,
    ingested_at           timestamptz  not null default now(),
    ingested_by           uuid,
    raw_file_ref          varchar(500),
    processing_status     varchar(30)  not null check (processing_status in ('Received', 'Indexed', 'Extracted', 'Confirmed', 'Failed')),
    purge_after           date,
    is_purged             boolean      not null default false,
    primary key (interaction_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (ingested_by) references app_user(user_id)
);

create table utterance (
    utterance_id          uuid         not null default gen_random_uuid(),
    interaction_id        uuid         not null,
    sequence_no           int          not null,
    speaker_label         varchar(200),
    speaker_user_id       uuid,
    speaker_stakeholder_id uuid,
    start_offset_sec      int,
    content               varchar(4000),
    embedding             vector(1536),
    primary key (utterance_id),
    foreign key (interaction_id) references interaction(interaction_id) on delete cascade,
    foreign key (speaker_user_id) references app_user(user_id),
    foreign key (speaker_stakeholder_id) references stakeholder(stakeholder_id)
);

create table knowledge_node (
    knowledge_node_id     uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    layer                 varchar(40)  not null check (layer in ('SystemOverview', 'FunctionalArea', 'CapabilityRule', 'ImplementationNote')),
    parent_node_id        uuid,
    title                 varchar(300) not null,
    body                  varchar(4000),
    coverage_score        numeric(4,3),
    status                varchar(30)  not null check (status in ('Active', 'InConflict', 'Retired')),
    version_no            int          default 1,
    embedding             vector(1536),
    last_confirmed_by     uuid,
    last_confirmed_at     timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (knowledge_node_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (parent_node_id) references knowledge_node(knowledge_node_id),
    foreign key (last_confirmed_by) references app_user(user_id)
);

create table decision (
    decision_id           uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    statement             varchar(2000) not null,
    rationale             varchar(2000),
    functional_area_id    uuid,
    status                varchar(30)  not null check (status in ('Candidate', 'Provisional', 'Confirmed', 'Superseded', 'Rejected', 'Disputed')),
    confidence_score      numeric(4,3),
    supersedes_id         uuid,
    superseded_by_id      uuid,
    source_utterance_id   uuid,
    confirmed_by          uuid,
    confirmed_at          timestamptz,
    version_no            int          default 1,
    embedding             vector(1536),
    created_at            timestamptz  not null default now(),
    primary key (decision_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (source_utterance_id) references utterance(utterance_id),
    foreign key (functional_area_id) references knowledge_node(knowledge_node_id),
    foreign key (supersedes_id) references decision(decision_id),
    foreign key (superseded_by_id) references decision(decision_id),
    foreign key (confirmed_by) references app_user(user_id)
);

create table knowledge_conflict (
    conflict_id           uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    knowledge_node_id     uuid         not null,
    incoming_decision_id  uuid,
    existing_decision_id  uuid,
    description           varchar(2000),
    status                varchar(30)  not null check (status in ('Open', 'Resolved')),
    resolved_by           uuid,
    resolution_note       varchar(2000),
    resolved_at           timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (conflict_id),
    foreign key (knowledge_node_id) references knowledge_node(knowledge_node_id) on delete cascade,
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (incoming_decision_id) references decision(decision_id),
    foreign key (existing_decision_id) references decision(decision_id),
    foreign key (resolved_by) references app_user(user_id)
);

create table action_item (
    action_item_id        uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    title                 varchar(300) not null,
    detail                varchar(2000),
    owner_user_id         uuid,
    owner_stakeholder_id  uuid,
    raised_by             uuid,
    due_date              date,
    priority              varchar(20)  check (priority in ('Low', 'Medium', 'High', 'Critical')),
    status                varchar(30)  not null check (status in ('Open', 'InProgress', 'Completed', 'Verified', 'Cancelled')),
    source_utterance_id   uuid,
    completed_at          timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (action_item_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (owner_user_id) references app_user(user_id),
    foreign key (owner_stakeholder_id) references stakeholder(stakeholder_id),
    foreign key (raised_by) references app_user(user_id),
    foreign key (source_utterance_id) references utterance(utterance_id),
    constraint action_item_has_owner check (owner_user_id is not null or owner_stakeholder_id is not null)
);

create table clarification (
    clarification_id      uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    question              varchar(2000) not null,
    why_it_matters        varchar(2000),
    audience_type         varchar(40)  not null check (audience_type in ('Client', 'Architect', 'InternalBusiness', 'DeliveryTeam')),
    audience_stakeholder_id uuid,
    chasing_user_id       uuid not null,
    functional_area_id    uuid,
    is_blocking           boolean      default false,
    status                varchar(30)  not null check (status in ('Raised', 'Prepared', 'Asked', 'Answered', 'Confirmed', 'Withdrawn')),
    asked_channel         varchar(40),
    asked_on              date,
    answer_text           varchar(2000),
    answered_by           varchar(200),
    answered_on           date,
    resulting_decision_id uuid,
    source_utterance_id   uuid,
    raised_at             timestamptz  not null default now(),
    primary key (clarification_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (audience_stakeholder_id) references stakeholder(stakeholder_id),
    foreign key (chasing_user_id) references app_user(user_id),
    foreign key (functional_area_id) references knowledge_node(knowledge_node_id),
    foreign key (resulting_decision_id) references decision(decision_id),
    foreign key (source_utterance_id) references utterance(utterance_id)
);

create table release (
    release_id            uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    release_name          varchar(100) not null,
    target_date           date,
    status                varchar(30)  check (status in ('Planned', 'InProgress', 'Released', 'Cancelled')),
    created_at            timestamptz  not null default now(),
    primary key (release_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create table epic (
    epic_id               uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    title                 varchar(300) not null,
    business_objective    varchar(2000),
    in_scope              varchar(2000),
    out_of_scope          varchar(2000),
    status                varchar(30)  not null check (status in ('Draft', 'InReview', 'Approved', 'Published')),
    release_id            uuid,
    agile_studio_ref      varchar(100),
    created_by            uuid,
    created_at            timestamptz  not null default now(),
    primary key (epic_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (created_by) references app_user(user_id),
    foreign key (release_id) references release(release_id)
);

create table user_story (
    user_story_id         uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    epic_id               uuid,
    title                 varchar(300) not null,
    actor                 varchar(200),
    goal                  varchar(500),
    business_value        varchar(1000),
    starting_point        varchar(1000),
    end_point             varchar(1000),
    prerequisites         varchar(2000),
    description           varchar(4000),
    assumptions           varchar(2000),
    exclusions            varchar(2000),
    nfr_performance       varchar(1000),
    nfr_security          varchar(1000),
    nfr_accessibility     varchar(1000),
    nfr_audit             varchar(1000),
    status                varchar(30)  not null check (status in ('Draft', 'GuardrailCheck', 'InReview', 'ReturnedForRework', 'Approved', 'Published', 'Deferred')),
    release_id            uuid,
    agile_studio_ref      varchar(100),
    guardrail_pass        boolean      default false,
    version_no            int          default 1,
    embedding             vector(1536),
    created_by            uuid,
    created_at            timestamptz  not null default now(),
    primary key (user_story_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (epic_id)    references epic(epic_id),
    foreign key (created_by) references app_user(user_id),
    foreign key (release_id) references release(release_id)
);

create table acceptance_criterion (
    criterion_id          uuid         not null default gen_random_uuid(),
    user_story_id         uuid         not null,
    sequence_no           int          not null,
    given_clause          varchar(1000),
    when_clause           varchar(1000),
    then_clause           varchar(1000),
    is_negative_path      boolean      default false,
    primary key (criterion_id),
    foreign key (user_story_id) references user_story(user_story_id) on delete cascade
);

create table story_dependency (
    dependency_id         uuid         not null default gen_random_uuid(),
    user_story_id         uuid         not null,
    depends_on_story_id   uuid         not null,
    dependency_type       varchar(40)  check (dependency_type in ('BlockedBy', 'RelatesTo', 'Duplicates')),
    created_at            timestamptz  not null default now(),
    primary key (dependency_id),
    foreign key (user_story_id)       references user_story(user_story_id) on delete cascade,
    foreign key (depends_on_story_id) references user_story(user_story_id) on delete cascade
);

create table change_request (
    change_request_id     uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    title                 varchar(300) not null,
    description           varchar(4000),
    requested_by          varchar(200),
    urgency               varchar(20),
    status                varchar(30)  not null check (status in ('Intake', 'Analysing', 'Brainstorm', 'Decision', 'Accepted', 'Deferred', 'Rejected', 'Propagated')),
    decision_rationale    varchar(2000),
    release_id            uuid,
    source_utterance_id   uuid,
    raised_at             timestamptz  not null default now(),
    primary key (change_request_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (release_id) references release(release_id),
    foreign key (source_utterance_id) references utterance(utterance_id)
);

create table impact_finding (
    finding_id            uuid         not null default gen_random_uuid(),
    change_request_id     uuid         not null,
    finding_type          varchar(40)  not null check (finding_type in ('Affected', 'Undefined', 'Contradiction', 'LowCoverage')),
    target_object_type    varchar(40),
    target_object_id      uuid,
    detail                varchar(2000),
    confidence_score      numeric(4,3),
    ba_disposition        varchar(30)  check (ba_disposition in ('Accepted', 'Dismissed', 'RaisedAsClarification')),
    created_at            timestamptz  not null default now(),
    primary key (finding_id),
    foreign key (change_request_id) references change_request(change_request_id) on delete cascade
);

create table trace_link (
    trace_link_id         uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    from_object_type      varchar(40)  not null,
    from_object_id        uuid         not null,
    to_object_type        varchar(40)  not null,
    to_object_id          uuid         not null,
    link_type             varchar(40)  not null check (link_type in ('DerivedFrom', 'Implements', 'Supersedes', 'Impacts', 'AnswersTo')),
    created_at            timestamptz  not null default now(),
    primary key (trace_link_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create table minutes_document (
    minutes_id            uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    interaction_id        uuid         not null,
    subject               varchar(300),
    body_html             varchar(4000),
    status                varchar(30)  not null check (status in ('Draft', 'InReview', 'Approved', 'Distributed', 'Disputed')),
    approved_by           uuid,
    distributed_at        timestamptz,
    dispute_note          varchar(2000),
    created_at            timestamptz  not null default now(),
    primary key (minutes_id),
    foreign key (interaction_id) references interaction(interaction_id) on delete cascade,
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (approved_by) references app_user(user_id)
);

create table minutes_recipient (
    recipient_id          uuid         not null default gen_random_uuid(),
    minutes_id            uuid         not null,
    email                 varchar(200) not null,
    acknowledged_at       timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (recipient_id),
    foreign key (minutes_id) references minutes_document(minutes_id) on delete cascade
);

create table glossary_term (
    term_id               uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    term                  varchar(200) not null,
    definition            varchar(2000),
    preferred_form        varchar(200),
    banned_forms          varchar(1000),
    created_at            timestamptz  not null default now(),
    primary key (term_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create table guardrail_rule (
    rule_id               uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    rule_type             varchar(40)  not null check (rule_type in ('Vocabulary', 'SentencePattern', 'StructureCheck', 'Completeness')),
    rule_name             varchar(200) not null,
    rule_expression       varchar(2000),
    severity              varchar(20)  check (severity in ('Info', 'Warning', 'Blocking')),
    is_active             boolean      default true,
    created_at            timestamptz  not null default now(),
    primary key (rule_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create table review (
    review_id             uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    target_object_type    varchar(40)  not null,
    target_object_id      uuid         not null,
    reviewer_user_id      uuid         not null,
    outcome               varchar(30)  check (outcome in ('Approved', 'ReturnedForRework', 'Pending')),
    comments              varchar(4000),
    reviewed_at           timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (review_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (reviewer_user_id) references app_user(user_id)
);

create table audit_event (
    audit_event_id        uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    actor_user_id         uuid,
    event_type            varchar(60)  not null check (event_type in ('Confirmed', 'Approved', 'Published', 'ModelUpdated', 'ConflictResolved', 'Created', 'Updated', 'Deleted', 'StatusChanged')),
    target_object_type    varchar(40),
    target_object_id      uuid,
    prior_value           jsonb,
    new_value             jsonb,
    occurred_at           timestamptz  not null default now(),
    primary key (audit_event_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (actor_user_id) references app_user(user_id)
);

-- Indexes for the access patterns every epic above depends on: project-scoped
-- lookups and owner/status worklists for the cross-project workspace (EPIC 13).
create index idx_project_member_user on project_member(user_id);
create index idx_interaction_project on interaction(project_id);
create index idx_utterance_interaction on utterance(interaction_id);
create index idx_decision_project_status on decision(project_id, status);
create index idx_action_item_owner_status on action_item(owner_user_id, status);
create index idx_clarification_chasing_status on clarification(chasing_user_id, status);
create index idx_knowledge_node_project_layer on knowledge_node(project_id, layer);
create index idx_epic_project_status on epic(project_id, status);
create index idx_user_story_project_status on user_story(project_id, status);
create index idx_user_story_epic on user_story(epic_id);
create index idx_change_request_project_status on change_request(project_id, status);
create index idx_trace_link_from on trace_link(from_object_type, from_object_id);
create index idx_trace_link_to on trace_link(to_object_type, to_object_id);
create index idx_audit_event_project on audit_event(project_id, occurred_at desc);
create index idx_review_target on review(target_object_type, target_object_id);
