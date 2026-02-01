# AquaSuite DB Schema (V1)

## Source-of-truth tables
- `locations`
- `users`, `roles`, `sessions`
- `user_location_access`
- `roster_uploads`

## Derived tables
- `class_instances` (class-level schedule summary)
- `roster_entries` (swimmer-level roster rows)

## Relationships
- `roster_uploads.location_id -> locations.id`
- `roster_uploads.uploaded_by_user_id -> users.id`
- `class_instances.location_id -> locations.id`
- `class_instances.upload_id -> roster_uploads.id`
- `roster_entries.location_id -> locations.id`
- `roster_entries.upload_id -> roster_uploads.id`

## Notes
- `roster_entries` includes attendance + flags + auto-absent state
- `attendance_events` exists but is not used in V1
- Add new columns via dbmate migrations only
