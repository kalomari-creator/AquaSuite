-- migrate:up
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_note text;

-- migrate:down
-- No down migration
