-- Role and exploit regression tests for RLS, status-transition triggers and
-- function privileges (migration 0026). Each check runs as a real role
-- (anon, authenticated with a JWT subject, service_role) and is rolled
-- back, so checks are independent. Output lines start with PASS or FAIL;
-- run.sh fails if any FAIL appears. Run with supabase/tests/run.sh.
\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a','lead@x.test'),
  ('00000000-0000-0000-0000-00000000000b','ba@x.test'),
  ('00000000-0000-0000-0000-00000000000c','ba2@x.test'),
  ('00000000-0000-0000-0000-00000000000d','delivery@x.test'),
  ('00000000-0000-0000-0000-00000000000e','outsider@x.test');
insert into project (project_id, project_name, status, lead_ba_id, mom_ack_window_hours)
values ('11111111-1111-1111-1111-111111111111','P','Active','00000000-0000-0000-0000-00000000000a', 48);
insert into project_member (project_id, user_id, role_name) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','LeadBA'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','BusinessAnalyst'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','BusinessAnalyst'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000d','DeliveryMember');
insert into decision (decision_id, project_id, statement, status) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','prov','Provisional'),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','conf','Confirmed'),
  ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','cand','Candidate');
insert into user_story (user_story_id, project_id, title, status, guardrail_pass, created_by) values
  ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','in review by B','InReview',true,'00000000-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','approved, provisional link','Approved',true,'00000000-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','approved, confirmed link','Approved',true,'00000000-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','draft','Draft',false,'00000000-0000-0000-0000-00000000000b');
insert into trace_link (project_id, from_object_type, from_object_id, to_object_type, to_object_id, link_type) values
  ('11111111-1111-1111-1111-111111111111','UserStory','33333333-0000-0000-0000-000000000002','Decision','22222222-0000-0000-0000-000000000001','Implements'),
  ('11111111-1111-1111-1111-111111111111','UserStory','33333333-0000-0000-0000-000000000003','Decision','22222222-0000-0000-0000-000000000002','Implements');
insert into epic (epic_id, project_id, title, status) values ('44444444-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','E','InReview');
insert into interaction (interaction_id, project_id, source_type, processing_status) values ('55555555-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Transcript','Confirmed');
insert into minutes_document (minutes_id, project_id, interaction_id, subject, body_html, status) values
  ('66666666-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','55555555-0000-0000-0000-000000000001','draft','<p>x</p>','Draft'),
  ('66666666-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','55555555-0000-0000-0000-000000000001','old','<p>x</p>','Approved');
-- distribute #2 as service (stamps the window), then backdate it to closed
update minutes_document set status='Distributed', distributed_at = now() - interval '72 hours' where minutes_id='66666666-0000-0000-0000-000000000002';
insert into action_item (action_item_id, project_id, title, owner_user_id, raised_by, status) values
  ('77777777-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owned by delivery','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000a','Open'),
  ('77777777-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','owned by BA','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','Open');
insert into job_queue (job_type, payload) values ('extract_candidates','{"projectId":"secret"}');

create function pg_temp.chk(label text, stmt text, expect_ok boolean, pattern text default null) returns text language plpgsql as $f$
declare n int;
begin
  begin
    execute stmt; get diagnostics n = row_count;
    raise exception 'SENTINEL_OK:%', n;
  exception when others then
    if sqlerrm like 'SENTINEL_OK:%' then
      n := split_part(sqlerrm, ':', 2)::int;
      if expect_ok and n > 0 then return 'PASS  ' || label; end if;
      if not expect_ok and n = 0 then return 'PASS  ' || label || ' (0 rows: RLS)'; end if;
      return 'FAIL  ' || label || ': ' || n || ' rows';
    end if;
    if expect_ok then return 'FAIL  ' || label || ': ' || sqlerrm; end if;
    if pattern is not null and sqlerrm !~* pattern then return 'FAIL  ' || label || ' (unexpected error): ' || sqlerrm; end if;
    return 'PASS  ' || label || ' -> ' || left(sqlerrm, 90);
  end;
end $f$;
grant execute on function pg_temp.chk(text,text,boolean,text) to anon, authenticated;

create function pg_temp.as_user(uid text) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', uid, false), set_config('request.jwt.claim.role', 'authenticated', false);
$f$;

-- anon
select set_config('request.jwt.claim.role','anon',false);
set role anon;
select pg_temp.chk('anon cannot claim jobs', $$select claim_next_job('x')$$, false, 'permission denied');
select pg_temp.chk('anon cannot complete jobs', $$select complete_job(gen_random_uuid())$$, false, 'permission denied');
reset role;

-- Delivery member: read-only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); set role authenticated;
select pg_temp.chk('delivery cannot claim jobs', $$select claim_next_job('x')$$, false, 'permission denied');
select pg_temp.chk('delivery can read stories', $$select * from user_story$$, true);
select pg_temp.chk('delivery cannot create a story', $$insert into user_story (project_id, title, status) values ('11111111-1111-1111-1111-111111111111','x','Draft')$$, false, 'row-level security');
select pg_temp.chk('delivery cannot edit a story', $$update user_story set title='hacked'$$, false);
select pg_temp.chk('delivery cannot confirm a decision', $$update decision set status='Confirmed' where status='Candidate'$$, false);
select pg_temp.chk('delivery cannot change project settings', $$update project set retention_days=1$$, false);
select pg_temp.chk('delivery owner can update their action item', $$update action_item set status='InProgress' where action_item_id='77777777-0000-0000-0000-000000000001'$$, true);
select pg_temp.chk('delivery cannot update someone else''s action item', $$update action_item set status='InProgress' where action_item_id='77777777-0000-0000-0000-000000000002'$$, false);
select pg_temp.chk('delivery owner cannot reassign their action item', $$update action_item set owner_user_id='00000000-0000-0000-0000-00000000000b' where action_item_id='77777777-0000-0000-0000-000000000001'$$, false, 'row-level security');
reset role;

-- Business analyst B (author of story 1)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.chk('BA can edit a draft story', $$update user_story set title='t2' where user_story_id='33333333-0000-0000-0000-000000000004'$$, true);
select pg_temp.chk('BA cannot approve own story', $$update user_story set status='Approved' where user_story_id='33333333-0000-0000-0000-000000000001'$$, false, 'own story');
select pg_temp.chk('BA cannot approve a draft (skip review)', $$update user_story set status='Approved' where user_story_id='33333333-0000-0000-0000-000000000004'$$, false, 'in review');
select pg_temp.chk('BA cannot submit without guardrail pass', $$update user_story set status='InReview' where user_story_id='33333333-0000-0000-0000-000000000004'$$, false, 'guardrail');
select pg_temp.chk('BA cannot publish', $$update user_story set status='Published' where user_story_id='33333333-0000-0000-0000-000000000003'$$, false, 'Lead');
select pg_temp.chk('BA cannot set Provisional decision Confirmed', $$update decision set status='Confirmed' where decision_id='22222222-0000-0000-0000-000000000001'$$, false, 'acknowledgement');
select pg_temp.chk('BA can confirm a Candidate (clarification answer)', $$update decision set status='Confirmed' where decision_id='22222222-0000-0000-0000-000000000003'$$, true);
select pg_temp.chk('BA can revert Provisional to Candidate (dispute)', $$update decision set status='Candidate' where decision_id='22222222-0000-0000-0000-000000000001'$$, true);
select pg_temp.chk('BA cannot insert a Confirmed decision', $$insert into decision (project_id, statement, status) values ('11111111-1111-1111-1111-111111111111','x','Confirmed')$$, false, 'Candidate or Provisional');
select pg_temp.chk('BA cannot supersede a decision', $$update decision set status='Superseded' where decision_id='22222222-0000-0000-0000-000000000002'$$, false, 'Lead');
select pg_temp.chk('BA cannot approve an epic', $$update epic set status='Approved'$$, false, 'Lead');
select pg_temp.chk('BA cannot approve minutes', $$update minutes_document set status='Approved' where minutes_id='66666666-0000-0000-0000-000000000001'$$, false, 'Lead');
select pg_temp.chk('BA can edit draft minutes', $$update minutes_document set body_html='<p>y</p>' where minutes_id='66666666-0000-0000-0000-000000000001'$$, true);
select pg_temp.chk('BA cannot edit distributed minutes', $$update minutes_document set body_html='<p>y</p>' where minutes_id='66666666-0000-0000-0000-000000000002'$$, false, 'Draft or InReview');
select pg_temp.chk('dispute after window closes is refused', $$update minutes_document set status='Disputed' where minutes_id='66666666-0000-0000-0000-000000000002'$$, false, 'window');
select pg_temp.chk('BA cannot add guardrail rules', $$insert into guardrail_rule (project_id, rule_type, rule_name) values ('11111111-1111-1111-1111-111111111111','Vocabulary','x')$$, false, 'row-level security');
select pg_temp.chk('BA cannot add members', $$insert into project_member (project_id, user_id, role_name) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000e','LeadBA')$$, false, 'row-level security');
select pg_temp.chk('BA cannot read ack tokens (column gone)', $$select ack_token from minutes_recipient$$, false, 'does not exist');
reset role;

-- Second BA reviews B's story
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select pg_temp.chk('peer BA can approve a story in review', $$update user_story set status='Approved' where user_story_id='33333333-0000-0000-0000-000000000001'$$, true);
reset role;

-- Lead
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select pg_temp.chk('lead cannot publish with only a Provisional link', $$update user_story set status='Published' where user_story_id='33333333-0000-0000-0000-000000000002'$$, false, 'Confirmed decision');
select pg_temp.chk('lead can publish with a Confirmed link', $$update user_story set status='Published' where user_story_id='33333333-0000-0000-0000-000000000003'$$, true);
select pg_temp.chk('lead can approve an epic in review', $$update epic set status='Approved'$$, true);
select pg_temp.chk('lead can approve draft minutes', $$update minutes_document set status='Approved' where minutes_id='66666666-0000-0000-0000-000000000001'$$, true);
select pg_temp.chk('lead can supersede a confirmed decision', $$update decision set status='Superseded' where decision_id='22222222-0000-0000-0000-000000000002'$$, true);
select pg_temp.chk('lead can add a guardrail rule', $$insert into guardrail_rule (project_id, rule_type, rule_name) values ('11111111-1111-1111-1111-111111111111','Vocabulary','x')$$, true);
select pg_temp.chk('lead can update project settings', $$update project set retention_days=90$$, true);
select pg_temp.chk('last lead cannot demote themselves', $$update project_member set role_name='BusinessAnalyst' where user_id='00000000-0000-0000-0000-00000000000a'$$, false, 'at least one Lead');
select pg_temp.chk('lead still cannot claim jobs', $$select claim_next_job('x')$$, false, 'permission denied');
reset role;

-- Outsider: no access, cannot list other users
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e'); set role authenticated;
select pg_temp.chk('outsider sees no projects', $$select * from project$$, false);
select pg_temp.chk('outsider cannot list other users', $$select * from app_user where user_id <> auth.uid()$$, false);
select pg_temp.chk('outsider can read own app_user row', $$select * from app_user where user_id = auth.uid()$$, true);
select pg_temp.chk('outsider cannot search project embeddings', $$select * from search_project_embeddings('11111111-1111-1111-1111-111111111111', array_fill(0::real, array[1536])::vector, array['Decision'], 5)$$, false, 'not a member');
reset role;

-- Service role (jobs) keeps working
select set_config('request.jwt.claim.role','service_role',false); set role service_role;
select pg_temp.chk('service_role can claim jobs', $$select * from claim_next_job('worker') where job_id is not null$$, true);
select pg_temp.chk('service_role can promote Provisional decisions', $$update decision set status='Confirmed' where decision_id='22222222-0000-0000-0000-000000000001'$$, true);
reset role;
select 'INFO  window stamped on distribution: ' || (ack_window_ends_at is not null)::text from minutes_document where minutes_id='66666666-0000-0000-0000-000000000002';
