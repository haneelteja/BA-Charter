-- Requested directly: a freeform flow-diagramming canvas per project (a
-- "magnet board" -- shapes on a snap-to-grid dotted canvas, connected by
-- styled lines), optionally seeded from existing project data (Epics plus
-- whatever Decisions/Knowledge nodes they're trace_link-connected to) as a
-- starting point the user then edits freely. Content is stored as a single
-- jsonb blob (React Flow's own {nodes, edges} shape) rather than normalized
-- node/edge tables -- nothing needs to query an individual shape or
-- connector outside of loading the whole diagram at once.
create table flow_diagram (
    diagram_id   uuid         not null default gen_random_uuid(),
    project_id   uuid         not null,
    title        varchar(200) not null,
    content      jsonb        not null default '{"nodes": [], "edges": []}'::jsonb,
    created_by   uuid,
    created_at   timestamptz  not null default now(),
    updated_at   timestamptz  not null default now(),
    primary key (diagram_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (created_by) references app_user(user_id)
);

create index idx_flow_diagram_project on flow_diagram(project_id, updated_at desc);

-- RLS: same project-membership floor as every other project-scoped table.
alter table flow_diagram enable row level security;
create policy flow_diagram_select_member on flow_diagram
  for select using (is_project_member(project_id));
create policy flow_diagram_insert_member on flow_diagram
  for insert with check (is_project_member(project_id));
create policy flow_diagram_update_member on flow_diagram
  for update using (is_project_member(project_id));
create policy flow_diagram_delete_member on flow_diagram
  for delete using (is_project_member(project_id));
