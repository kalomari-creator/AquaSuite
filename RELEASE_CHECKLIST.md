# AquaSuite Release Checklist

## Pre-Release Checks

### Code Quality
- [ ] All TypeScript/JavaScript compiles without errors
- [ ] No console errors in browser dev tools
- [ ] ESLint passes (if configured)
- [ ] No hardcoded secrets or API keys in code
- [ ] All environment variables documented in `.env.example`

### Authentication & Security
- [ ] Login works with valid credentials
- [ ] Login fails gracefully with invalid credentials
- [ ] TOTP enrollment flow works
- [ ] TOTP verification works with valid codes
- [ ] TOTP fails gracefully with invalid codes
- [ ] Backup codes work for recovery
- [ ] Rate limiting prevents brute force attacks
- [ ] Session tokens expire correctly
- [ ] Logged-out users cannot access protected routes

### Core Features
- [ ] Roster loads correctly for each location
- [ ] Attendance marking (present/absent) works
- [ ] Time blocks auto-advance 3 minutes before class ends
- [ ] End of day message shows after final class
- [ ] Roster search filters correctly
- [ ] Instructor filter works
- [ ] Bulk attendance operations work

### Uploads
- [ ] Daily roster upload works
- [ ] Report uploads work (ACNE, Retention, Aged Accounts, Drop List, New Enrollments)
- [ ] Upload confirmation modal shows correct location
- [ ] Upload history displays correctly

### Reports
- [ ] Enrollment tracker renders with charts
- [ ] Instructor retention report renders with charts
- [ ] Aged accounts report renders with charts
- [ ] Drop list report renders with charts
- [ ] Roster health report shows KPIs
- [ ] CSV exports work for all report types
- [ ] Date range filters work

### Integrations
- [ ] Homebase status page shows connection status
- [ ] Homebase sync button works (when configured)
- [ ] HubSpot status shows correctly
- [ ] Gmail OAuth flow works (when configured)

### UI/UX
- [ ] Navigation hamburger menu works
- [ ] Gear menu opens/closes correctly
- [ ] Location selector shows no duplicates
- [ ] Admin sees "Global / All Locations" option
- [ ] Version displays in footer
- [ ] Responsive design works on phone/tablet/desktop
- [ ] Empty states show friendly messages
- [ ] Error states show user-friendly messages

### Notifications
- [ ] SSP pass creates manager notification
- [ ] Notifications list loads correctly
- [ ] Notification read status updates

## Deployment Steps

### 1. Update Version
```bash
# Update APP_VERSION in aquasuite-api/src/index.ts
# Current pattern: const APP_VERSION = 'X.Y.Z'
```

### 2. Build Frontend
```bash
cd aquasuite_app/web_v1
npm run build
```

### 3. Run Database Migrations
```bash
cd aquasuite-api
npm run db:up
```

### 4. Deploy API
```bash
cd aquasuite-api
npm run build
pm2 restart aquasuite-api
```

### 5. Deploy Frontend
```bash
rsync -avz --delete aquasuite_app/web_v1/dist/ /var/www/aquasuite/
```

### 6. Verify Deployment
- [ ] Health check: `curl https://api.aqua-suite.app/health`
- [ ] Version check: `curl https://api.aqua-suite.app/meta`
- [ ] Frontend loads: `https://app.aqua-suite.app`
- [ ] Login works
- [ ] Roster loads

## Rollback Procedure

If issues are found after deployment:

1. **Revert Frontend**
   ```bash
   # Restore previous build from backup
   rsync -avz /var/backups/aquasuite/web_v1/ /var/www/aquasuite/
   ```

2. **Revert API**
   ```bash
   cd aquasuite-api
   git checkout HEAD~1
   npm run build
   pm2 restart aquasuite-api
   ```

3. **Revert Database** (if migrations were run)
   ```bash
   # Only if necessary and safe
   npm run db:down
   ```

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.2.0 | TBD | TOTP improvements, undo toast, footer version |
| 0.1.0 | Initial | Initial release |

## Contacts

- **Tech Lead**: [Your contact]
- **On-Call**: [Your contact]
- **Escalation**: [Your contact]
