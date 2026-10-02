-- Drops the throwaway prototype tables (created by hand via the SQL editor
-- before this migration pipeline existed), superseded by the real BA Charter
-- data model in 0002_core_schema.sql. Safe no-op if they don't exist.
drop table if exists user_stories;
drop table if exists projects;
