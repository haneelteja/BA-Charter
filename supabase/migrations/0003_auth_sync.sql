-- Keeps app_user in sync with Supabase Auth. Application code never inserts
-- into app_user directly — every user row is created here, at sign-up time,
-- for both magic-link and password sign-in (both go through auth.users).
create function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_user (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_auth_user();
