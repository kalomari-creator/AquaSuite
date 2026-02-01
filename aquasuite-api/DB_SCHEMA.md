# AquaSuite DB Schema (V1)

## Source-of-truth tables
- `locations` (each site)
- `users`, `roles`, `sessions`
- `user_location_access` (location scoping)
- `roster_uploads` (raw HTML upload metadata)

## Derived tables
- `class_instances` (parsed classes from roll sheets)

## Relationships
- `roster_uploads.location_id -> locations.id`
- `roster_uploads.uploaded_by_user_id -> users.id`
- `class_instances.location_id -> locations.id`
- `class_instances.upload_id -> roster_uploads.id`

## Notes for future changes
- Attendance should be stored separately (e.g., `attendance_events`)
- HubSpot imports should attach contacts to `locations` via system email
- Avoid deleting `class_instances` when reprocessing; prefer soft delete or new upload link
