# AquaSuite AI Notes

## DONE and stable
- Roster uploads: HTML stored to disk and tracked in `roster_uploads`
- iClassPro condensed roll sheet parsing into `class_instances` + `roster_entries`
- Announcer-style roster UI in `aquasuite_app/web_v1`
- Attendance endpoints (`/attendance`, `/attendance/bulk`)

## Recently fixed
- Added `roster_entries` columns for swimmer-based roster UI
- New parser in `aquasuite-api/src/roster/parseRosterEntries.ts`
- API endpoints for roster entries + attendance
- UI updated to match Announcer layout and behavior

## Sharp edges
- Do NOT ALTER tables manually; use dbmate migrations only
- `roster_entries` originally existed with legacy columns; keep new columns additive
- `/uploads/roster` now inserts class + swimmer rows in one transaction

## Future work order
1) Update migrations in `aquasuite-api/db/migrations`
2) Run `npm run db:up` (updates `db/schema.sql`)
3) Update API handlers
4) Update `aquasuite_app/web_v1` and deploy to `/var/www/aquasuite`
5) Restart PM2 and run smoke test scripts

## Safe extension notes
- Roster parsing: edit `parseRosterEntries.ts` and keep date/time parsing in sync with iClassPro output
- Attendance: keep updates in `roster_entries`; use `attendance_events` only if adding history
- HubSpot: add new tables and jobs; do not overload roster tables
