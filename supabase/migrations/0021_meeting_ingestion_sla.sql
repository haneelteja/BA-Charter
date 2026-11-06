-- EPIC 5 follow-up: case-level SLA timer, deferred when Meeting Ingestion
-- first shipped ("the job queue enforces nothing about timing yet, just
-- FIFO + retry" — see BACKLOG.md). Requirements §3.2: "Service level:
-- minutes of meeting drafted within fifteen minutes of source upload."
-- sla_breached_at makes the sweep idempotent, same pattern as
-- action_item.escalated_at.
alter table interaction add column if not exists sla_breached_at timestamptz;
