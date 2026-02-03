-- migrate:up
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,          -- e.g. slw, sm, torr, txw
  name TEXT NOT NULL,                 -- SwimLabs Westchester
  state TEXT NOT NULL,                -- NY, TX, CA...
  timezone TEXT NOT NULL,             -- America/New_York, America/Los_Angeles...
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  features JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "announcer": true, "chores": true }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-location shared pins (Front Desk / Deck Roster)
CREATE TABLE IF NOT EXISTS shared_pins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('front_desk','desk_roster')),
  pin_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, mode)
);

-- Attach FK now that locations exists
ALTER TABLE sessions
  ADD CONSTRAINT sessions_location_fk
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- User access per location + allowed modes
CREATE TABLE IF NOT EXISTS user_location_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  can_staff BOOLEAN NOT NULL DEFAULT TRUE,
  can_deck BOOLEAN NOT NULL DEFAULT FALSE,
  can_front_desk BOOLEAN NOT NULL DEFAULT FALSE,
  can_virtual_desk BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, location_id)
);

-- Coverage overrides (time-bound, for temporary access)
CREATE TABLE IF NOT EXISTS coverage_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  granted_by_user_id UUID NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coverage_user_dates ON coverage_overrides(user_id, start_date, end_date);

-- Seed SwimLabs Westchester (SLW) as first location
INSERT INTO locations (code, name, state, timezone, features)
VALUES ('slw', 'SwimLabs Westchester', 'NY', 'America/New_York', '{"announcer": true, "chores": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Give Khaled (owner) access to SLW with all modes
INSERT INTO user_location_access (user_id, location_id, can_staff, can_deck, can_front_desk, can_virtual_desk, is_default)
SELECT u.id, l.id, true, true, true, true, true
FROM users u
JOIN locations l ON l.code='slw'
WHERE u.username='khaledal'
ON CONFLICT (user_id, location_id) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS coverage_overrides;
DROP TABLE IF EXISTS user_location_access;
DROP TABLE IF EXISTS shared_pins;
DROP TABLE IF EXISTS locations;
