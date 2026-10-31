-- Permission required for authenticated sessions to evaluate RLS predicates.
-- Private schema is not included in exposed Data API schemas.
grant usage on schema notice_private to authenticated;
grant execute on function notice_private.can_use_room(uuid,uuid) to authenticated;
grant execute on function notice_private.may_post_notice(uuid) to authenticated;
-- No grants to anon and no permissions to modify room ownership or member lists.
