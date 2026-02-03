-- migrate:up

CREATE TABLE IF NOT EXISTS staff_location_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_location_access_location ON staff_location_access(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_location_access_staff ON staff_location_access(staff_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_staff_location_access_updated_at') THEN
    CREATE TRIGGER trg_staff_location_access_updated_at BEFORE UPDATE ON staff_location_access
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'manager',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_channel_created ON notifications(channel, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, staff_id)
);

CREATE TABLE IF NOT EXISTS ssp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_entry_id uuid REFERENCES roster_entries(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  swimmer_name text,
  swimmer_external_id text,
  status text NOT NULL,
  note text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ssp_events_location_created ON ssp_events(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssp_events_swimmer ON ssp_events(swimmer_external_id);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  detected_start_date date,
  detected_end_date date,
  parsed_count integer,
  inserted_count integer,
  warnings jsonb
);
CREATE INDEX IF NOT EXISTS idx_uploads_location_date ON uploads(location_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_type ON uploads(type);

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_location_created ON activity_log(location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  issue_type text NOT NULL,
  options jsonb,
  selected_option jsonb,
  resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reconciliations_entity ON reconciliations(entity_type, entity_key);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  source text,
  full_name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts (phone);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_contacts_updated_at') THEN
    CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id uuid REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE IF NOT EXISTS billing_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  child_external_id text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'med',
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  internal_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_tickets_location_status ON billing_tickets(location_id, status);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_billing_tickets_updated_at') THEN
    CREATE TRIGGER trg_billing_tickets_updated_at BEFORE UPDATE ON billing_tickets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS retention_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  report_date date,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retention_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES retention_snapshots(id) ON DELETE CASCADE,
  instructor_name text,
  booked integer,
  retained integer,
  percent_this_cycle numeric,
  percent_change numeric
);
CREATE INDEX IF NOT EXISTS idx_retention_rows_snapshot ON retention_rows(snapshot_id);

CREATE TABLE IF NOT EXISTS aged_accounts_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  report_date date,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aged_accounts_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES aged_accounts_snapshots(id) ON DELETE CASCADE,
  bucket text,
  amount numeric,
  total numeric
);
CREATE INDEX IF NOT EXISTS idx_aged_accounts_rows_snapshot ON aged_accounts_rows(snapshot_id);

CREATE TABLE IF NOT EXISTS drop_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  drop_date date,
  swimmer_name text,
  reason text,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drop_events_location_date ON drop_events(location_id, drop_date DESC);

CREATE TABLE IF NOT EXISTS enrollment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  event_date date,
  swimmer_name text,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrollment_events_location_date ON enrollment_events(location_id, event_date DESC);

CREATE TABLE IF NOT EXISTS acne_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  lead_date date,
  full_name text,
  email text,
  phone text,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acne_leads_location_date ON acne_leads(location_id, lead_date DESC);

-- migrate:down
-- No down migration
