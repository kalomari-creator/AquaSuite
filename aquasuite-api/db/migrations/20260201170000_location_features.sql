-- migrate:up
UPDATE locations
SET features = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(features, '{}'::jsonb), '{roster_enabled}', 'true'::jsonb, true),
      '{announcer_enabled}', to_jsonb(COALESCE(announcer_enabled, false)), true
    ),
    '{reports_enabled}', 'false'::jsonb, true
  ),
  '{observations_enabled}', 'false'::jsonb, true
);

UPDATE locations
SET announcer_enabled = true,
    features = jsonb_set(COALESCE(features, '{}'::jsonb), '{announcer_enabled}', 'true'::jsonb, true)
WHERE code = 'slw' OR name ILIKE '%Westchester%';

UPDATE locations
SET announcer_enabled = false,
    features = jsonb_set(COALESCE(features, '{}'::jsonb), '{announcer_enabled}', 'false'::jsonb, true)
WHERE (code IS DISTINCT FROM 'slw' AND name NOT ILIKE '%Westchester%');

UPDATE locations
SET features = jsonb_set(
  jsonb_set(COALESCE(features, '{}'::jsonb), '{reports_enabled}', 'true'::jsonb, true),
  '{observations_enabled}', 'true'::jsonb, true
)
WHERE code = 'slw' OR name ILIKE '%Westchester%';

-- migrate:down
-- No down migration
