-- migrate:up
CREATE TABLE IF NOT EXISTS integration_status (
  provider text NOT NULL,
  location_id uuid,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  meta jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, location_id)
);

CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  location_id uuid,
  event_type text NOT NULL,
  status text NOT NULL,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homebase_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  homebase_id text NOT NULL,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, homebase_id)
);

CREATE TABLE IF NOT EXISTS homebase_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  homebase_shift_id text NOT NULL,
  homebase_staff_id text,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  start_at timestamptz,
  end_at timestamptz,
  role text,
  status text,
  is_open boolean NOT NULL DEFAULT false,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, homebase_shift_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_events_provider_created ON integration_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homebase_shifts_time ON homebase_shifts(location_id, start_at, end_at);

-- migrate:down
-- No down migration
