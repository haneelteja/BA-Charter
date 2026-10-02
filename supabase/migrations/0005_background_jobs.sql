-- Self-hosted job queue (EXECUTION_PLAN.md §3.A). Polled by the Node worker
-- in src/jobs/worker.ts using a service-role connection, so no end-user ever
-- touches this table directly — RLS is enabled with zero policies, which
-- denies all access to the anon/authenticated roles outright while the
-- service role (used only by the worker and trusted server code) bypasses
-- RLS as usual.
create table job_queue (
    job_id         uuid        not null default gen_random_uuid(),
    job_type       varchar(60) not null,
    payload        jsonb       not null default '{}'::jsonb,
    status         varchar(20) not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    attempts       int         not null default 0,
    max_attempts   int         not null default 3,
    last_error     text,
    run_after      timestamptz not null default now(),
    locked_at      timestamptz,
    locked_by      text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    primary key (job_id)
);

create index idx_job_queue_claimable on job_queue(status, run_after) where status = 'pending';

alter table job_queue enable row level security;

-- Atomic claim for the polling worker: SKIP LOCKED means multiple worker
-- processes can run concurrently without double-claiming the same job.
create function claim_next_job(p_worker_id text)
returns job_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed job_queue;
begin
  select * into claimed
  from job_queue
  where status = 'pending'
    and run_after <= now()
  order by created_at
  for update skip locked
  limit 1;

  if claimed.job_id is null then
    return null;
  end if;

  update job_queue
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempts = attempts + 1,
      updated_at = now()
  where job_id = claimed.job_id
  returning * into claimed;

  return claimed;
end;
$$;

create function complete_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update job_queue
  set status = 'completed', updated_at = now()
  where job_id = p_job_id;
$$;

create function fail_job(p_job_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts int;
  attempt_limit int;
begin
  select attempts, max_attempts into current_attempts, attempt_limit
  from job_queue where job_id = p_job_id;

  update job_queue
  set status = case when current_attempts >= attempt_limit then 'failed' else 'pending' end,
      last_error = p_error,
      locked_at = null,
      locked_by = null,
      run_after = now() + (current_attempts * interval '1 minute'),
      updated_at = now()
  where job_id = p_job_id;
end;
$$;
