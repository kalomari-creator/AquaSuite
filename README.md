# AquaSuite V1

AquaSuite is the web-first operations system for SwimLabs locations. It replaces the older Announcer workflow with a unified web app for roster uploads, schedule visibility, attendance-ready data, and reporting. V1 focuses on iClassPro roll sheet ingestion and schedule display with role-aware views.

AquaSuite runs as a Fastify API backed by Postgres and a static web client served by nginx. All data is scoped to a location and accessed via authenticated sessions.

## Architecture (text diagram)

User Browser
  -> nginx (/var/www/aquasuite)
  -> /api (nginx proxy) -> Fastify API (PM2: aquasuite-api, 127.0.0.1:3000)
  -> Postgres (aquasuite)

## Folder structure
- `aquasuite-api/` Fastify API, migrations, schema
- `aquasuite_app/` App source (Flutter project + V1 static web in `web_v1/`)
- `uploads/` Stored roll sheet HTML files (not in git)
- `deploy.sh` Deployment helper

## Run locally vs server
Local (if running locally on a dev box):
- API: `cd aquasuite-api && npm install && npm run db:up && npm run dev`
- Web: serve `aquasuite_app/web_v1/` using any static server, proxy `/api` to the API

Server (Ubuntu):
- API managed by PM2: `pm2 restart aquasuite-api --update-env`
- Web root: `/var/www/aquasuite`
- Nginx proxies `/api` to `127.0.0.1:3000`

## Auth flow
- `POST /auth/login` with `{ username, pin }`
- API returns token (Bearer), used for all `/api` calls
- Sessions stored in DB, validated via bearer token on each request

## What “V1 complete” means
- Log in, select a location
- Upload iClassPro HTML roll sheet in the UI
- Classes parse correctly into `class_instances`
- Instructors can view “My Schedule”; admins can view full roster
- Basic report summary from class list

## Out of scope for V1
- Full attendance marking workflow
- HubSpot sync writes
- Advanced reporting (beyond class summaries)
- Payroll, billing, CRM export
