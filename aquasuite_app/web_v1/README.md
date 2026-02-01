# AquaSuite Web V1 (Static)

## How auth works in the browser
- Login via `/api/auth/login`
- Token stored in `localStorage` as `aqua_token`
- All API calls use `Authorization: Bearer <token>`

## Endpoints used
- `POST /api/auth/login`
- `GET /api/locations`
- `GET /api/class-instances`
- `GET /api/class-instances/mine`
- `POST /api/uploads/roster`
- `GET /api/roster-uploads`

## Role-based view logic
- UI defaults to “My Schedule” when role key is `staff`
- Users can toggle to “Full Roster” at any time

## Where to add pages
- Add new sections in `app.js` and new `<section>` blocks in `index.html`
- Keep `/api` path prefix for all calls

## Manual test checklist
1) Log in with admin user
2) Select location and date
3) Upload HTML roll sheet
4) Verify schedule list shows classes
5) Toggle My Schedule vs Full Roster
