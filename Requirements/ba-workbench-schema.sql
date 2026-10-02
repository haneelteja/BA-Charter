-- BA Workbench — data model
-- Target: relational schema for Pega Blueprint data object inference

CREATE TABLE project (
    project_id            VARCHAR(36)  NOT NULL,
    project_name          VARCHAR(200) NOT NULL,
    client_name           VARCHAR(200),
    description           VARCHAR(2000),
    status                VARCHAR(30)  NOT NULL,  -- Setup, Active, OnHold, Closed
    lead_ba_id            VARCHAR(36),
    agile_studio_ref      VARCHAR(100),
    retention_days        INT          DEFAULT 365,
    mom_ack_window_hours  INT          DEFAULT 48,
    start_date            DATE,
    created_at            TIMESTAMP    NOT NULL,
    PRIMARY KEY (project_id),
    FOREIGN KEY (lead_ba_id) REFERENCES app_user(user_id)
);

CREATE TABLE app_user (
    user_id               VARCHAR(36)  NOT NULL,
    full_name             VARCHAR(200) NOT NULL,
    email                 VARCHAR(200) NOT NULL,
    is_active             BOOLEAN      DEFAULT TRUE,
    PRIMARY KEY (user_id)
);

CREATE TABLE project_member (
    member_id             VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    user_id               VARCHAR(36)  NOT NULL,
    role_name             VARCHAR(40)  NOT NULL,  -- BusinessAnalyst, LeadBA, DeliveryMember, Administrator
    joined_at             TIMESTAMP,
    PRIMARY KEY (member_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (user_id)    REFERENCES app_user(user_id)
);

CREATE TABLE stakeholder (
    stakeholder_id        VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    full_name             VARCHAR(200) NOT NULL,
    email                 VARCHAR(200),
    organisation          VARCHAR(200),
    is_client_side        BOOLEAN      DEFAULT FALSE,
    PRIMARY KEY (stakeholder_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE interaction (
    interaction_id        VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    source_type           VARCHAR(40)  NOT NULL,  -- Transcript, Email, Chat, ManualNote, Document
    source_system         VARCHAR(60),
    title                 VARCHAR(300),
    occurred_at           TIMESTAMP,
    ingested_at           TIMESTAMP    NOT NULL,
    ingested_by           VARCHAR(36),
    raw_file_ref          VARCHAR(500),
    processing_status     VARCHAR(30)  NOT NULL,  -- Received, Indexed, Extracted, Confirmed, Failed
    purge_after           DATE,
    PRIMARY KEY (interaction_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE utterance (
    utterance_id          VARCHAR(36)  NOT NULL,
    interaction_id        VARCHAR(36)  NOT NULL,
    sequence_no           INT          NOT NULL,
    speaker_label         VARCHAR(200),
    speaker_user_id       VARCHAR(36),
    speaker_stakeholder_id VARCHAR(36),
    start_offset_sec      INT,
    content               VARCHAR(4000),
    PRIMARY KEY (utterance_id),
    FOREIGN KEY (interaction_id) REFERENCES interaction(interaction_id),
    FOREIGN KEY (speaker_user_id) REFERENCES app_user(user_id),
    FOREIGN KEY (speaker_stakeholder_id) REFERENCES stakeholder(stakeholder_id)
);

CREATE TABLE decision (
    decision_id           VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    statement             VARCHAR(2000) NOT NULL,
    rationale             VARCHAR(2000),
    functional_area_id    VARCHAR(36),
    status                VARCHAR(30)  NOT NULL,  -- Candidate, Provisional, Confirmed, Superseded, Rejected, Disputed
    confidence_score      DECIMAL(4,3),
    supersedes_id         VARCHAR(36),
    superseded_by_id      VARCHAR(36),
    source_utterance_id   VARCHAR(36),
    confirmed_by          VARCHAR(36),
    confirmed_at          TIMESTAMP,
    version_no            INT          DEFAULT 1,
    PRIMARY KEY (decision_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (source_utterance_id) REFERENCES utterance(utterance_id),
    FOREIGN KEY (functional_area_id) REFERENCES knowledge_node(knowledge_node_id),
    FOREIGN KEY (supersedes_id) REFERENCES decision(decision_id),
    FOREIGN KEY (superseded_by_id) REFERENCES decision(decision_id),
    FOREIGN KEY (confirmed_by) REFERENCES app_user(user_id)
);

CREATE TABLE action_item (
    action_item_id        VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    title                 VARCHAR(300) NOT NULL,
    detail                VARCHAR(2000),
    owner_user_id         VARCHAR(36),
    owner_stakeholder_id  VARCHAR(36),
    raised_by             VARCHAR(36),
    due_date              DATE,
    priority              VARCHAR(20),            -- Low, Medium, High, Critical
    status                VARCHAR(30)  NOT NULL,  -- Open, InProgress, Completed, Verified, Cancelled
    source_utterance_id   VARCHAR(36),
    completed_at          TIMESTAMP,
    PRIMARY KEY (action_item_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (owner_user_id) REFERENCES app_user(user_id),
    FOREIGN KEY (owner_stakeholder_id) REFERENCES stakeholder(stakeholder_id),
    FOREIGN KEY (raised_by) REFERENCES app_user(user_id),
    FOREIGN KEY (source_utterance_id) REFERENCES utterance(utterance_id)
);

CREATE TABLE clarification (
    clarification_id      VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    question              VARCHAR(2000) NOT NULL,
    why_it_matters        VARCHAR(2000),
    audience_type         VARCHAR(40)  NOT NULL,  -- Client, Architect, InternalBusiness, DeliveryTeam
    audience_stakeholder_id VARCHAR(36),
    chasing_user_id       VARCHAR(36),
    functional_area_id    VARCHAR(36),
    is_blocking           BOOLEAN      DEFAULT FALSE,
    status                VARCHAR(30)  NOT NULL,  -- Raised, Prepared, Asked, Answered, Confirmed, Withdrawn
    asked_channel         VARCHAR(40),
    asked_on              DATE,
    answer_text           VARCHAR(2000),
    answered_by           VARCHAR(200),
    answered_on           DATE,
    resulting_decision_id VARCHAR(36),
    source_utterance_id   VARCHAR(36),
    raised_at             TIMESTAMP,
    PRIMARY KEY (clarification_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (audience_stakeholder_id) REFERENCES stakeholder(stakeholder_id),
    FOREIGN KEY (chasing_user_id) REFERENCES app_user(user_id),
    FOREIGN KEY (functional_area_id) REFERENCES knowledge_node(knowledge_node_id),
    FOREIGN KEY (resulting_decision_id) REFERENCES decision(decision_id)
);

CREATE TABLE knowledge_node (
    knowledge_node_id     VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    layer                 VARCHAR(40)  NOT NULL,  -- SystemOverview, FunctionalArea, CapabilityRule, ImplementationNote
    parent_node_id        VARCHAR(36),
    title                 VARCHAR(300) NOT NULL,
    body                  VARCHAR(4000),
    coverage_score        DECIMAL(4,3),
    status                VARCHAR(30)  NOT NULL,  -- Active, InConflict, Retired
    version_no            INT          DEFAULT 1,
    last_confirmed_by     VARCHAR(36),
    last_confirmed_at     TIMESTAMP,
    PRIMARY KEY (knowledge_node_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (parent_node_id) REFERENCES knowledge_node(knowledge_node_id),
    FOREIGN KEY (last_confirmed_by) REFERENCES app_user(user_id)
);

CREATE TABLE knowledge_conflict (
    conflict_id           VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    knowledge_node_id     VARCHAR(36)  NOT NULL,
    incoming_decision_id  VARCHAR(36),
    existing_decision_id  VARCHAR(36),
    description           VARCHAR(2000),
    status                VARCHAR(30)  NOT NULL,  -- Open, Resolved
    resolved_by           VARCHAR(36),
    resolution_note       VARCHAR(2000),
    resolved_at           TIMESTAMP,
    PRIMARY KEY (conflict_id),
    FOREIGN KEY (knowledge_node_id) REFERENCES knowledge_node(knowledge_node_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (incoming_decision_id) REFERENCES decision(decision_id),
    FOREIGN KEY (existing_decision_id) REFERENCES decision(decision_id)
);

CREATE TABLE release (
    release_id            VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    release_name          VARCHAR(100) NOT NULL,
    target_date           DATE,
    status                VARCHAR(30),            -- Planned, InProgress, Released, Cancelled
    PRIMARY KEY (release_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE epic (
    epic_id               VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    title                 VARCHAR(300) NOT NULL,
    business_objective    VARCHAR(2000),
    in_scope              VARCHAR(2000),
    out_of_scope          VARCHAR(2000),
    status                VARCHAR(30)  NOT NULL,  -- Draft, InReview, Approved, Published
    release_id            VARCHAR(36),
    agile_studio_ref      VARCHAR(100),
    created_by            VARCHAR(36),
    created_at            TIMESTAMP,
    PRIMARY KEY (epic_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (created_by) REFERENCES app_user(user_id),
    FOREIGN KEY (release_id) REFERENCES release(release_id)
);

CREATE TABLE user_story (
    user_story_id         VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    epic_id               VARCHAR(36),
    title                 VARCHAR(300) NOT NULL,
    actor                 VARCHAR(200),
    goal                  VARCHAR(500),
    business_value        VARCHAR(1000),
    starting_point        VARCHAR(1000),
    end_point             VARCHAR(1000),
    prerequisites         VARCHAR(2000),
    description           VARCHAR(4000),
    assumptions           VARCHAR(2000),
    exclusions            VARCHAR(2000),
    nfr_performance       VARCHAR(1000),
    nfr_security          VARCHAR(1000),
    nfr_accessibility     VARCHAR(1000),
    nfr_audit             VARCHAR(1000),
    status                VARCHAR(30)  NOT NULL,  -- Draft, GuardrailCheck, InReview, ReturnedForRework, Approved, Published, Deferred
    release_id            VARCHAR(36),
    agile_studio_ref      VARCHAR(100),
    guardrail_pass        BOOLEAN      DEFAULT FALSE,
    version_no            INT          DEFAULT 1,
    created_by            VARCHAR(36),
    created_at            TIMESTAMP,
    PRIMARY KEY (user_story_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (epic_id)    REFERENCES epic(epic_id),
    FOREIGN KEY (created_by) REFERENCES app_user(user_id),
    FOREIGN KEY (release_id) REFERENCES release(release_id)
);

CREATE TABLE acceptance_criterion (
    criterion_id          VARCHAR(36)  NOT NULL,
    user_story_id         VARCHAR(36)  NOT NULL,
    sequence_no           INT          NOT NULL,
    given_clause          VARCHAR(1000),
    when_clause           VARCHAR(1000),
    then_clause           VARCHAR(1000),
    is_negative_path      BOOLEAN      DEFAULT FALSE,
    PRIMARY KEY (criterion_id),
    FOREIGN KEY (user_story_id) REFERENCES user_story(user_story_id)
);

CREATE TABLE story_dependency (
    dependency_id         VARCHAR(36)  NOT NULL,
    user_story_id         VARCHAR(36)  NOT NULL,
    depends_on_story_id   VARCHAR(36)  NOT NULL,
    dependency_type       VARCHAR(40),            -- BlockedBy, RelatesTo, Duplicates
    PRIMARY KEY (dependency_id),
    FOREIGN KEY (user_story_id)       REFERENCES user_story(user_story_id),
    FOREIGN KEY (depends_on_story_id) REFERENCES user_story(user_story_id)
);

CREATE TABLE change_request (
    change_request_id     VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    title                 VARCHAR(300) NOT NULL,
    description           VARCHAR(4000),
    requested_by          VARCHAR(200),
    urgency               VARCHAR(20),
    status                VARCHAR(30)  NOT NULL,  -- Intake, Analysing, Brainstorm, Decision, Accepted, Deferred, Rejected, Propagated
    decision_rationale    VARCHAR(2000),
    release_id            VARCHAR(36),
    source_utterance_id   VARCHAR(36),
    raised_at             TIMESTAMP,
    PRIMARY KEY (change_request_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (release_id) REFERENCES release(release_id)
);

CREATE TABLE impact_finding (
    finding_id            VARCHAR(36)  NOT NULL,
    change_request_id     VARCHAR(36)  NOT NULL,
    finding_type          VARCHAR(40)  NOT NULL,  -- Affected, Undefined, Contradiction, LowCoverage
    target_object_type    VARCHAR(40),            -- KnowledgeNode, Epic, UserStory, Decision
    target_object_id      VARCHAR(36),
    detail                VARCHAR(2000),
    confidence_score      DECIMAL(4,3),
    ba_disposition        VARCHAR(30),            -- Accepted, Dismissed, RaisedAsClarification
    PRIMARY KEY (finding_id),
    FOREIGN KEY (change_request_id) REFERENCES change_request(change_request_id)
);

CREATE TABLE trace_link (
    trace_link_id         VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    from_object_type      VARCHAR(40)  NOT NULL,
    from_object_id        VARCHAR(36)  NOT NULL,
    to_object_type        VARCHAR(40)  NOT NULL,
    to_object_id          VARCHAR(36)  NOT NULL,
    link_type             VARCHAR(40)  NOT NULL,  -- DerivedFrom, Implements, Supersedes, Impacts, AnswersTo
    created_at            TIMESTAMP,
    PRIMARY KEY (trace_link_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE minutes_document (
    minutes_id            VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    interaction_id        VARCHAR(36)  NOT NULL,
    subject               VARCHAR(300),
    body_html             VARCHAR(4000),
    status                VARCHAR(30)  NOT NULL,  -- Draft, InReview, Approved, Distributed, Disputed
    approved_by           VARCHAR(36),
    distributed_at        TIMESTAMP,
    dispute_note          VARCHAR(2000),
    PRIMARY KEY (minutes_id),
    FOREIGN KEY (interaction_id) REFERENCES interaction(interaction_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (approved_by) REFERENCES app_user(user_id)
);

CREATE TABLE minutes_recipient (
    recipient_id          VARCHAR(36)  NOT NULL,
    minutes_id            VARCHAR(36)  NOT NULL,
    email                 VARCHAR(200) NOT NULL,
    acknowledged_at       TIMESTAMP,
    PRIMARY KEY (recipient_id),
    FOREIGN KEY (minutes_id) REFERENCES minutes_document(minutes_id)
);

CREATE TABLE glossary_term (
    term_id               VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    term                  VARCHAR(200) NOT NULL,
    definition            VARCHAR(2000),
    preferred_form        VARCHAR(200),
    banned_forms          VARCHAR(1000),
    PRIMARY KEY (term_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE guardrail_rule (
    rule_id               VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    rule_type             VARCHAR(40)  NOT NULL,  -- Vocabulary, SentencePattern, StructureCheck, Completeness
    rule_name             VARCHAR(200) NOT NULL,
    rule_expression       VARCHAR(2000),
    severity              VARCHAR(20),            -- Info, Warning, Blocking
    is_active             BOOLEAN      DEFAULT TRUE,
    PRIMARY KEY (rule_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id)
);

CREATE TABLE review (
    review_id             VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    target_object_type    VARCHAR(40)  NOT NULL,
    target_object_id      VARCHAR(36)  NOT NULL,
    reviewer_user_id      VARCHAR(36)  NOT NULL,
    outcome               VARCHAR(30),            -- Approved, ReturnedForRework, Pending
    comments              VARCHAR(4000),
    reviewed_at           TIMESTAMP,
    PRIMARY KEY (review_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (reviewer_user_id) REFERENCES app_user(user_id)
);

CREATE TABLE audit_event (
    audit_event_id        VARCHAR(36)  NOT NULL,
    project_id            VARCHAR(36)  NOT NULL,
    actor_user_id         VARCHAR(36),
    event_type            VARCHAR(60)  NOT NULL,  -- Confirmed, Approved, Published, ModelUpdated, ConflictResolved
    target_object_type    VARCHAR(40),
    target_object_id      VARCHAR(36),
    prior_value           VARCHAR(4000),
    new_value             VARCHAR(4000),
    occurred_at           TIMESTAMP    NOT NULL,
    PRIMARY KEY (audit_event_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (actor_user_id) REFERENCES app_user(user_id)
);
