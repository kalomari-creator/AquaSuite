-- migrate:up
CREATE TABLE IF NOT EXISTS roster_uploads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  original_filename text NOT NULL,
  content_type text,
  bytes integer,
  sha256 text,

  stored_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  parse_status text NOT NULL DEFAULT 'pending',
  parse_error text,
  parsed_at timestamptz
);

CREATE INDEX IF NOT EXISTS roster_uploads_location_id_idx
  ON roster_uploads(location_id);

CREATE INDEX IF NOT EXISTS roster_uploads_uploaded_at_idx
  ON roster_uploads(uploaded_at);

-- migrate:down
DROP TABLE IF EXISTS roster_uploads;
