-- EPIC 5 follow-up: real owner-assignment UI (BACKLOG.md EPIC 5 commit-to-
-- charter note). Until now, resolving an ActionItem/Clarification
-- candidate's owner at commit time relied on exact case-insensitive name
-- matching against `suggested_owner` (free text from extraction), falling
-- back to the committing Lead BA when nothing matched. This column lets a
-- BA pick the real project member at Confirm-stage accept time instead;
-- commitToCharter prefers it and only falls back to the old name-matching
-- behavior when it's null (e.g. candidates accepted before this shipped).
alter table extraction_candidate
  add column if not exists resolved_owner_user_id uuid references app_user(user_id);
