# AquaSuite AI Notes

## System Rules (Do Not Break)
- Logged-out hard wall: only login UI; no protected fetches.
- Frontend must use `/api` or `https://api.aqua-suite.app` only.
- HubSpot is **read-only**: never create/update/merge/push.
- Roster uploads are daily only; backfill by selecting past date.

## Permissions Model
- Roles: admin, manager, aquatics_staff (UI label for instructor).
- Admin: global access, all reports/uploads/integrations.
- Manager: location-scoped, reports/uploads/notifications/SSP/billing.
- Aquatics Staff: roster + notes/attendance only.

## Ingest + Truth Rules
- Attendance truth: Daily roster uploads.
- Enrollment truth: New Enrollments list.
- Drop truth: Drop List report.
- Accounts created truth: ACNE report.
- Billing AR truth: Aged Accounts report.
- Instructor performance truth: Instructor Retention report.
- If sources conflict, create `reconciliations` entry and require manager/admin resolution.

## Reconciliation + Merge Rules
- `reconciliations` table stores conflicts and manager-selected option.
- Contacts merge is reversible via `contact_groups` + `contact_group_members`.
- Duplicate email or phone should prompt merge flow (manager/admin).

## Notifications
- Channels: `general` and `manager`.
- Uploads, parsing warnings, conflicts, staff sync, SSP, billing events -> manager channel.
- Notification reads tracked in `notification_reads`.

## SSP
- Persistent state via `ssp_events` + roster entries.
- Pass/revoke creates manager notification + audit.

## Key Tables (new)
- `staff_location_access`, `notifications`, `notification_reads`, `ssp_events`,
  `uploads`, `activity_log`, `reconciliations`, `contacts`, `contact_groups`,
  `contact_group_members`, `billing_tickets`, report snapshots.

## Homebase
- Sync pulls staff + shifts, upserts AquaSuite `staff` and `staff_location_access`.
- Missing staff email creates manager notification + reconciliation entry.

## HubSpot
- Read-only fetch; optional sync into AquaSuite `contacts`.
- Never write to HubSpot.

## Deploy Notes
- Always apply dbmate migrations.
- Update `/opt/aquasuite/aquasuite_app/web_v1` then rsync to `/var/www/aquasuite`.
- Restart `pm2` for API changes.
