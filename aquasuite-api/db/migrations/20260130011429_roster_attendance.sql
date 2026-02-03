-- migrate:up

CREATE TABLE IF NOT EXISTS rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL,
  roster_date date NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_filename text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by_user_id uuid,
  hash text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, roster_date)
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  class_time timestamptz,
  class_name text,
  instructor_name text,
  customer_name text,
  customer_phone text,
  swimmer_name text NOT NULL,
  swimmer_external_id text,
  customer_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roster_entries_roster_id ON roster_entries(roster_id);

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('unknown','present','absent','late','makeup');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_entry_id uuid NOT NULL REFERENCES roster_entries(id) ON DELETE CASCADE,
  marked_status attendance_status NOT NULL,
  marked_by_user_id uuid,
  marked_by_mode text NOT NULL DEFAULT 'deck',
  note text,
  marked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_entry_time ON attendance_events(roster_entry_id, marked_at DESC);

-- Helpful “latest status” view
CREATE OR REPLACE VIEW attendance_latest AS
SELECT DISTINCT ON (roster_entry_id)
  roster_entry_id,
  marked_status,
  marked_by_user_id,
  marked_by_mode,
  note,
  marked_at
FROM attendance_events
ORDER BY roster_entry_id, marked_at DESC;

-- migrate:down

DROP VIEW IF EXISTS attendance_latest;
DROP TABLE IF EXISTS attendance_events;
DROP TYPE IF EXISTS attendance_status;
DROP TABLE IF EXISTS roster_entries;
DROP TABLE IF EXISTS rosters;
