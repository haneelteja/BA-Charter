-- EPIC 10 Retrieval Service. Embedding generation stays per-user BYOK
-- (EXECUTION_PLAN.md §3.C) but the *model* is fixed per project so vectors
-- in one project are comparable regardless of which member triggered the
-- write. Only openai/openrouter support text embeddings (Anthropic has no
-- embeddings endpoint) — constrained here now that the column is actually
-- used, rather than at creation time in 0002 when it was just a placeholder.
alter table project drop constraint if exists project_embedding_provider_check;
alter table project
  add constraint project_embedding_provider_check
  check (embedding_provider is null or embedding_provider in ('openai', 'openrouter'));

-- Unified semantic search across every embeddable object type in one
-- ranked result set, matching /retrieval/search's RetrievalResult shape
-- (objectType, objectId, snippet, relevanceScore, sourceUtteranceId).
-- SECURITY DEFINER to read across tables without per-table RLS overhead,
-- but membership is still checked explicitly — this function bypasses RLS,
-- it doesn't bypass the "project member" floor every other table enforces.
create function search_project_embeddings(
  p_project_id uuid,
  p_query_embedding vector(1536),
  p_scope text[],
  p_limit int default 10
)
returns table (
  object_type text,
  object_id uuid,
  snippet text,
  relevance_score float8,
  source_utterance_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_project_member(p_project_id) then
    raise exception 'not a member of this project';
  end if;

  return query
  select * from (
    select
      'Utterance'::text as object_type,
      u.utterance_id as object_id,
      left(u.content, 300) as snippet,
      (1 - (u.embedding <=> p_query_embedding))::float8 as relevance_score,
      u.utterance_id as source_utterance_id
    from utterance u
    join interaction i on i.interaction_id = u.interaction_id
    where i.project_id = p_project_id and u.embedding is not null and 'Utterance' = any(p_scope)

    union all

    select
      'Decision',
      d.decision_id,
      left(d.statement, 300),
      (1 - (d.embedding <=> p_query_embedding))::float8,
      d.source_utterance_id
    from decision d
    where d.project_id = p_project_id and d.embedding is not null and 'Decision' = any(p_scope)

    union all

    select
      'KnowledgeNode',
      k.knowledge_node_id,
      left(coalesce(k.title || ': ' || k.body, k.title), 300),
      (1 - (k.embedding <=> p_query_embedding))::float8,
      null::uuid
    from knowledge_node k
    where k.project_id = p_project_id and k.embedding is not null and 'KnowledgeNode' = any(p_scope)

    union all

    select
      'UserStory',
      s.user_story_id,
      left(s.title, 300),
      (1 - (s.embedding <=> p_query_embedding))::float8,
      null::uuid
    from user_story s
    where s.project_id = p_project_id and s.embedding is not null and 'UserStory' = any(p_scope)
  ) combined
  order by relevance_score desc
  limit p_limit;
end;
$$;
