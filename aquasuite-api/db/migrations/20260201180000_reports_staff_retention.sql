-- migrate:up
CREATE TABLE IF NOT EXISTS staff_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  iclasspro_staff_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, full_name)
);

DROP TRIGGER IF EXISTS trg_staff_directory_updated_at ON staff_directory;
CREATE TRIGGER trg_staff_directory_updated_at
BEFORE UPDATE ON staff_directory
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS report_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  report_title text,
  detected_location_name text,
  detected_location_ids jsonb,
  date_ranges jsonb,
  sha256 text NOT NULL,
  stored_path text NOT NULL,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, report_type, sha256)
);

CREATE TABLE IF NOT EXISTS instructor_retention_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_directory(id) ON DELETE SET NULL,
  instructor_name text NOT NULL,
  starting_headcount integer,
  ending_headcount integer,
  retention_percent numeric,
  as_of_start date,
  as_of_end date,
  retained_start integer,
  retained_end integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, instructor_name, as_of_start, as_of_end)
);

CREATE TABLE IF NOT EXISTS instructor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_directory(id) ON DELETE SET NULL,
  instructor_name text,
  class_date date,
  class_time time,
  notes text,
  form_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_instructor_observations_updated_at ON instructor_observations;
CREATE TRIGGER trg_instructor_observations_updated_at
BEFORE UPDATE ON instructor_observations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS instructor_observation_swimmers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES instructor_observations(id) ON DELETE CASCADE,
  swimmer_name text NOT NULL,
  scores jsonb,
  notes text
);

-- migrate:down
DROP TABLE IF EXISTS instructor_observation_swimmers;
DROP TABLE IF EXISTS instructor_observations;
DROP TABLE IF EXISTS instructor_retention_snapshots;
DROP TABLE IF EXISTS report_uploads;
DROP TABLE IF EXISTS staff_directory;
