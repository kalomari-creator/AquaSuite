# AquaSuite V1

AquaSuite is the SwimLabs operations web app. V1 focuses on the roster workflow: uploading iClassPro condensed roll sheet HTML, parsing swimmers and classes, and presenting the Announcer-style roster UI for deck staff and instructors.

## Architecture (text diagram)
Browser
  -> nginx (static UI in /var/www/aquasuite)
  -> /api (nginx proxy) -> Fastify API (PM2: aquasuite-api, 127.0.0.1:3000)
  -> Postgres (aquasuite)

## Repo structure
- `aquasuite-api/` Fastify API + dbmate migrations + schema
- `aquasuite_app/web_v1/` Static V1 UI (Announcer-style roster)
- `uploads/` Stored HTML uploads (not in git)

## Run locally
- API: `cd aquasuite-api && npm install && npm run db:up && npm run dev`
- UI: serve `aquasuite_app/web_v1` with any static server and proxy `/api` to the API

## Run on server
- API: `pm2 restart aquasuite-api --update-env`
- UI: `/var/www/aquasuite` is the web root

## Auth flow
- `POST /auth/login` with `{ username, pin }`
- Use `Authorization: Bearer <token>` for all `/api` calls

## V1 Complete means
- Upload HTML roll sheet in UI
- Parsed roster entries + class instances stored in Postgres
- Announcer-style roster UI with time blocks, filters, attendance
- My Schedule / Full Roster toggle works

## Out of scope for V1
- Full attendance analytics
- HubSpot sync
- Announcer audio controls (future)
