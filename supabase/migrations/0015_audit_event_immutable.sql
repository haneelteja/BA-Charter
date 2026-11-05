-- audit_event picked up the generic project-member select/insert/update/delete
-- policy from migration 0004's loop, which is correct for ordinary content
-- tables but wrong for an audit log: any project member could otherwise
-- alter or erase their own project's audit trail via a direct PostgREST
-- call, defeating the traceability guarantee EPIC 16 treats as an NFR.
-- An audit log should be insert-only from the application's perspective —
-- select and insert stay (every mutating action still needs to write one,
-- and members still need to read the trail), update/delete are revoked.
drop policy if exists audit_event_update_member on audit_event;
drop policy if exists audit_event_delete_member on audit_event;
