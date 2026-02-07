-- migrate:up
-- Add unique keys and dedupe for roster/class instances to support idempotent uploads

-- Deduplicate class_instances by keeping earliest record per key
WITH dup AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, class_date, start_time, class_name
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM class_instances
)
DELETE FROM class_instances WHERE ctid IN (SELECT ctid FROM dup WHERE rn > 1);

-- Deduplicate roster_entries by keeping earliest record per key
WITH dup AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, class_date, start_time, swimmer_name
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM roster_entries
)
DELETE FROM roster_entries WHERE ctid IN (SELECT ctid FROM dup WHERE rn > 1);

-- Enforce uniqueness for idempotent upserts
ALTER TABLE class_instances
  ADD CONSTRAINT class_instances_unique_key UNIQUE (location_id, class_date, start_time, class_name);

ALTER TABLE roster_entries
  ADD CONSTRAINT roster_entries_unique_key UNIQUE (location_id, class_date, start_time, swimmer_name);

-- migrate:down
ALTER TABLE roster_entries
  DROP CONSTRAINT IF EXISTS roster_entries_unique_key;

ALTER TABLE class_instances
  DROP CONSTRAINT IF EXISTS class_instances_unique_key;
