# AquaSuite Web V1

## Where it lives
- Source: `aquasuite_app/web_v1/`
- Deployed: `/var/www/aquasuite`

## Auth
- Login via `/api/auth/login`
- Token stored in `localStorage` (`aqua_token`)

## API endpoints used
- `GET /api/locations`
- `GET /api/roster-entries`
- `GET /api/roster-entries/mine`
- `POST /api/uploads/roster`
- `POST /api/attendance`
- `POST /api/attendance/bulk`
- `GET /api/roster-uploads`

## Role behavior
- Default view is “My Schedule” for role key `staff`
- Users can toggle to “Full Roster”

## Manual test
1) Login
2) Select location/date
3) Upload roll sheet
4) Select time block
5) Mark attendance
