-- migrate:up
ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_key text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS city_state text;

CREATE TABLE IF NOT EXISTS location_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  announcer_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id)
);

INSERT INTO location_features (location_id, announcer_enabled)
SELECT id, COALESCE(announcer_enabled, false)
FROM locations
ON CONFLICT (location_id) DO UPDATE SET announcer_enabled = EXCLUDED.announcer_enabled;

-- migrate:down
-- No down migration
