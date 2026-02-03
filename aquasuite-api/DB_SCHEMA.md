# AquaSuite DB Schema (v0.1)

## Source-of-truth tables
- `locations` (now includes email_tag, hubspot_tag, intake_enabled, announcer_enabled)
- `users`, `roles`, `sessions`
- `user_location_access`
- `roster_uploads`

## Derived tables
- `class_instances` (class-level schedule)
- `roster_entries` (swimmer-level roster + attendance + flags)

## Staff + alias mapping
- `staff`
- `staff_locations`
- `staff_instructor_aliases`

## Intake
- `client_intakes`
- `client_intake_activity` (optional)
- `gmail_oauth_tokens`

## Clients
- `clients`

## Notes
- Wage fields are not stored anywhere by design
- HubSpot and Gmail are optional and should not break core flows
