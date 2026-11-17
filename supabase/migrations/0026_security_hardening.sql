-- Security hardening (see the security review that preceded this migration).
--
-- 1. Function privileges. Supabase grants EXECUTE on every function in
--    `public` to anon and authenticated by default, so the SECURITY DEFINER
--    job-queue RPCs were callable by anyone holding the public anon key:
--    claim_next_job returned every tenant's job payload, and
--    complete_job/fail_job could cancel extraction, purge or SLA work.
-- 2. Role-aware RLS. 0004 only checked project membership, and every role
--    rule lived in server actions. Any member, including the read-only
--    DeliveryMember persona, could skip those actions and write straight
--    through PostgREST with their own JWT. Writes now need an authoring
--    role; Lead-only data needs Lead/Administrator.
-- 3. Status-transition triggers. Approval, publication and confirmation are
--    the business rules (§8 rules 1–5) that matter most, so the database
--    itself now refuses illegal transitions from end-user sessions.
--    service_role (background jobs, the public minutes link) is trusted and
--    is not checked here.
-- 4. app_user is visible only to yourself and people you share a project
--    with, instead of to every account that signs up.
-- 5. Minutes ack tokens are stored as SHA-256 hashes (members could read
--    raw tokens and act as an external recipient), tokens expire, and
--    disputes are refused once the acknowledgement window has closed.

------------------------------------------------------------------------
-- 1. Function privileges
------------------------------------------------------------------------

revoke execute on function claim_next_job(text) from public, anon, authenticated;
revoke execute on function complete_job(uuid) from public, anon, authenticated;
revoke execute on function fail_job(uuid, text) from public, anon, authenticated;
grant execute on function claim_next_job(text) to service_role;
grant execute on function complete_job(uuid) to service_role;
grant execute on function fail_job(uuid, text) to service_role;

revoke execute on function handle_new_auth_user() from public, anon, authenticated;

-- Called by signed-in users only; never by anon.
revoke execute on function create_project(varchar, varchar, varchar, date) from public, anon;
grant execute on function create_project(varchar, varchar, varchar, date) to authenticated, service_role;
revoke execute on function search_project_embeddings(uuid, vector, text[], int) from public, anon;
grant execute on function search_project_embeddings(uuid, vector, text[], int) to authenticated, service_role;

-- RLS policies call these as the requesting role, so authenticated keeps them.
revoke execute on function is_project_member(uuid) from public, anon;
revoke execute on function is_project_lead(uuid) from public, anon;
grant execute on function is_project_member(uuid) to authenticated, service_role;
grant execute on function is_project_lead(uuid) to authenticated, service_role;

------------------------------------------------------------------------
-- 2. Role helpers and role-aware RLS
------------------------------------------------------------------------

create function has_project_role(p_project_id uuid, p_roles text[])
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
      and role_name = any (p_roles)
  );
$$;

-- Business Analysts, Lead BAs and Administrators author content.
-- DeliveryMember is read-only (Requirements §2: "Does not author content").
create function can_author_in_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select has_project_role(p_project_id, array['BusinessAnalyst', 'LeadBA', 'Administrator']);
$$;

-- True for requests made with an end user's JWT (or none), false for
-- service_role and direct database sessions. Triggers below only police
-- end-user sessions.
create function is_end_user_request()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon');
$$;

create function shares_project_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from project_member mine
    join project_member theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

revoke execute on function has_project_role(uuid, text[]) from public, anon;
revoke execute on function can_author_in_project(uuid) from public, anon;
revoke execute on function shares_project_with(uuid) from public, anon;
grant execute on function has_project_role(uuid, text[]) to authenticated, service_role;
grant execute on function can_author_in_project(uuid) to authenticated, service_role;
grant execute on function shares_project_with(uuid) to authenticated, service_role;
grant execute on function is_end_user_request() to anon, authenticated, service_role;

-- 2a. Tables with project_id and the 0004 member policies: reads stay
-- member-wide, writes need an authoring role.
do $$
declare
  t text;
  tables text[] := array[
    'stakeholder', 'interaction', 'decision', 'knowledge_node',
    'action_item', 'clarification', 'release', 'epic',
    'user_story', 'change_request', 'trace_link', 'minutes_document', 'review'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', t || '_insert_member', t);
    execute format('drop policy if exists %I on %I', t || '_update_member', t);
    execute format('drop policy if exists %I on %I', t || '_delete_member', t);
    execute format(
      'create policy %I on %I for insert with check (can_author_in_project(project_id))',
      t || '_insert_author', t);
    execute format(
      'create policy %I on %I for update using (can_author_in_project(project_id)) with check (can_author_in_project(project_id))',
      t || '_update_author', t);
    execute format(
      'create policy %I on %I for delete using (can_author_in_project(project_id))',
      t || '_delete_author', t);
  end loop;
end $$;

-- An action item's owner reports progress on it whatever their role
-- (§3.3: "owner updates status and adds notes"), including a
-- DeliveryMember who owns it.
create policy action_item_update_owner on action_item
  for update using (owner_user_id = auth.uid() and is_project_member(project_id))
  with check (owner_user_id = auth.uid() and is_project_member(project_id));

-- Same for the later tables that copied the member pattern.
do $$
declare
  t text;
  tables text[] := array['extraction_candidate', 'delivery_partner', 'delivery', 'flow_diagram'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', t || '_insert_member', t);
    execute format('drop policy if exists %I on %I', t || '_update_member', t);
    execute format('drop policy if exists %I on %I', t || '_delete_member', t);
    execute format(
      'create policy %I on %I for insert with check (can_author_in_project(project_id))',
      t || '_insert_author', t);
    execute format(
      'create policy %I on %I for update using (can_author_in_project(project_id)) with check (can_author_in_project(project_id))',
      t || '_update_author', t);
    execute format(
      'create policy %I on %I for delete using (can_author_in_project(project_id))',
      t || '_delete_author', t);
  end loop;
end $$;

drop policy if exists project_document_insert_member on project_document;
create policy project_document_insert_author on project_document
  for insert with check (can_author_in_project(project_id));
create policy project_document_delete_author on project_document
  for delete using (can_author_in_project(project_id));

-- 2b. Lead-only data (Requirements §2: the Lead BA "manages the project
-- glossary and guardrail rules" and alone resolves charter conflicts;
-- the Project Administrator configures the project).
do $$
declare
  t text;
  tables text[] := array['glossary_term', 'guardrail_rule'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', t || '_insert_member', t);
    execute format('drop policy if exists %I on %I', t || '_update_member', t);
    execute format('drop policy if exists %I on %I', t || '_delete_member', t);
    execute format(
      'create policy %I on %I for insert with check (is_project_lead(project_id))', t || '_insert_lead', t);
    execute format(
      'create policy %I on %I for update using (is_project_lead(project_id)) with check (is_project_lead(project_id))',
      t || '_update_lead', t);
    execute format(
      'create policy %I on %I for delete using (is_project_lead(project_id))', t || '_delete_lead', t);
  end loop;
end $$;

-- Conflicts are raised by any author's charter write, resolved by a Lead.
drop policy if exists knowledge_conflict_insert_member on knowledge_conflict;
drop policy if exists knowledge_conflict_update_member on knowledge_conflict;
drop policy if exists knowledge_conflict_delete_member on knowledge_conflict;
create policy knowledge_conflict_insert_author on knowledge_conflict
  for insert with check (can_author_in_project(project_id));
create policy knowledge_conflict_update_lead on knowledge_conflict
  for update using (is_project_lead(project_id)) with check (is_project_lead(project_id));
create policy knowledge_conflict_delete_lead on knowledge_conflict
  for delete using (is_project_lead(project_id));

-- Project settings (status, retention, ack window, embedding model, lead).
drop policy if exists project_update_member on project;
create policy project_update_lead on project
  for update using (is_project_lead(project_id)) with check (is_project_lead(project_id));

-- 2c. Child tables scoped through a parent row: split the single `for all`
-- member policy into member reads and author writes.
drop policy if exists utterance_member on utterance;
create policy utterance_select_member on utterance for select using (
  exists (select 1 from interaction i where i.interaction_id = utterance.interaction_id and is_project_member(i.project_id)));
create policy utterance_write_author on utterance for all using (
  exists (select 1 from interaction i where i.interaction_id = utterance.interaction_id and can_author_in_project(i.project_id)))
  with check (
  exists (select 1 from interaction i where i.interaction_id = utterance.interaction_id and can_author_in_project(i.project_id)));

drop policy if exists acceptance_criterion_member on acceptance_criterion;
create policy acceptance_criterion_select_member on acceptance_criterion for select using (
  exists (select 1 from user_story s where s.user_story_id = acceptance_criterion.user_story_id and is_project_member(s.project_id)));
create policy acceptance_criterion_write_author on acceptance_criterion for all using (
  exists (select 1 from user_story s where s.user_story_id = acceptance_criterion.user_story_id and can_author_in_project(s.project_id)))
  with check (
  exists (select 1 from user_story s where s.user_story_id = acceptance_criterion.user_story_id and can_author_in_project(s.project_id)));

drop policy if exists story_dependency_member on story_dependency;
create policy story_dependency_select_member on story_dependency for select using (
  exists (select 1 from user_story s where s.user_story_id = story_dependency.user_story_id and is_project_member(s.project_id)));
create policy story_dependency_write_author on story_dependency for all using (
  exists (select 1 from user_story s where s.user_story_id = story_dependency.user_story_id and can_author_in_project(s.project_id)))
  with check (
  exists (select 1 from user_story s where s.user_story_id = story_dependency.user_story_id and can_author_in_project(s.project_id)));

drop policy if exists impact_finding_member on impact_finding;
create policy impact_finding_select_member on impact_finding for select using (
  exists (select 1 from change_request c where c.change_request_id = impact_finding.change_request_id and is_project_member(c.project_id)));
create policy impact_finding_write_author on impact_finding for all using (
  exists (select 1 from change_request c where c.change_request_id = impact_finding.change_request_id and can_author_in_project(c.project_id)))
  with check (
  exists (select 1 from change_request c where c.change_request_id = impact_finding.change_request_id and can_author_in_project(c.project_id)));

drop policy if exists minutes_recipient_member on minutes_recipient;
create policy minutes_recipient_select_member on minutes_recipient for select using (
  exists (select 1 from minutes_document m where m.minutes_id = minutes_recipient.minutes_id and is_project_member(m.project_id)));
create policy minutes_recipient_write_lead on minutes_recipient for all using (
  exists (select 1 from minutes_document m where m.minutes_id = minutes_recipient.minutes_id and is_project_lead(m.project_id)))
  with check (
  exists (select 1 from minutes_document m where m.minutes_id = minutes_recipient.minutes_id and is_project_lead(m.project_id)));

drop policy if exists proposed_edit_member on proposed_edit;
create policy proposed_edit_select_member on proposed_edit for select using (
  exists (select 1 from change_request c where c.change_request_id = proposed_edit.change_request_id and is_project_member(c.project_id)));
create policy proposed_edit_write_author on proposed_edit for all using (
  exists (select 1 from change_request c where c.change_request_id = proposed_edit.change_request_id and can_author_in_project(c.project_id)))
  with check (
  exists (select 1 from change_request c where c.change_request_id = proposed_edit.change_request_id and can_author_in_project(c.project_id)));

drop policy if exists delivery_attempt_member on delivery_attempt;
create policy delivery_attempt_select_member on delivery_attempt for select using (
  exists (select 1 from delivery d where d.delivery_id = delivery_attempt.delivery_id and is_project_member(d.project_id)));
create policy delivery_attempt_write_author on delivery_attempt for all using (
  exists (select 1 from delivery d where d.delivery_id = delivery_attempt.delivery_id and can_author_in_project(d.project_id)))
  with check (
  exists (select 1 from delivery d where d.delivery_id = delivery_attempt.delivery_id and can_author_in_project(d.project_id)));

-- Uploads into the knowledge base need an authoring role too.
drop policy if exists project_documents_storage_insert on storage.objects;
create policy project_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'project-documents'
    and can_author_in_project((storage.foldername(name))[1]::uuid)
  );

-- 2d. A project must always keep at least one Lead BA or Administrator,
-- otherwise nobody can manage membership again.
create function keep_one_project_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_project uuid := old.project_id;
begin
  if old.role_name not in ('LeadBA', 'Administrator') then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role_name in ('LeadBA', 'Administrator') and new.project_id = old.project_id then
    return new;
  end if;
  if not exists (
    select 1 from project_member
    where project_id = affected_project
      and role_name in ('LeadBA', 'Administrator')
      and not (project_id = old.project_id and user_id = old.user_id)
  ) and exists (select 1 from project where project_id = affected_project) then
    raise exception 'A project must keep at least one Lead BA or Administrator.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger project_member_keep_one_lead
  before update or delete on project_member
  for each row execute function keep_one_project_lead();

------------------------------------------------------------------------
-- 3. Status-transition triggers (end-user sessions only)
------------------------------------------------------------------------

-- §3.6 and §8 rule 5.
create function enforce_user_story_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_end_user_request() or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Published' then
    raise exception 'A published story''s status is owned by Agile Studio and cannot be changed here.';
  end if;

  if new.status = 'InReview' then
    if old.status not in ('Draft', 'GuardrailCheck', 'ReturnedForRework') then
      raise exception 'A story in status % cannot be submitted for review.', old.status;
    end if;
    if new.guardrail_pass is not true then
      raise exception 'Run the guardrail check and pass it before submitting for review.';
    end if;
  elsif new.status in ('Approved', 'ReturnedForRework') then
    if old.status <> 'InReview' then
      raise exception 'Only a story in review can be approved or returned (current status: %).', old.status;
    end if;
    if old.created_by = auth.uid() and not is_project_lead(new.project_id) then
      raise exception 'You cannot review your own story. Ask another Business Analyst or the Lead BA.';
    end if;
  elsif new.status = 'Published' then
    if old.status <> 'Approved' then
      raise exception 'Only an approved story can be published (current status: %).', old.status;
    end if;
    if not is_project_lead(new.project_id) then
      raise exception 'Only a Lead Business Analyst can publish a story to Agile Studio.';
    end if;
    if not exists (
      select 1
      from trace_link tl
      join decision d on d.decision_id = tl.to_object_id
      where tl.from_object_type = 'UserStory'
        and tl.from_object_id = new.user_story_id
        and tl.to_object_type = 'Decision'
        and d.project_id = new.project_id
        and d.status = 'Confirmed'
    ) then
      raise exception 'A story cannot be published without a trace link to a Confirmed decision.';
    end if;
  end if;

  return new;
end;
$$;

create trigger user_story_enforce_transition
  before update on user_story
  for each row execute function enforce_user_story_transition();

-- §3.5: Lead-only review and publish.
create function enforce_epic_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_end_user_request() or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Published' then
    raise exception 'A published epic''s status cannot be changed here.';
  end if;

  if new.status = 'InReview' then
    if old.status <> 'Draft' then
      raise exception 'Only a draft epic can be submitted for review.';
    end if;
  elsif new.status = 'Approved' or (old.status = 'InReview' and new.status = 'Draft') then
    if old.status <> 'InReview' then
      raise exception 'Only an epic in review can be approved.';
    end if;
    if not is_project_lead(new.project_id) then
      raise exception 'Only a Lead Business Analyst can review an epic.';
    end if;
  elsif new.status = 'Published' then
    if old.status <> 'Approved' then
      raise exception 'Only an approved epic can be published.';
    end if;
    if not is_project_lead(new.project_id) then
      raise exception 'Only a Lead Business Analyst can publish an epic.';
    end if;
  end if;

  return new;
end;
$$;

create trigger epic_enforce_transition
  before update on epic
  for each row execute function enforce_epic_transition();

-- §3.2 stages 4–5 and §8 rule 4.
alter table minutes_document add column if not exists ack_window_ends_at timestamptz;

update minutes_document m
set ack_window_ends_at = m.distributed_at + make_interval(hours => coalesce(p.mom_ack_window_hours, 48))
from project p
where p.project_id = m.project_id
  and m.distributed_at is not null
  and m.ack_window_ends_at is null;

create function enforce_minutes_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  window_hours int;
begin
  -- Stamp the acknowledgement window whenever minutes are distributed, from
  -- any caller, so the app and the public link read one source of truth.
  if new.status = 'Distributed' and old.status is distinct from 'Distributed' then
    select coalesce(mom_ack_window_hours, 48) into window_hours from project where project_id = new.project_id;
    new.ack_window_ends_at := coalesce(new.distributed_at, now()) + make_interval(hours => window_hours);
  end if;

  if not is_end_user_request() then
    return new;
  end if;

  if (new.body_html is distinct from old.body_html or new.subject is distinct from old.subject)
     and old.status not in ('Draft', 'InReview') then
    raise exception 'Minutes can only be edited while in Draft or InReview.';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'Approved' then
    if old.status not in ('Draft', 'InReview') then
      raise exception 'Only draft minutes can be approved (current status: %).', old.status;
    end if;
    if not is_project_lead(new.project_id) then
      raise exception 'Only a Lead Business Analyst can approve minutes.';
    end if;
  elsif new.status = 'Distributed' then
    if old.status <> 'Approved' then
      raise exception 'Only approved minutes can be distributed.';
    end if;
    if not is_project_lead(new.project_id) then
      raise exception 'Only a Lead Business Analyst can distribute minutes.';
    end if;
  elsif new.status = 'Disputed' then
    if old.status <> 'Distributed' then
      raise exception 'Only distributed minutes can be disputed.';
    end if;
    if old.ack_window_ends_at is not null and now() > old.ack_window_ends_at then
      raise exception 'The acknowledgement window for these minutes has closed.';
    end if;
  end if;

  return new;
end;
$$;

create trigger minutes_document_enforce_transition
  before update on minutes_document
  for each row execute function enforce_minutes_transition();

-- §8 rules 1–3: end users may create Candidate or Provisional decisions,
-- confirm a Candidate (an answered clarification), and revert a Provisional
-- decision on dispute. Provisional → Confirmed happens only through the
-- acknowledgement-window job (service_role); superseding a confirmed
-- decision is a Lead action.
create function enforce_decision_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_end_user_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('Candidate', 'Provisional') then
      raise exception 'New decisions start as Candidate or Provisional, not %.', new.status;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'Confirmed' and old.status <> 'Candidate' then
    raise exception 'A % decision is confirmed by acknowledgement or when the window lapses, not directly.', old.status;
  end if;
  if new.status = 'Superseded' and not is_project_lead(new.project_id) then
    raise exception 'Only a Lead Business Analyst can supersede a decision.';
  end if;
  if old.status in ('Confirmed', 'Superseded') and new.status not in ('Superseded') then
    raise exception 'A % decision cannot be changed to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger decision_enforce_rules
  before insert or update on decision
  for each row execute function enforce_decision_rules();

------------------------------------------------------------------------
-- 4. app_user visibility
------------------------------------------------------------------------

drop policy if exists app_user_select_all on app_user;
create policy app_user_select_self_or_coworker on app_user
  for select using (user_id = auth.uid() or shares_project_with(user_id));

------------------------------------------------------------------------
-- 5. Minutes acknowledgement tokens
------------------------------------------------------------------------

alter table minutes_recipient add column if not exists ack_token_hash text;
alter table minutes_recipient add column if not exists expires_at timestamptz;

update minutes_recipient
set ack_token_hash = encode(sha256(convert_to(ack_token, 'UTF8')), 'hex')
where ack_token is not null and ack_token_hash is null;

update minutes_recipient r
set expires_at = coalesce(m.distributed_at, now()) + interval '30 days'
from minutes_document m
where m.minutes_id = r.minutes_id and r.expires_at is null;

alter table minutes_recipient alter column expires_at set default now() + interval '30 days';

create unique index if not exists idx_minutes_recipient_ack_token_hash
  on minutes_recipient(ack_token_hash) where ack_token_hash is not null;

drop index if exists idx_minutes_recipient_ack_token;
alter table minutes_recipient drop column if exists ack_token;

-- Functions created above get Supabase's default EXECUTE grant to anon;
-- trigger functions need no caller grant at all.
revoke execute on function keep_one_project_lead() from public, anon, authenticated;
revoke execute on function enforce_user_story_transition() from public, anon, authenticated;
revoke execute on function enforce_epic_transition() from public, anon, authenticated;
revoke execute on function enforce_minutes_transition() from public, anon, authenticated;
revoke execute on function enforce_decision_rules() from public, anon, authenticated;
