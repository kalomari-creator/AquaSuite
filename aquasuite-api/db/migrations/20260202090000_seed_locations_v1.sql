-- migrate:up
WITH data AS (
  SELECT * FROM (VALUES
    ('smsp', 'Santa Monica (Sunset Park)', 'CA', 'America/Los_Angeles', false, true, false, false, 'CA', 'Santa Monica, CA'),
    ('sum', 'Summerlin', 'NV', 'America/Los_Angeles', false, true, false, false, 'NV', 'Summerlin, NV'),
    ('slw', 'SwimLabs Westchester', 'NY', 'America/New_York', true, true, true, true, 'NY', 'Westchester, NY'),
    ('wood', 'The Woodlands', 'TX', 'America/Chicago', false, true, false, false, 'TX', 'The Woodlands, TX'),
    ('torr', 'Torrance', 'CA', 'America/Los_Angeles', false, true, false, false, 'CA', 'Torrance, CA'),
    ('yonk', 'Yonkers (Riverdale)', 'NY', 'America/New_York', false, true, false, false, 'NY', 'Yonkers, NY')
  ) AS t(code, name, state, timezone, announcer_enabled, roster_enabled, reports_enabled, observations_enabled, location_key, city_state)
)
INSERT INTO locations (code, name, state, timezone, announcer_enabled, intake_enabled, features, location_key, city_state)
SELECT
  code,
  name,
  state,
  timezone,
  announcer_enabled,
  true,
  jsonb_build_object(
    'roster_enabled', roster_enabled,
    'announcer_enabled', announcer_enabled,
    'reports_enabled', reports_enabled,
    'observations_enabled', observations_enabled
  ),
  location_key,
  city_state
FROM data
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  state = EXCLUDED.state,
  timezone = EXCLUDED.timezone,
  announcer_enabled = EXCLUDED.announcer_enabled,
  intake_enabled = true,
  is_active = true,
  features = EXCLUDED.features,
  location_key = EXCLUDED.location_key,
  city_state = EXCLUDED.city_state;

-- migrate:down
-- No down migration
