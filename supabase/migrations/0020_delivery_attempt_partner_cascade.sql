-- delivery_attempt.delivery_partner_id was missing ON DELETE CASCADE,
-- found by actually deleting a test project: deleting a project cascades
-- to both its delivery rows (-> delivery_attempt via delivery_id) and its
-- delivery_partner rows directly, but the delivery_partner_id edge on
-- delivery_attempt had no cascade rule (defaults to NO ACTION), blocking
-- the whole delete whenever any delivery_attempt history existed. The app
-- already prevents deleting a single in-use partner directly
-- (deleteDeliveryPartner in the delivery actions requires zero attempts
-- first) — this only affects the project-level cascade, where both rows
-- are being removed together regardless.
alter table delivery_attempt drop constraint delivery_attempt_delivery_partner_id_fkey;
alter table delivery_attempt
  add constraint delivery_attempt_delivery_partner_id_fkey
  foreign key (delivery_partner_id) references delivery_partner(delivery_partner_id) on delete cascade;
