-- Widens semantic search/retrieval (and the new project chat's RAG
-- context) from the original 4 embeddable types to cover the rest of the
-- project's content, so "ask anything about this project" is actually
-- true rather than silently blind to epics/action items/clarifications/
-- change requests/guardrails/uploaded documents.
alter table epic add column if not exists embedding vector(1536);
alter table action_item add column if not exists embedding vector(1536);
alter table clarification add column if not exists embedding vector(1536);
alter table change_request add column if not exists embedding vector(1536);
alter table guardrail_rule add column if not exists embedding vector(1536);
alter table project_document add column if not exists embedding vector(1536);

create or replace function search_project_embeddings(
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

    union all

    select
      'Epic',
      e.epic_id,
      left(coalesce(e.title || ': ' || e.business_objective, e.title), 300),
      (1 - (e.embedding <=> p_query_embedding))::float8,
      null::uuid
    from epic e
    where e.project_id = p_project_id and e.embedding is not null and 'Epic' = any(p_scope)

    union all

    select
      'ActionItem',
      a.action_item_id,
      left(coalesce(a.title || ': ' || a.detail, a.title), 300),
      (1 - (a.embedding <=> p_query_embedding))::float8,
      a.source_utterance_id
    from action_item a
    where a.project_id = p_project_id and a.embedding is not null and 'ActionItem' = any(p_scope)

    union all

    select
      'Clarification',
      c.clarification_id,
      left(coalesce(c.question || ': ' || c.answer_text, c.question), 300),
      (1 - (c.embedding <=> p_query_embedding))::float8,
      c.source_utterance_id
    from clarification c
    where c.project_id = p_project_id and c.embedding is not null and 'Clarification' = any(p_scope)

    union all

    select
      'ChangeRequest',
      r.change_request_id,
      left(coalesce(r.title || ': ' || r.description, r.title), 300),
      (1 - (r.embedding <=> p_query_embedding))::float8,
      r.source_utterance_id
    from change_request r
    where r.project_id = p_project_id and r.embedding is not null and 'ChangeRequest' = any(p_scope)

    union all

    select
      'Guardrail',
      g.rule_id,
      left(coalesce(g.rule_name || ': ' || g.rule_expression, g.rule_name), 300),
      (1 - (g.embedding <=> p_query_embedding))::float8,
      null::uuid
    from guardrail_rule g
    where g.project_id = p_project_id and g.embedding is not null and 'Guardrail' = any(p_scope)

    union all

    select
      'Document',
      doc.document_id,
      left(doc.extracted_text, 300),
      (1 - (doc.embedding <=> p_query_embedding))::float8,
      null::uuid
    from project_document doc
    where doc.project_id = p_project_id and doc.embedding is not null and 'Document' = any(p_scope)
  ) combined
  order by relevance_score desc
  limit p_limit;
end;
$$;
