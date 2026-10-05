-- EPIC 12 (Phase 7) — Change Request Analysis. change_request, impact_finding
-- and trace_link already exist from 0002_core_schema.sql; this adds what the
-- Propagate stage needs: a per-target proposed edit a BA approves
-- individually before it's written back to the epic/story, and a timestamp
-- marking when the delivery team was notified.

alter table change_request add column notified_at timestamptz;

create table proposed_edit (
    proposed_edit_id      uuid         not null default gen_random_uuid(),
    change_request_id     uuid         not null,
    target_object_type    varchar(40)  not null check (target_object_type in ('Epic', 'UserStory')),
    target_object_id      uuid         not null,
    field_name             varchar(60)  not null,
    current_value          varchar(4000),
    proposed_value          varchar(4000),
    rationale              varchar(2000),
    status                 varchar(20)  not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
    reviewed_by            uuid,
    reviewed_at            timestamptz,
    created_at             timestamptz  not null default now(),
    primary key (proposed_edit_id),
    foreign key (change_request_id) references change_request(change_request_id) on delete cascade,
    foreign key (reviewed_by) references app_user(user_id)
);

create index idx_proposed_edit_change_request on proposed_edit(change_request_id);

alter table proposed_edit enable row level security;
create policy proposed_edit_member on proposed_edit
  for all using (
    exists (
      select 1 from change_request c
      where c.change_request_id = proposed_edit.change_request_id
        and is_project_member(c.project_id)
    )
  );
