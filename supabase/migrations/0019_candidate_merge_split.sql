-- EPIC 6 follow-up: merge/split candidates, explicitly deferred when
-- Meeting Ingestion first shipped — see BACKLOG.md EPIC 6 ("what happens
-- to source_utterance_id, confidence scoring across merged items"). Two
-- new terminal statuses plus lineage columns in both directions, so a
-- merged/split candidate's history stays fully traceable even though the
-- resulting row(s) can still only carry a single source_utterance_id each
-- (unchanged, same as decision/action_item/clarification downstream).
alter table extraction_candidate drop constraint extraction_candidate_status_check;
alter table extraction_candidate
  add constraint extraction_candidate_status_check
  check (status in ('Pending', 'Accepted', 'Rejected', 'Merged', 'Split'));

alter table extraction_candidate add column if not exists merged_from_candidate_ids uuid[];
alter table extraction_candidate add column if not exists merged_into_candidate_id uuid references extraction_candidate(candidate_id);
alter table extraction_candidate add column if not exists split_from_candidate_id uuid references extraction_candidate(candidate_id);
alter table extraction_candidate add column if not exists split_into_candidate_ids uuid[];
