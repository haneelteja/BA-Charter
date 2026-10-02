-- Project creation and first-member bootstrap must be atomic: two separate
-- inserts from the client left a window where a project could exist with no
-- member able to ever read it again (RLS requires membership to SELECT), and
-- separately, a client-side `.insert().select()` round-trip fails outright
-- because PostgREST re-selects the inserted row under RLS before membership
-- exists. A SECURITY DEFINER function sidesteps both problems: it runs as
-- the function owner (bypassing RLS) and does both inserts in one
-- transaction, so a failure on either side rolls back the whole thing.
create function create_project(
  p_project_name varchar(200),
  p_client_name varchar(200),
  p_description varchar(2000),
  p_start_date date
)
returns project
language plpgsql
security definer
set search_path = public
as $$
declare
  new_project project;
begin
  insert into project (project_name, client_name, description, start_date, status, lead_ba_id)
  values (p_project_name, p_client_name, p_description, p_start_date, 'Active', auth.uid())
  returning * into new_project;

  insert into project_member (project_id, user_id, role_name)
  values (new_project.project_id, auth.uid(), 'LeadBA');

  return new_project;
end;
$$;
