-- Delivery Partner tab: configure external delivery/logistics vendors
-- per project, route each delivery to them in a configurable priority
-- order (fallback to the next partner if the current one declines/fails),
-- and report volume/SLA/success-rate/cost analytics per partner.
--
-- Not part of the original ba-workbench-schema.sql / BACKLOG.md epics —
-- this is a standalone module with no tie to the BA/charter domain
-- objects (decisions, stories, etc.); "delivery" here means a literal
-- physical delivery, not project delivery.
--
-- Three tables:
--   delivery_partner  — per-project vendor master data, with a
--                        priority_order the app renumbers on every reorder
--                        (kept simple: small per-project lists, cheap to
--                        renumber as a whole rather than maintaining gaps).
--   delivery          — one delivery needing a partner; status plus the
--                        currently-assigned partner.
--   delivery_attempt  — history of every partner this delivery was
--                        assigned to, since fallback can cycle through
--                        several — this is what per-partner analytics
--                        (volume/SLA/success rate) aggregate over, since a
--                        partner's performance must be measured on every
--                        attempt it actually handled, not just deliveries
--                        that ended with it as the final partner.

create table delivery_partner (
    delivery_partner_id   uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    name                  varchar(200) not null,
    contact_name          varchar(200),
    contact_email         varchar(200),
    contact_phone         varchar(50),
    priority_order        int          not null,
    is_active             boolean      not null default true,
    created_at            timestamptz  not null default now(),
    primary key (delivery_partner_id),
    foreign key (project_id) references project(project_id) on delete cascade
);

create index idx_delivery_partner_project_priority
  on delivery_partner(project_id, priority_order);

create table delivery (
    delivery_id           uuid         not null default gen_random_uuid(),
    project_id            uuid         not null,
    recipient_name        varchar(200) not null,
    delivery_address      varchar(500),
    notes                 varchar(2000),
    cost                  numeric(10,2),
    status                varchar(20)  not null default 'Pending'
                          check (status in ('Pending', 'Assigned', 'InTransit', 'Delivered', 'Failed')),
    current_partner_id    uuid,
    attempt_sequence      int          not null default 0,
    assigned_at           timestamptz,
    in_transit_at         timestamptz,
    delivered_at          timestamptz,
    failed_at             timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (delivery_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (current_partner_id) references delivery_partner(delivery_partner_id)
);

create index idx_delivery_project_status on delivery(project_id, status);

-- One row per partner this delivery was assigned to, in order. "Declined"
-- covers both a partner explicitly declining and the fallback action an
-- admin takes when a partner fails to deliver — there's no automatic
-- timeout in this version (deliberately deferred: it would need an SLA
-- threshold per partner and a sweep job, matching the pattern in
-- src/jobs/handlers/sweepActionItemOverdue.ts, revisit if real usage needs
-- it); advancing to the next partner is always an explicit action for now.
create table delivery_attempt (
    delivery_attempt_id   uuid         not null default gen_random_uuid(),
    delivery_id           uuid         not null,
    delivery_partner_id   uuid         not null,
    sequence_no           int          not null,
    status                varchar(20)  not null default 'Assigned'
                          check (status in ('Assigned', 'InTransit', 'Delivered', 'Declined')),
    assigned_at           timestamptz  not null default now(),
    resolved_at           timestamptz,
    created_at            timestamptz  not null default now(),
    primary key (delivery_attempt_id),
    foreign key (delivery_id) references delivery(delivery_id) on delete cascade,
    foreign key (delivery_partner_id) references delivery_partner(delivery_partner_id)
);

create index idx_delivery_attempt_partner on delivery_attempt(delivery_partner_id, status);
create index idx_delivery_attempt_delivery on delivery_attempt(delivery_id, sequence_no);

-- RLS: same project-membership floor as every other project-scoped table.
alter table delivery_partner enable row level security;
create policy delivery_partner_select_member on delivery_partner
  for select using (is_project_member(project_id));
create policy delivery_partner_insert_member on delivery_partner
  for insert with check (is_project_member(project_id));
create policy delivery_partner_update_member on delivery_partner
  for update using (is_project_member(project_id));
create policy delivery_partner_delete_member on delivery_partner
  for delete using (is_project_member(project_id));

alter table delivery enable row level security;
create policy delivery_select_member on delivery
  for select using (is_project_member(project_id));
create policy delivery_insert_member on delivery
  for insert with check (is_project_member(project_id));
create policy delivery_update_member on delivery
  for update using (is_project_member(project_id));
create policy delivery_delete_member on delivery
  for delete using (is_project_member(project_id));

-- One join away from project_id, same pattern as utterance/acceptance_criterion.
alter table delivery_attempt enable row level security;
create policy delivery_attempt_member on delivery_attempt
  for all using (
    exists (
      select 1 from delivery d
      where d.delivery_id = delivery_attempt.delivery_id
        and is_project_member(d.project_id)
    )
  );
