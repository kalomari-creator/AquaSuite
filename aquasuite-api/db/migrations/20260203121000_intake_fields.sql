-- migrate:up
ALTER TABLE client_intakes
  ADD COLUMN IF NOT EXISTS swimmer_name text,
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS requested_start_date date,
  ADD COLUMN IF NOT EXISTS source_detail text;

-- migrate:down
-- No down migration
