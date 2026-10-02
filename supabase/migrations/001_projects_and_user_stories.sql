create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists user_stories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  acceptance_criteria text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists user_stories_project_id_idx on user_stories(project_id);
