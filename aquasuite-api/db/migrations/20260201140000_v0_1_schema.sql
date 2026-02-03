-- migrate:up
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS email_tag text,
  ADD COLUMN IF NOT EXISTS hubspot_tag text,
  ADD COLUMN IF NOT EXISTS intake_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS announcer_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  birthday date,
  source_system text NOT NULL DEFAULT 'csv',
  source_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_staff_updated_at ON staff;
CREATE TRIGGER trg_staff_updated_at
BEFORE UPDATE ON staff
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS staff_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  permission_level text,
  pin text,
  payroll_id text,
  hire_date date,
  is_active boolean NOT NULL DEFAULT true,
  source_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, location_id)
);

DROP TRIGGER IF EXISTS trg_staff_locations_updated_at ON staff_locations;
CREATE TRIGGER trg_staff_locations_updated_at
BEFORE UPDATE ON staff_locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS staff_instructor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  alias_raw text NOT NULL,
  alias_norm text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, alias_norm)
);

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS instructor_name_raw text,
  ADD COLUMN IF NOT EXISTS instructor_name_norm text,
  ADD COLUMN IF NOT EXISTS instructor_staff_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_instructor_staff_id_fkey'
  ) THEN
    ALTER TABLE roster_entries
      ADD CONSTRAINT roster_entries_instructor_staff_id_fkey
      FOREIGN KEY (instructor_staff_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS client_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'gmail_intake',
  gmail_message_id text UNIQUE,
  received_at timestamptz,
  raw_subject text,
  raw_body text,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  location_name_raw text,
  client_name text,
  preferred_day text,
  preferred_time text,
  contact_phone text,
  contact_email text,
  instructor_primary text,
  instructor_secondary text,
  code text,
  score_goal int,
  score_structure int,
  score_connection int,
  score_value int,
  level text,
  ratio text,
  why text,
  enrollment_link text,
  status text NOT NULL DEFAULT 'new',
  owner_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  notes text,
  hubspot_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_client_intakes_updated_at ON client_intakes;
CREATE TRIGGER trg_client_intakes_updated_at
BEFORE UPDATE ON client_intakes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS client_intake_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES client_intakes(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gmail_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  access_token text NOT NULL,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  last_history_id text,
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_gmail_oauth_tokens_updated_at ON gmail_oauth_tokens;
CREATE TRIGGER trg_gmail_oauth_tokens_updated_at
BEFORE UPDATE ON gmail_oauth_tokens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  source_system text,
  source_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed locations if missing
INSERT INTO locations (code, name, state, timezone, features, email_tag, hubspot_tag, intake_enabled, announcer_enabled)
SELECT * FROM (VALUES
  ('slw', 'SwimLabs Westchester', 'NY', 'America/New_York', '{"announcer": true}'::jsonb, 'locny0001@swimlabs.com', 'locny0001@swimlabs.com', true, true),
  ('yrd', 'Yonkers (Riverdale)', 'NY', 'America/New_York', '{"announcer": false}'::jsonb, 'locny0024@safesplash.com', 'locny0024@safesplash.com', true, false),
  ('wdl', 'The Woodlands', 'TX', 'America/Chicago', '{"announcer": false}'::jsonb, 'loctx0098@swimlabs.com', 'loctx0098@swimlabs.com', true, false),
  ('smr', 'Summerlin', 'NV', 'America/Los_Angeles', '{"announcer": false}'::jsonb, 'locnv0002@safesplash.com', 'locnv0002@safesplash.com', true, false),
  ('smp', 'Santa Monica (Sunset Park)', 'CA', 'America/Los_Angeles', '{"announcer": false}'::jsonb, 'locca0026@safesplash.com', 'locca0026@safesplash.com', true, false),
  ('tor', 'Torrance', 'CA', 'America/Los_Angeles', '{"announcer": false}'::jsonb, 'locca0027@safesplash.com', 'locca0027@safesplash.com', true, false)
) AS v(code, name, state, timezone, features, email_tag, hubspot_tag, intake_enabled, announcer_enabled)
WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.name = v.name);

UPDATE locations
SET announcer_enabled = CASE WHEN name = 'SwimLabs Westchester' THEN true ELSE announcer_enabled END
WHERE name = 'SwimLabs Westchester';

-- migrate:down
-- No down migration for seeded location data
DROP TABLE IF EXISTS client_intake_activity;
DROP TABLE IF EXISTS client_intakes;
DROP TABLE IF EXISTS gmail_oauth_tokens;
DROP TABLE IF EXISTS staff_instructor_aliases;
DROP TABLE IF EXISTS staff_locations;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS clients;
