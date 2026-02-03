# AquaSuite v0.1 Smoke Checklist

## API
- POST /auth/login (admin / 1590) returns token
- GET /locations returns list + features
- GET /locations/:id returns location
- GET /roster-entries?locationId=&date= returns entries
- POST /uploads/roster?locationId=&date= accepts roll sheet
- POST /attendance updates a row
- POST /reports/preflight rejects wrong location
- POST /reports/upload ingests report
- GET /analytics/retention returns snapshots
- POST /observations saves observation
- GET /observations returns list

## Web
- Login screen loads
- Location + date selects work
- Roster list renders with time blocks
- Add swimmer (local) adds row + notes modal saves
- Upload roll sheet updates roster
- Reports tab: preflight + upload + retention list (Westchester)
- Observations tab: load roster classes, add swimmer, save observation (Westchester)
- Announcer tab visible only at Westchester
