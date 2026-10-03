-- EPIC 6 (Action Item) + EPIC 7 (Clarification Item): adds what their case
-- lifecycles need beyond the columns Phase 2's commit-to-charter already
-- populates.

-- §3.3 stage 3 "owner records outcome" needs its own field — reusing
-- `detail` (the original extracted statement) would destroy the source
-- text instead of recording what happened.
alter table action_item add column if not exists outcome_note varchar(2000);

-- Escalation sweeps (§3.3 "escalates... when overdue", §3.4 "ageing...
-- reported to Lead BA") must not re-escalate on every sweep tick — these
-- mark the first escalation so each item/clarification is flagged once.
alter table action_item add column if not exists escalated_at timestamptz;
alter table clarification add column if not exists escalated_at timestamptz;

-- §3.4 "unanswered beyond a configurable threshold" — per-project, like
-- retention_days and mom_ack_window_hours.
alter table project add column if not exists clarification_ageing_days int default 14;

alter table audit_event drop constraint audit_event_event_type_check;
alter table audit_event
  add constraint audit_event_event_type_check
  check (event_type in ('Confirmed', 'Approved', 'Published', 'ModelUpdated', 'ConflictResolved', 'Created', 'Updated', 'Deleted', 'StatusChanged', 'Escalated'));
