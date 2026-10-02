-- Row-Level Security: every project-scoped table is readable/writable only by
-- members of that project (Requirements §7 Security, EPIC 1). Role-specific
-- write restrictions (e.g. "only Lead BA resolves a conflict") are enforced in
-- application code at the server-action layer, not here — RLS's job is
-- project membership, not full business-rule enforcement.

create function is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_member
    where project_id = p_project_id
      and user_id = auth.uid()
  );
$$;

create function is_project_lead(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_member
    where project_id = p_project_id
      and user_id = auth.uid()
      and role_name in ('LeadBA', 'Administrator')
  );
$$;

-- app_user: every authenticated user can read the directory (names needed for
-- assignment pickers everywhere); a user may only update their own row.
alter table app_user enable row level security;

create policy app_user_select_all on app_user
  for select using (auth.role() = 'authenticated');

create policy app_user_update_self on app_user
  for update using (user_id = auth.uid());

-- project: visible to members; insert is open to any authenticated user
-- (creating a project makes you its first member via application code,
-- immediately after insert, in the same transaction).
alter table project enable row level security;

create policy project_select_member on project
  for select using (is_project_member(project_id));

create policy project_insert_authenticated on project
  for insert with check (auth.role() = 'authenticated');

create policy project_update_member on project
  for update using (is_project_member(project_id));

-- project_member: members can see the roster of their own projects; only a
-- Lead BA/Administrator can change membership (role assignment is itself a
-- privileged action per §2 Personas).
alter table project_member enable row level security;

create policy project_member_select_member on project_member
  for select using (is_project_member(project_id));

create policy project_member_write_lead on project_member
  for all using (is_project_lead(project_id))
  with check (is_project_lead(project_id));

-- Bootstrap case: a project starts with zero members, so is_project_lead()
-- can never be true yet. Allow a user to insert themselves as a project's
-- first member only — every subsequent membership change goes through the
-- lead-only policy above.
create policy project_member_bootstrap_self on project_member
  for insert
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from project_member pm where pm.project_id = project_member.project_id
    )
  );

-- Generic pattern for every remaining project-scoped table: select/insert/
-- update/delete gated on project membership. Role-specific gates (Lead BA
-- approval, reviewer identity, etc.) are additional application-layer checks
-- on top of this floor, not a replacement for it.
do $$
declare
  t text;
  tables text[] := array[
    'stakeholder', 'interaction', 'decision', 'knowledge_node',
    'knowledge_conflict', 'action_item', 'clarification', 'release', 'epic',
    'user_story', 'change_request', 'trace_link', 'minutes_document',
    'glossary_term', 'guardrail_rule', 'review', 'audit_event'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select using (is_project_member(project_id))',
      t || '_select_member', t
    );
    execute format(
      'create policy %I on %I for insert with check (is_project_member(project_id))',
      t || '_insert_member', t
    );
    execute format(
      'create policy %I on %I for update using (is_project_member(project_id))',
      t || '_update_member', t
    );
    execute format(
      'create policy %I on %I for delete using (is_project_member(project_id))',
      t || '_delete_member', t
    );
  end loop;
end $$;

-- Tables one join away from project_id: scope through their parent row
-- instead of duplicating project_id onto every child table.
alter table utterance enable row level security;
create policy utterance_member on utterance
  for all using (
    exists (
      select 1 from interaction i
      where i.interaction_id = utterance.interaction_id
        and is_project_member(i.project_id)
    )
  );

alter table acceptance_criterion enable row level security;
create policy acceptance_criterion_member on acceptance_criterion
  for all using (
    exists (
      select 1 from user_story s
      where s.user_story_id = acceptance_criterion.user_story_id
        and is_project_member(s.project_id)
    )
  );

alter table story_dependency enable row level security;
create policy story_dependency_member on story_dependency
  for all using (
    exists (
      select 1 from user_story s
      where s.user_story_id = story_dependency.user_story_id
        and is_project_member(s.project_id)
    )
  );

alter table impact_finding enable row level security;
create policy impact_finding_member on impact_finding
  for all using (
    exists (
      select 1 from change_request c
      where c.change_request_id = impact_finding.change_request_id
        and is_project_member(c.project_id)
    )
  );

alter table minutes_recipient enable row level security;
create policy minutes_recipient_member on minutes_recipient
  for all using (
    exists (
      select 1 from minutes_document m
      where m.minutes_id = minutes_recipient.minutes_id
        and is_project_member(m.project_id)
    )
  );
