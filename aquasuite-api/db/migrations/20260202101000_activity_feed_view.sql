-- migrate:up
CREATE VIEW activity_feed AS
SELECT
  ae.id,
  ae.marked_at AS created_at,
  'attendance'::text AS event_type,
  ae.roster_entry_id AS entity_id,
  NULL::uuid AS location_id,
  ae.marked_by_user_id AS actor_user_id,
  jsonb_build_object('status', ae.marked_status, 'note', ae.note) AS payload
FROM attendance_events ae
UNION ALL
SELECT
  ra.id,
  ra.created_at,
  'admin_action'::text AS event_type,
  ra.target_user_id AS entity_id,
  ra.location_id,
  ra.actor_user_id,
  ra.metadata_json
FROM admin_actions ra
UNION ALL
SELECT
  ru.id,
  ru.uploaded_at,
  'roster_upload'::text AS event_type,
  ru.id AS entity_id,
  ru.location_id,
  ru.uploaded_by_user_id AS actor_user_id,
  jsonb_build_object('filename', ru.original_filename, 'bytes', ru.bytes) AS payload
FROM roster_uploads ru
UNION ALL
SELECT
  rpu.id,
  rpu.uploaded_at,
  'report_upload'::text AS event_type,
  rpu.id AS entity_id,
  rpu.location_id,
  rpu.uploaded_by_user_id AS actor_user_id,
  jsonb_build_object('type', rpu.report_type, 'title', rpu.report_title) AS payload
FROM report_uploads rpu
UNION ALL
SELECT
  io.id,
  io.created_at,
  'observation'::text AS event_type,
  io.id AS entity_id,
  io.location_id,
  NULL::uuid AS actor_user_id,
  jsonb_build_object('instructor', io.instructor_name) AS payload
FROM instructor_observations io;

-- migrate:down
DROP VIEW IF EXISTS activity_feed;
