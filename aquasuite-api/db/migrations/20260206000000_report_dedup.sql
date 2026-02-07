-- migrate:up
-- Deduplicate and enforce uniqueness across report tables

-- ACNE leads dedupe
WITH dup AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, lead_date, lower(COALESCE(full_name,'')), lower(COALESCE(email,'')), regexp_replace(COALESCE(phone,''),'\D','','g')
    ORDER BY created_at ASC, id ASC
  ) rn
  FROM acne_leads
)
DELETE FROM acne_leads WHERE ctid IN (SELECT ctid FROM dup WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acne_leads_key
  ON acne_leads (location_id, lead_date, lower(COALESCE(full_name,'')), lower(COALESCE(email,'')), regexp_replace(COALESCE(phone,''),'\D','','g'));

-- Enrollment events dedupe
WITH dup AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, event_date, lower(COALESCE(swimmer_name,''))
    ORDER BY id ASC
  ) rn
  FROM enrollment_events
)
DELETE FROM enrollment_events WHERE ctid IN (SELECT ctid FROM dup WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_events_key
  ON enrollment_events (location_id, event_date, lower(COALESCE(swimmer_name,'')));

-- Drop events dedupe
WITH dup AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, drop_date, lower(COALESCE(swimmer_name,'')), lower(COALESCE(reason,''))
    ORDER BY id ASC
  ) rn
  FROM drop_events
)
DELETE FROM drop_events WHERE ctid IN (SELECT ctid FROM dup WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_events_key
  ON drop_events (location_id, drop_date, lower(COALESCE(swimmer_name,'')), lower(COALESCE(reason,'')));

-- Instructor retention snapshots and rows
WITH dedup_snap AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, report_date
    ORDER BY uploaded_at DESC NULLS LAST, id DESC
  ) rn
  FROM retention_snapshots
)
DELETE FROM retention_snapshots WHERE ctid IN (SELECT ctid FROM dedup_snap WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_snapshot_key
  ON retention_snapshots (location_id, report_date);

WITH dedup_rows AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY snapshot_id, lower(COALESCE(instructor_name,''))
    ORDER BY id ASC
  ) rn
  FROM instructor_retention_snapshots
)
DELETE FROM instructor_retention_snapshots WHERE ctid IN (SELECT ctid FROM dedup_rows WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_row_key
  ON instructor_retention_snapshots (snapshot_id, lower(COALESCE(instructor_name,'')));

-- Aged accounts snapshots and rows
WITH dedup_aa AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY location_id, report_date
    ORDER BY uploaded_at DESC NULLS LAST, id DESC
  ) rn
  FROM aged_accounts_snapshots
)
DELETE FROM aged_accounts_snapshots WHERE ctid IN (SELECT ctid FROM dedup_aa WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aged_accounts_snapshot
  ON aged_accounts_snapshots (location_id, report_date);

WITH dedup_aa_rows AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY snapshot_id, lower(COALESCE(bucket,''))
    ORDER BY id ASC
  ) rn
  FROM aged_accounts_rows
)
DELETE FROM aged_accounts_rows WHERE ctid IN (SELECT ctid FROM dedup_aa_rows WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aged_accounts_row_key
  ON aged_accounts_rows (snapshot_id, lower(COALESCE(bucket,'')));

-- migrate:down
DROP INDEX IF EXISTS uq_aged_accounts_row_key;
DROP INDEX IF EXISTS uq_aged_accounts_snapshot;
DROP INDEX IF EXISTS uq_retention_row_key;
DROP INDEX IF EXISTS uq_retention_snapshot_key;
DROP INDEX IF EXISTS uq_drop_events_key;
DROP INDEX IF EXISTS uq_enrollment_events_key;
DROP INDEX IF EXISTS uq_acne_leads_key;
