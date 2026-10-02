-- Removes the temporary diagnostic function used to debug the RLS issue
-- fixed in 0007 (not meant to ship).
drop function if exists debug_auth_context();
