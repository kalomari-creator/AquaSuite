-- migrate:up
CREATE TABLE IF NOT EXISTS roster_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES roster_uploads(id) ON DELETE SET NULL,
  class_date date NOT NULL,
  start_time time NOT NULL,
  class_name text,
  swimmer_name text NOT NULL,
  age_text text,
  program text,
  level text,
  instructor_name text,
  scheduled_instructor text,
  actual_instructor text,
  is_sub boolean NOT NULL DEFAULT false,
  zone integer,
  attendance integer,
  attendance_auto_absent boolean NOT NULL DEFAULT false,
  attendance_at timestamptz,
  attendance_marked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  flag_first_time boolean NOT NULL DEFAULT false,
  flag_makeup boolean NOT NULL DEFAULT false,
  flag_policy boolean NOT NULL DEFAULT false,
  flag_owes boolean NOT NULL DEFAULT false,
  flag_trial boolean NOT NULL DEFAULT false,
  balance_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'roster_entries' AND column_name = 'location_id'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS roster_entries_unique
      ON roster_entries(location_id, class_date, start_time, swimmer_name);

    CREATE INDEX IF NOT EXISTS roster_entries_location_date_idx
      ON roster_entries(location_id, class_date);

    CREATE INDEX IF NOT EXISTS roster_entries_instructor_idx
      ON roster_entries(location_id, class_date, instructor_name);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_roster_entries_updated_at ON roster_entries;
CREATE TRIGGER trg_roster_entries_updated_at
BEFORE UPDATE ON roster_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS trg_roster_entries_updated_at ON roster_entries;
DROP TABLE IF EXISTS roster_entries;
