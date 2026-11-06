-- EPIC 18 follow-up: automatic SLA-timeout fallback, deferred in migration
-- 0016 pending real usage. A partner's SLA is its own commitment (one
-- partner might promise 2-hour pickup, another next-day), so the
-- threshold lives on delivery_partner, not the project or the delivery.
-- Null means "no automatic timeout for this partner" — manual decline
-- (the existing path) still always works regardless.
alter table delivery_partner add column if not exists sla_hours numeric(6,2);
