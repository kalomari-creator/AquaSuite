-- migrate:up
-- Roles
INSERT INTO roles (id, key, label) VALUES
  (10, 'admin', 'Admin'),
  (11, 'manager', 'Manager'),
  (12, 'instructor', 'Instructor'),
  (13, 'readonly', 'Read Only')
ON CONFLICT (id) DO NOTHING;

-- Users: disabled flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

-- user_roles join
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id smallint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- user_locations join
CREATE TABLE IF NOT EXISTS user_locations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);

-- admin actions audit
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_actor ON admin_actions(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);

-- Seed user_roles from legacy primary_role_id
INSERT INTO user_roles (user_id, role_id)
SELECT u.id,
  CASE r.key
    WHEN 'owner' THEN 10
    WHEN 'exec_admin' THEN 10
    WHEN 'virtual_desk' THEN 11
    WHEN 'front_desk' THEN 11
    WHEN 'deck' THEN 12
    WHEN 'staff' THEN 12
    ELSE 13
  END AS role_id
FROM users u
JOIN roles r ON r.id = u.primary_role_id
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Seed user_locations from legacy user_location_access
INSERT INTO user_locations (user_id, location_id, is_default)
SELECT user_id, location_id, is_default
FROM user_location_access
ON CONFLICT (user_id, location_id) DO NOTHING;

-- migrate:down
-- No down migration
