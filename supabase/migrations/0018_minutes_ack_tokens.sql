-- EPIC 5: public tokenized ack/dispute links for external minutes
-- recipients, deferred when EPIC 5 first shipped (see BACKLOG.md EPIC 5 —
-- "building real unauthenticated ack/dispute links is its own scope").
-- Each minutes_recipient row gets its own unguessable token (256-bit
-- random, generated in src/lib/minutes/ackToken.ts); holding the token IS
-- the authorization for that one row — the same capability-URL pattern
-- Supabase's own magic links already use elsewhere in this app. The page
-- behind it is intentionally public (no session), so every access goes
-- through the service-role client, scoped by this token alone.
alter table minutes_recipient add column if not exists ack_token text;
alter table minutes_recipient add column if not exists disputed_at timestamptz;

create unique index if not exists idx_minutes_recipient_ack_token
  on minutes_recipient(ack_token) where ack_token is not null;
