-- migrate:up
ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_key text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS city_state text;

-- migrate:down
-- No down migration
