# AquaSuite V1.0

## Architecture
- API: `/opt/aquasuite/aquasuite-api` (Fastify + Postgres)
- Web: `/opt/aquasuite/aquasuite_app/web_v1` (static app)
- Web deploy: `/var/www/aquasuite` (rsync from `web_v1`)
- Process manager: `pm2` (aquasuite-api)
- Nginx: reverse proxy (/api)

## Auth + Roles
- Roles: `admin`, `manager`, `aquatics_staff` (UI label for instructor)
- Auth wall: logged-out users see only login UI; no protected fetches.
- Location access: admin global; manager/location scoped; aquatics_staff roster-only.

## Navigation + Routes
- Top-level tabs map to routes (`#/roster`, `#/uploads/...`, `#/reports/...`, etc.)
- Sub-tabs per page (reports, uploads, staff, intakes, locations, notifications).

## Uploads + Reports
- Daily roster upload per location/date with merge/replace modes.
- Report uploads per type: ACNE, New Enrollments, Retention, Aged Accounts, Drop List.
- Upload history (global for admin, scoped otherwise) in `/uploads/history`.
- Reports are global-first (admin defaults to All Locations).

## Integrations
- Homebase: read-only fetch + sync into AquaSuite DB (staff + shifts). Manual Sync Now.
- HubSpot: **read-only** (no create/update/notes). Optional contact sync into AquaSuite DB.

## Database
- Additive migrations in `aquasuite-api/db/migrations` only.
- Core tables: `staff_location_access`, `notifications` + `notification_reads`, `ssp_events`,
  `uploads`, `contacts` + merge tables, `billing_tickets`, `reconciliations`, report snapshots.

## Deploy (Quick)
1) Apply migrations: `cd /opt/aquasuite/aquasuite-api && npm run db:up`
2) Update web assets in `/opt/aquasuite/aquasuite_app/web_v1`
3) Deploy web: `sudo rsync -a --delete /opt/aquasuite/aquasuite_app/web_v1/ /var/www/aquasuite/`
4) Restart API: `pm2 restart aquasuite-api --update-env`

## Env Vars (names only)
- DATABASE_URL
- HOMEBASE_API_KEY
- HUBSPOT_ACCESS_TOKEN
- LOCATION_UUID_CA / LOCATION_UUID_NV / LOCATION_UUID_NY / LOCATION_UUID_TX
- DEFAULT_LOCATION_KEY
