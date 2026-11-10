-- Project-wide RAG chat: one shared conversation per project (not per
-- user), plus uploaded documents that get ingested into the same
-- searchable knowledge base. Both are immutable logs from the
-- application's perspective (select + insert only) — same rationale as
-- audit_event (0015): nobody should be able to edit or erase a project's
-- conversation history or document list via a direct PostgREST call.

create table project_chat_message (
    chat_message_id  uuid        not null default gen_random_uuid(),
    project_id       uuid        not null,
    role             varchar(20) not null check (role in ('user', 'assistant')),
    author_id        uuid,
    parts            jsonb       not null,
    created_at       timestamptz not null default now(),
    primary key (chat_message_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (author_id) references app_user(user_id)
);

create index project_chat_message_project_idx on project_chat_message (project_id, created_at);

alter table project_chat_message enable row level security;

create policy project_chat_message_select_member on project_chat_message
  for select using (is_project_member(project_id));

create policy project_chat_message_insert_member on project_chat_message
  for insert with check (is_project_member(project_id));

create table project_document (
    document_id      uuid        not null default gen_random_uuid(),
    project_id       uuid        not null,
    uploaded_by      uuid,
    file_name        varchar(300) not null,
    storage_path     text        not null,
    mime_type        varchar(200),
    extracted_text   text,
    created_at       timestamptz not null default now(),
    primary key (document_id),
    foreign key (project_id) references project(project_id) on delete cascade,
    foreign key (uploaded_by) references app_user(user_id)
);

alter table project_document enable row level security;

create policy project_document_select_member on project_document
  for select using (is_project_member(project_id));

create policy project_document_insert_member on project_document
  for insert with check (is_project_member(project_id));

-- Storage bucket for the underlying uploaded files. Private (not public) —
-- access is only ever via the service-role client server-side or, for
-- storage.objects itself, through the policies below. Path convention:
-- {project_id}/{document_id}/{file_name}, enforced by application code,
-- not by the database — the policies below trust the first path segment
-- is a project_id and check membership against it.
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

create policy project_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1]::uuid in (
      select project_id from project_member where user_id = auth.uid()
    )
  );

create policy project_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1]::uuid in (
      select project_id from project_member where user_id = auth.uid()
    )
  );
