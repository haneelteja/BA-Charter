-- Per-user BYOK LLM configuration (EXECUTION_PLAN.md §3.C). One row per user;
-- api_key_ciphertext is encrypted application-side (AES-256-GCM, see
-- src/lib/crypto.ts) before it ever reaches Postgres — the database only ever
-- stores opaque ciphertext, never a plaintext key.
create table user_llm_setting (
    user_id               uuid         not null,
    provider              varchar(40)  not null check (provider in ('openai', 'anthropic')),
    model                 varchar(100) not null,
    api_key_ciphertext    text         not null,
    created_at            timestamptz  not null default now(),
    updated_at            timestamptz  not null default now(),
    primary key (user_id),
    foreign key (user_id) references app_user(user_id) on delete cascade
);

alter table user_llm_setting enable row level security;

create policy user_llm_setting_self on user_llm_setting
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A project's embedding model is fixed at project level (EXECUTION_PLAN.md
-- §3.C note) so vectors stay comparable within one project even though
-- generation calls vary per acting user's BYOK settings.
alter table project add column if not exists embedding_model varchar(100);
