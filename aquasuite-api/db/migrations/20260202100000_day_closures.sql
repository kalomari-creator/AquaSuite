-- migrate:up
CREATE TABLE IF NOT EXISTS day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  closed_date date NOT NULL,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reopened_at timestamptz,
  UNIQUE (location_id, closed_date)
);

-- migrate:down
-- No down migration
