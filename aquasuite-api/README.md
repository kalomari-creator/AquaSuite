# AquaSuite API

## Overview
Fastify API for AquaSuite. Enforces RBAC, location scoping, roster ingestion, reports, and integrations.

## Env Vars (names only)
- DATABASE_URL
- HOMEBASE_API_KEY
- HUBSPOT_ACCESS_TOKEN
- LOCATION_UUID_CA / LOCATION_UUID_NV / LOCATION_UUID_NY / LOCATION_UUID_TX
- DEFAULT_LOCATION_KEY

## Migrations
- Location: /opt/aquasuite/aquasuite-api/db/migrations
- Use dbmate or existing migration workflow.
- Additive changes only.

## Key Endpoints (partial)
- GET /health
- GET /meta
- GET /admin/config-check (admin-only)
- POST /auth/login
- GET /me
- GET /locations
- GET /class-instances
- GET /roster-entries
- POST /uploads/roster
- POST /reports/upload

## RBAC + Location
- All location-scoped endpoints require location_id + access checks.
- Admin-only endpoints must use requireAdmin.

## Safety
- Never log secrets or raw integration responses.
- Avoid storing tokens in DB; store only mappings and sanitized errors.
