-- migrate:up
ALTER TABLE roster_entries
  ALTER COLUMN roster_id DROP NOT NULL;

-- migrate:down
ALTER TABLE roster_entries
  ALTER COLUMN roster_id SET NOT NULL;
