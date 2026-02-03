-- AquaSuite Demo Seed Script
-- Run with: psql -d aquasuite -f fixtures/seed.sql

-- Note: This script uses UUIDs. In production, these would be auto-generated.

BEGIN;

-- Clear existing demo data (optional - comment out if you want to preserve)
-- DELETE FROM roster_entries WHERE location_id IN (SELECT id FROM locations WHERE code IN ('NY', 'CA'));
-- DELETE FROM class_instances WHERE location_id IN (SELECT id FROM locations WHERE code IN ('NY', 'CA'));

-- Insert demo locations if not exists
INSERT INTO locations (id, name, code, state, timezone, features)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Westchester', 'NY', 'NY', 'America/New_York',
   '{"roster_enabled": true, "announcer_enabled": true, "reports_enabled": true, "observations_enabled": true}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', 'Los Angeles', 'CA', 'CA', 'America/Los_Angeles',
   '{"roster_enabled": true, "announcer_enabled": false, "reports_enabled": true, "observations_enabled": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Insert demo admin user (PIN: 1234)
INSERT INTO users (id, username, first_name, last_name, email, pin_hash, role_key, is_active)
VALUES (
  'u0000000-0000-0000-0000-000000000001',
  'admin',
  'Demo',
  'Admin',
  'admin@demo.local',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- hashed "1234"
  'admin',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Give admin access to all locations
INSERT INTO user_location_access (user_id, location_id)
SELECT 'u0000000-0000-0000-0000-000000000001', id FROM locations
ON CONFLICT DO NOTHING;

-- Insert demo instructor user (PIN: 1234)
INSERT INTO users (id, username, first_name, last_name, email, pin_hash, role_key, is_active)
VALUES (
  'u0000000-0000-0000-0000-000000000002',
  'sjohnson',
  'Sarah',
  'Johnson',
  'sarah@demo.local',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'instructor',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Give instructor access to NY location
INSERT INTO user_location_access (user_id, location_id)
VALUES ('u0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Insert demo class instances for today
INSERT INTO class_instances (id, location_id, class_date, class_name, start_time, end_time, instructor_name, scheduled_instructor, is_sub)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'GROUP: Beginner Level 1', '09:00', '09:30', 'Sarah Johnson', 'Sarah Johnson', false),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'GROUP: Intermediate Level 2', '09:30', '10:00', 'Mike Davis', 'Tom Wilson', true),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'PRIVATE: 30 Min Private', '10:00', '10:30', 'Sarah Johnson', 'Sarah Johnson', false),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'GROUP: Advanced Swimmer', '10:30', '11:00', 'Tom Wilson', 'Tom Wilson', false)
ON CONFLICT (id) DO NOTHING;

-- Insert demo roster entries
INSERT INTO roster_entries (id, location_id, class_instance_id, class_date, start_time, class_name, swimmer_name, age_text, program, level, instructor_name, scheduled_instructor, actual_instructor, is_sub, zone, attendance, flag_first_time, flag_makeup, flag_owes, balance_amount)
VALUES
  -- Beginner Level 1
  ('r0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', CURRENT_DATE, '09:00', 'GROUP: Beginner Level 1', 'Emma Smith', '5', 'GROUP', 'Beginner Level 1', 'Sarah Johnson', 'Sarah Johnson', 'Sarah Johnson', false, 1, null, false, false, false, 0),
  ('r0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', CURRENT_DATE, '09:00', 'GROUP: Beginner Level 1', 'Lucas Rodriguez', '6', 'GROUP', 'Beginner Level 1', 'Sarah Johnson', 'Sarah Johnson', 'Sarah Johnson', false, 1, null, true, false, false, 0),
  ('r0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', CURRENT_DATE, '09:00', 'GROUP: Beginner Level 1', 'Lily Chen', '4', 'GROUP', 'Beginner Level 1', 'Sarah Johnson', 'Sarah Johnson', 'Sarah Johnson', false, 1, null, false, false, true, 45),

  -- Intermediate Level 2 (with substitute)
  ('r0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', CURRENT_DATE, '09:30', 'GROUP: Intermediate Level 2', 'Aiden Johnson', '7', 'GROUP', 'Intermediate Level 2', 'Mike Davis', 'Tom Wilson', 'Mike Davis', true, 2, null, false, false, false, 0),
  ('r0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', CURRENT_DATE, '09:30', 'GROUP: Intermediate Level 2', 'Sophia Williams', '8', 'GROUP', 'Intermediate Level 2', 'Mike Davis', 'Tom Wilson', 'Mike Davis', true, 2, null, false, true, false, 0),

  -- Private Lesson
  ('r0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', CURRENT_DATE, '10:00', 'PRIVATE: 30 Min Private', 'Oliver Brown', '9', 'PRIVATE', '30 Min Private', 'Sarah Johnson', 'Sarah Johnson', 'Sarah Johnson', false, 3, null, false, false, false, 0),

  -- Advanced Swimmer
  ('r0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', CURRENT_DATE, '10:30', 'GROUP: Advanced Swimmer', 'Isabella Garcia', '10', 'GROUP', 'Advanced Swimmer', 'Tom Wilson', 'Tom Wilson', 'Tom Wilson', false, 4, null, false, false, false, 0),
  ('r0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', CURRENT_DATE, '10:30', 'GROUP: Advanced Swimmer', 'Noah Martinez', '11', 'GROUP', 'Advanced Swimmer', 'Tom Wilson', 'Tom Wilson', 'Tom Wilson', false, 4, null, false, false, false, 0)
ON CONFLICT (id) DO NOTHING;

-- Insert demo notifications
INSERT INTO notifications (id, location_id, type, title, body, message, channel, created_at)
VALUES
  ('n0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ssp_pass', 'SSP Pass Recorded', 'Emma Smith passed SSP (Sarah Johnson)', 'SSP pass recorded', 'manager', CURRENT_TIMESTAMP - interval '1 hour'),
  ('n0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'roster_upload', 'Roster Uploaded', 'Daily roster uploaded for Westchester', 'Roster upload complete', 'general', CURRENT_TIMESTAMP - interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- Insert demo SSP event
INSERT INTO ssp_events (id, roster_entry_id, location_id, swimmer_name, status, note, created_by_user_id, created_at)
VALUES
  ('s0000000-0000-0000-0000-000000000001', 'r0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Emma Smith', 'passed', 'Excellent progress', 'u0000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP - interval '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Mark Emma Smith as having passed SSP
UPDATE roster_entries SET ssp_passed = true, ssp_passed_at = CURRENT_TIMESTAMP - interval '1 hour' WHERE id = 'r0000000-0000-0000-0000-000000000001';

COMMIT;

-- Summary
SELECT 'Seed completed successfully' as status;
SELECT 'Locations: ' || COUNT(*) FROM locations;
SELECT 'Users: ' || COUNT(*) FROM users;
SELECT 'Class Instances: ' || COUNT(*) FROM class_instances;
SELECT 'Roster Entries: ' || COUNT(*) FROM roster_entries;
SELECT 'Notifications: ' || COUNT(*) FROM notifications;
