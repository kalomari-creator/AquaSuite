# AquaSuite QA Runbook (Roster, Uploads, Reports)

## Login / Logged-Out
1. Open the app.
2. Verify the logged-out state shows only the login card (no roster table or other UI visible).
3. Log in as an `admin` (or `manager`) user.

## Locations (Admin Consistency)
1. Open `Roster`.
2. Open the Location dropdown.
3. Verify it always contains:
   - `Global / All Locations`
   - Every physical location (no duplicates)
4. Switch between several locations and verify the dropdown list stays identical.
5. If locations fail to load, verify the banner appears with a `Retry` button and the app does not log you out.

## Roster: Time Dropdown + Time Blocks (Announcer-Like)
1. Go to `Roster`.
2. Pick a `Location` and `Date`.
3. Open the time dropdown.
4. If multiple classes share the same start time:
   - Verify each option is distinguishable (Start-End, Program/Type, Level; optional Instructor/Zone).
   - Select one option and verify:
     - The banner reflects that same class (not another class at the same time).
     - The roster table matches that same class.
5. Empty states:
   - No location/date selected: `Select a location and date to load roster.`
   - `Global / All Locations` selected: `Select a specific location to load roster.`
   - No roster uploaded for that location/date: `No roster uploaded for this location/date.`
   - Class exists but has zero swimmers: class header + `No swimmers in this class.`
6. Bulk attendance:
   - Select a specific class time (not All times).
   - Click `Mark present` or `Clear attendance`.
   - Verify only swimmers in that selected class are updated.

## Uploads
### Roster Upload
1. Go to `Uploads` (or use the `Roster Upload` card on the Roster page).
2. Select a roster HTML file and click `Upload`.
3. In the confirm modal, choose:
   - `Merge` to upsert into existing day/range
   - `Replace` to overwrite existing day/range
4. Confirm upload.
5. Verify you can select the exact same file again immediately (file input resets after success/fail).

### Report Uploads (ACNE, New Enrollments, Retention, Aged Accounts, Drop List)
1. Go to `Reports` and select a report tab with an upload card.
2. Select a report HTML file and click `Preflight`.
3. If existing data is detected for the selected location/date range:
   - Verify the confirm modal shows an "Existing data detected" message.
   - Choose `Merge` or `Replace` and upload.
4. Verify you can re-select the same report file after success/fail (file input resets).

## Reports (Rendering + Dedupe)
### Enrollment Tracker
1. Go to `Reports` -> `Enrollment Tracker`.
2. Set Start/End dates and click `Refresh`.
3. Verify the daily list renders one line per date (not jammed together) and includes:
   - Leads
   - Enrollments
   - First-class signals
4. Verify `By Aquatics Staff` does not repeat the same instructor (case/spacing variants are collapsed).
5. Verify `Work Queue` does not show obvious duplicates (deduped by email, then phone, then name+date).

### Aquatics Staff Retention
1. Go to `Reports` -> `Aquatics Staff Retention`.
2. Click `Refresh`.
3. Verify the list does not contain duplicate-looking instructor blocks for the same location snapshot.
4. If using `Global / All Locations`, verify rows show the location label so entries are not ambiguous.

### Aged Accounts
1. Go to `Reports` -> `Aged Accounts`.
2. Click `Refresh`.
3. If using `Global / All Locations`, verify rows show the location label.

### Drop List
1. Go to `Reports` -> `Drop List`.
2. Click `Refresh`.
3. If using `Global / All Locations`, verify rows show the location label.

## Navigation Smoke Test
1. Use the hamburger menu to navigate through:
   - Roster
   - Uploads
   - Reports
   - Observations
   - Staff
   - Intakes
   - Locations
   - Activity
   - Notifications
   - Announcer
2. Verify each page loads without console errors.
