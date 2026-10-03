-- Extraction output (§3.2 stage 2, ba-workbench-integrations.yaml CandidateSet)
-- has no table in the original schema: `decision.status` does include
-- 'Candidate', but §8 rule 3 and the BPMN flow make clear that decision/
-- action_item/clarification rows aren't created until the Commit stage,
-- *after* minutes are drafted, approved and distributed — Confirm only
-- decides which candidates survive to that point. action_item's status enum
-- (Open/InProgress/Completed/Verified/Cancelled) has no 'Candidate' value at
-- all, confirming this: action items are never candidate rows, they're
-- created directly at 'Open' when committed. This table holds that
-- pre-commit state for all five candidate kinds the extraction service
-- produces, including the two (Risk, ChangeSignal) that have no persistent
-- home anywhere else in the schema — they stay recorded here for traceability
-- even though nothing downstream currently consumes them.
create table extraction_candidate (
    candidate_id           uuid         not null default gen_random_uuid(),
    project_id             uuid         not null,
    interaction_id         uuid         not null,
    candidate_type         varchar(20)  not null check (candidate_type in ('Decision', 'ActionItem', 'Clarification', 'Risk', 'ChangeSignal')),
    statement              varchar(2000) not null,
    suggested_owner        varchar(200),
    suggested_due_date     date,
    functional_area_hint   varchar(300),
    confidence_score       numeric(4,3) not null,
    source_utterance_id    uuid,
    contradicts_decision_id uuid,
    contradiction_explanation varchar(2000),
    status                 varchar(20)  not null default 'Pending' check (status in ('Pending', 'Accepted', 'Rejected')),
    resulting_object_type  varchar(40),
    resulting_object_id    uuid,
    decided_by             uuid,
    decided_at             timestamptz,
    created_at             timestamptz  not null default now(),
    primary key (candidate_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (interaction_id) references interaction(interaction_id) on delete cascade,
    foreign key (source_utterance_id) references utterance(utterance_id) on delete set null,
    foreign key (contradicts_decision_id) references decision(decision_id),
    foreign key (decided_by) references app_user(user_id)
);

create index idx_extraction_candidate_interaction on extraction_candidate(interaction_id);
create index idx_extraction_candidate_status on extraction_candidate(project_id, status);

alter table extraction_candidate enable row level security;

create policy extraction_candidate_select_member on extraction_candidate
  for select using (is_project_member(project_id));
create policy extraction_candidate_insert_member on extraction_candidate
  for insert with check (is_project_member(project_id));
create policy extraction_candidate_update_member on extraction_candidate
  for update using (is_project_member(project_id));
create policy extraction_candidate_delete_member on extraction_candidate
  for delete using (is_project_member(project_id));
