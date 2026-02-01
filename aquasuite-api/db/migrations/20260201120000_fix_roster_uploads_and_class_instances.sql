-- migrate:up
CREATE TABLE IF NOT EXISTS class_instances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES roster_uploads(id) ON DELETE SET NULL,
  class_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  class_name text NOT NULL,
  scheduled_instructor text,
  actual_instructor text,
  is_sub boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_instances_location_date_idx
  ON class_instances(location_id, class_date);

CREATE INDEX IF NOT EXISTS class_instances_upload_id_idx
  ON class_instances(upload_id);

ALTER TABLE roster_uploads
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'roster_uploads' AND column_name = 'uploaded_by'
  ) THEN
    EXECUTE 'ALTER TABLE roster_uploads DROP COLUMN uploaded_by';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'roster_uploads_uploaded_by_user_id_fkey'
  ) THEN
    ALTER TABLE roster_uploads
      ADD CONSTRAINT roster_uploads_uploaded_by_user_id_fkey
      FOREIGN KEY (uploaded_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- migrate:down
DROP TABLE IF EXISTS class_instances;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'roster_uploads' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE roster_uploads ADD COLUMN uploaded_by uuid;
  END IF;
END $$;

ALTER TABLE roster_uploads
  DROP CONSTRAINT IF EXISTS roster_uploads_uploaded_by_user_id_fkey;
