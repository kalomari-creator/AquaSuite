-- migrate:up
ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS location_id uuid;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS upload_id uuid;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS class_date date;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS start_time time;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS age_text text;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS program text;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS level text;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS scheduled_instructor text;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS actual_instructor text;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS is_sub boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS zone integer;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS attendance integer;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS attendance_auto_absent boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS attendance_at timestamptz;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS attendance_marked_by_user_id uuid;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS flag_first_time boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS flag_makeup boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS flag_policy boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS flag_owes boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS flag_trial boolean NOT NULL DEFAULT false;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS balance_amount numeric;

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_location_id_fkey'
  ) THEN
    ALTER TABLE roster_entries
      ADD CONSTRAINT roster_entries_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_upload_id_fkey'
  ) THEN
    ALTER TABLE roster_entries
      ADD CONSTRAINT roster_entries_upload_id_fkey
      FOREIGN KEY (upload_id) REFERENCES roster_uploads(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_attendance_marked_by_user_id_fkey'
  ) THEN
    ALTER TABLE roster_entries
      ADD CONSTRAINT roster_entries_attendance_marked_by_user_id_fkey
      FOREIGN KEY (attendance_marked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS roster_entries_unique
  ON roster_entries(location_id, class_date, start_time, swimmer_name);

CREATE INDEX IF NOT EXISTS roster_entries_location_date_idx
  ON roster_entries(location_id, class_date);

CREATE INDEX IF NOT EXISTS roster_entries_instructor_idx
  ON roster_entries(location_id, class_date, instructor_name);

DROP TRIGGER IF EXISTS trg_roster_entries_updated_at ON roster_entries;
CREATE TRIGGER trg_roster_entries_updated_at
BEFORE UPDATE ON roster_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
ALTER TABLE roster_entries
  DROP CONSTRAINT IF EXISTS roster_entries_location_id_fkey,
  DROP CONSTRAINT IF EXISTS roster_entries_upload_id_fkey,
  DROP CONSTRAINT IF EXISTS roster_entries_attendance_marked_by_user_id_fkey;

DROP INDEX IF EXISTS roster_entries_unique;
DROP INDEX IF EXISTS roster_entries_location_date_idx;
DROP INDEX IF EXISTS roster_entries_instructor_idx;

-- leave columns in place to avoid data loss
