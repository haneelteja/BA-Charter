-- utterance.speaker_user_id / speaker_stakeholder_id had no ON DELETE action,
-- so deleting a project could fail mid-cascade: project -> stakeholder
-- cascades, but a stakeholder referenced by an utterance couldn't actually
-- be removed, blocking the whole delete. speaker_label (plain text) already
-- preserves who was recorded as speaking regardless of whether the FK link
-- survives, so SET NULL is safe here — it only drops the structured link,
-- never the record of what was said or by whom (by label).
alter table utterance drop constraint utterance_speaker_user_id_fkey;
alter table utterance
  add constraint utterance_speaker_user_id_fkey
  foreign key (speaker_user_id) references app_user(user_id) on delete set null;

alter table utterance drop constraint utterance_speaker_stakeholder_id_fkey;
alter table utterance
  add constraint utterance_speaker_stakeholder_id_fkey
  foreign key (speaker_stakeholder_id) references stakeholder(stakeholder_id) on delete set null;
