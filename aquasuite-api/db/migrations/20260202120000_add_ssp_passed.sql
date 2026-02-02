-- migrate:up
ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS ssp_passed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ssp_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ssp_passed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roster_entries_ssp_passed ON roster_entries(ssp_passed);

-- migrate:down
-- No down migration
