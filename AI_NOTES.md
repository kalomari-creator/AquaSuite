# AquaSuite AI Notes

## DONE and stable
- Fastify API with auth, sessions, location access checks
- Roster uploads stored to disk and tracked in `roster_uploads`
- iClassPro roll sheet parser extracts class name, date, time, instructors, sub flag
- `class_instances` table created and populated on upload
- Endpoints:
  - `POST /uploads/roster`
  - `GET /class-instances`
  - `GET /class-instances/mine`
  - `GET /roster-uploads`
- Static web UI deployed to `/var/www/aquasuite`

## Recently fixed
- Parser updated to match iClassPro condensed roll sheet layout
- `class_instances` migration added (previous migrations were empty)
- `roster_uploads` duplicate column cleaned up (`uploaded_by` dropped)
- Multipart version aligned with Fastify v4

## Sharp edges / do-not-break
- Do NOT edit DB tables manually in psql. Use dbmate migrations only.
- `roster_uploads.stored_path` is required. File must be written before insert.
- `class_instances.start_time` is NOT NULL. Parser must provide times or skip.
- Location access is enforced via `user_location_access`.

## Order of operations for future work
1) Update migrations under `aquasuite-api/db/migrations`
2) Run `npm run db:up` and confirm `db/schema.sql` updates
3) Update API handlers (keep location scope checks)
4) Update static UI in `aquasuite_app/web_v1/` and redeploy to `/var/www/aquasuite`
5) Restart PM2 and run smoke test script

## DO NOT TOUCH
- `uploads/` folder contents in git (should remain untracked)
- `.env` values on the server
- PM2 process names (aquasuite-api, announcer)

## Safe extension notes
Roster uploads:
- Keep `roster_uploads` as the source of raw HTML (stored on disk)
- Use a new migration if adding columns

Schedule parsing:
- Update `src/roster/parseRollsheet.ts`
- Prefer extracting date from header date or report filters

Attendance:
- Extend by adding `roster_entries` or a new `attendance_events` table
- Do not change `class_instances` for attendance state

HubSpot integration:
- Add a new `integrations` module and background job runner
- Map contacts by `locations.system_email` (future column)
