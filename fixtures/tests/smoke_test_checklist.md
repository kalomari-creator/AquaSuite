# AquaSuite Smoke Test Checklist

## Authentication

### Login Flow
- [ ] Login screen loads correctly
- [ ] Valid credentials (admin/1234) grant access
- [ ] Invalid credentials show error message
- [ ] Logout clears session and shows login screen
- [ ] Logged-out users cannot see app content
- [ ] App panel hidden when not authenticated

### TOTP 2FA (if enabled)
- [ ] TOTP enrollment generates QR code
- [ ] Valid TOTP code verifies successfully
- [ ] Invalid TOTP code shows error
- [ ] Backup codes work for recovery
- [ ] Rate limiting triggers after 5 failed attempts

## Navigation

### Menu Behavior
- [ ] Hamburger menu opens navigation drawer
- [ ] All nav items are clickable
- [ ] Navigation to each view works
- [ ] Gear menu opens settings panel
- [ ] Location selector works
- [ ] Date picker works
- [ ] "Today" button sets current date

### Role-Based Access
- [ ] Admin sees all tabs
- [ ] Admin sees "Global / All Locations" option
- [ ] Manager sees appropriate tabs
- [ ] Instructor sees limited tabs
- [ ] Announcer tab only visible at Westchester

## Roster View

### Display
- [ ] Roster table renders with correct columns
- [ ] Time blocks display correctly
- [ ] One main time bubble visible, clicking expands others
- [ ] Each swimmer is one clean row
- [ ] Instructor name shown (not redundant)
- [ ] Substitute shows "Scheduled: X" secondary line
- [ ] Zone displays correctly
- [ ] Flags (first-time, makeup, owes) display as icons

### Attendance
- [ ] Present (✓) button works
- [ ] Absent (✗) button works
- [ ] Clicking same button toggles off (unselect)
- [ ] Attendance saves with "Saving..." then "Saved ✓"
- [ ] Bulk "Mark present" works
- [ ] Bulk "Clear attendance" works

### Time Blocks
- [ ] Time block selector shows available times
- [ ] Selecting time filters roster
- [ ] Auto-advance works 3 minutes before class ends
- [ ] "End of day. Thank you." shows after final class

### Search & Filters
- [ ] Search filters by swimmer name
- [ ] Instructor filter works
- [ ] Clear filters works

## Uploads

### Daily Roster Upload
- [ ] File input accepts .html files
- [ ] Upload confirmation modal appears
- [ ] Shows correct location in modal
- [ ] Merge/Replace mode toggle works
- [ ] Upload completes with success message
- [ ] Uploaded roster appears in history

### Report Uploads
- [ ] ACNE upload works with preflight
- [ ] New Enrollments upload works
- [ ] Instructor Retention upload works
- [ ] Aged Accounts upload works
- [ ] Drop List upload works

## Reports

### All Reports
- [ ] Date range filters work
- [ ] Instructor filter works
- [ ] Refresh button reloads data

### Enrollment Tracker
- [ ] Chart renders
- [ ] Table displays data
- [ ] By Location breakdown shows
- [ ] By Staff breakdown shows
- [ ] Export CSV works

### Instructor Retention
- [ ] Chart renders
- [ ] Table displays retention percentages
- [ ] Export CSV works

### Aged Accounts
- [ ] Chart renders with buckets
- [ ] Table shows accounts by aging
- [ ] Export CSV works

### Drop List
- [ ] Chart renders
- [ ] Table shows dropped students
- [ ] Export CSV works

### Roster Health
- [ ] KPI cards display
- [ ] Table shows health metrics
- [ ] Export CSV works

## Staff Management

### Staff List
- [ ] Staff directory loads
- [ ] Search filters correctly
- [ ] User admin (admin only) shows create form

### Homebase Sync
- [ ] Status shows connection state
- [ ] Sync button triggers sync (when configured)
- [ ] Last sync time displays
- [ ] Errors display (without secrets)

## Observations

### Observation Form
- [ ] Class selector loads classes
- [ ] Instructor field populates
- [ ] Load roster button works
- [ ] Swimmer list renders
- [ ] Notes field saves
- [ ] Save observation works

### Observation Dashboard
- [ ] Past observations load
- [ ] Filtering works

## Intakes

- [ ] Gmail connection status shows
- [ ] Intake list renders
- [ ] Status filter works
- [ ] Print button works

## Notifications

### General Tab
- [ ] Notifications load
- [ ] Read/unread state works
- [ ] Click marks as read

### Manager Tab
- [ ] Manager notifications load
- [ ] SSP pass notifications appear here

## Activity Feed

- [ ] Activity feed loads
- [ ] Date range filters work
- [ ] Event type filter works
- [ ] User filter works

## SSP (Safe Swimmer Pool)

- [ ] Notes modal opens from roster
- [ ] "Passed SSP" button works
- [ ] SSP history displays
- [ ] SSP badge shows on roster row
- [ ] Manager notification created

## UI/UX Quality

### Visual
- [ ] Colors are bright and high-contrast
- [ ] Text is readable
- [ ] Spacing is consistent
- [ ] Icons are clear

### Responsive
- [ ] Phone layout works
- [ ] Tablet layout works
- [ ] Desktop layout works
- [ ] Layout preview modes work

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus states are visible
- [ ] Contrast meets WCAG AA

### Polish
- [ ] Loading states show
- [ ] Empty states are friendly
- [ ] Error messages are user-friendly
- [ ] Version shows in footer
- [ ] Undo toast appears for risky actions

## API Endpoints

### Core
- [ ] `GET /health` returns `{ ok: true }`
- [ ] `GET /meta` returns version info
- [ ] `POST /auth/login` authenticates users
- [ ] `GET /locations` returns location list

### Roster
- [ ] `GET /roster-entries?locationId=&date=` returns entries
- [ ] `GET /class-instances?locationId=&date=` returns classes
- [ ] `POST /attendance` updates attendance
- [ ] `POST /uploads/roster` handles upload

### Reports
- [ ] `POST /reports/preflight` validates report
- [ ] `POST /reports/upload` ingests report
- [ ] `GET /reports/retention` returns data
- [ ] `GET /reports/aged-accounts` returns data
- [ ] `GET /reports/drop-list` returns data
- [ ] `GET /reports/enrollment-tracker` returns data

### Integrations
- [ ] `GET /integrations/homebase/status` returns status
- [ ] `GET /integrations/hubspot/status` returns status

## Local Development Verification

```bash
# 1. Start database
docker-compose up -d postgres

# 2. Run migrations
cd aquasuite-api && npm run db:up

# 3. Seed demo data
psql -d aquasuite -f fixtures/seed.sql

# 4. Start API
cd aquasuite-api && npm run dev

# 5. Start frontend
cd aquasuite_app/web_v1 && npm run dev

# 6. Open browser
open http://localhost:5173

# 7. Login
# Username: admin
# PIN: 1234

# 8. Verify roster loads for Westchester
```
