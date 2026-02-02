import fs from 'fs/promises'
import path from 'path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import pg from 'pg'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { parseIclassproRollsheet } from './parsers/parseRollsheet.js'
import { parseIclassproRosterEntries } from './parsers/parseRosterEntries.js'
import { normalizeName } from './utils/normalizeName.js'
import { preflightReport } from './services/reportPreflight.js'
import { extractInstructorRetention, parseUsDate } from './utils/reportParsing.js'
import { normalizeLocationFeatures } from './services/locationFeatures.js'
import { getGmailAuthUrl, exchangeGmailCode } from './integrations/gmail/oauth.js'
import * as totp from './services/totp.js'

dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })
await app.register(websocket)
await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

function normalizeLocationName(input: string | null | undefined) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}
function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

async function getUserRoleKey(userId: string) {
  const res = await pool.query(
    `SELECT r.key
     FROM users u
     JOIN roles r ON r.id = u.primary_role_id
     WHERE u.id=$1`,
    [userId]
  )
  return res.rowCount ? res.rows[0].key : null
}

async function requireLocationAccess(userId: string, locationId: string) {
  const access = await pool.query(
    `SELECT 1 FROM user_location_access WHERE user_id=$1 AND location_id=$2`,
    [userId, locationId]
  )
  return access.rowCount > 0
}

async function upsertStaffDirectory(locationId: string, fullName: string | null, iclassproStaffId?: string | null) {
  if (!fullName) return null
  const name = fullName.trim()
  if (!name) return null

  const res = await pool.query(
    `INSERT INTO staff_directory (location_id, full_name, iclasspro_staff_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (location_id, full_name) DO UPDATE SET
       iclasspro_staff_id=COALESCE(EXCLUDED.iclasspro_staff_id, staff_directory.iclasspro_staff_id),
       is_active=true
     RETURNING id`,
    [locationId, name, iclassproStaffId || null]
  )
  return res.rows[0]?.id || null
}

async function requireAdmin(userId: string) {
  const key = await getUserRoleKey(userId)
  return key === 'owner' || key === 'exec_admin'
}

async function resolveInstructorStaffId(locationId: string, rawName: string | null) {
  if (!rawName) return null
  const norm = normalizeName(rawName)
  if (!norm) return null

  const alias = await pool.query(
    `SELECT staff_id
     FROM staff_instructor_aliases
     WHERE location_id=$1 AND alias_norm=$2
     LIMIT 1`,
    [locationId, norm]
  )
  if (alias.rowCount) return alias.rows[0].staff_id

  const staffRes = await pool.query(
    `SELECT s.id, s.first_name, s.last_name
     FROM staff_locations sl
     JOIN staff s ON s.id = sl.staff_id
     WHERE sl.location_id=$1 AND sl.is_active=true`,
    [locationId]
  )

  const matches = staffRes.rows.filter((s) => normalizeName(`${s.first_name} ${s.last_name}`) === norm)
  if (matches.length === 1) return matches[0].id

  const initialMatches = staffRes.rows.filter((s) => {
    const first = String(s.first_name || '').trim().toLowerCase()
    const last = String(s.last_name || '').trim().toLowerCase()
    if (!first || !last) return false
    const a = `${first} ${last[0]}`.trim()
    const b = `${first[0]} ${last}`.trim()
    return norm === a || norm === b
  })
  if (initialMatches.length === 1) return initialMatches[0].id

  return null
}

app.get('/health', async () => ({ ok: true, app: 'AquaSuite' }))
const APP_VERSION = '0.2.0'
const BUILD_TIME = new Date().toISOString()

app.get('/meta', async () => ({
  version: APP_VERSION,
  buildTime: BUILD_TIME,
  gitSha: process.env.GIT_SHA || 'dev'
}))



app.get('/ws', { websocket: true }, (connection) => {
  connection.socket.send(JSON.stringify({ type: 'hello', app: 'AquaSuite' }))
})

app.post('/auth/login', async (req, reply) => {
  const body = req.body as { username?: string; pin?: string }
  const username = (body.username || '').trim().toLowerCase()
  const pin = body.pin || ''

  if (!username || !pin) return reply.code(400).send({ error: 'username_and_pin_required' })

  const userRes = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.pin_hash, u.must_change_pin,
            u.primary_role_id, u.is_active, r.key as role_key, r.label as role_label
     FROM users u
     JOIN roles r ON r.id = u.primary_role_id
     WHERE u.username=$1`,
    [username]
  )

  if (userRes.rowCount === 0) return reply.code(401).send({ error: 'invalid_credentials' })
  const user = userRes.rows[0]
  if (!user.is_active) return reply.code(403).send({ error: 'user_inactive' })

  const ok = await bcrypt.compare(pin, user.pin_hash)
  if (!ok) return reply.code(401).send({ error: 'invalid_credentials' })

  const tokenPlain = nanoid(48)
  const tokenHash = sha256(tokenPlain)
  const expiresAt = daysFromNow(30)

  await pool.query(
    `INSERT INTO sessions (session_type, user_id, token_hash, expires_at)
     VALUES ('user', $1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  )

  return reply.send({
    token: tokenPlain,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      roleId: user.primary_role_id,
      roleKey: user.role_key,
      roleLabel: user.role_label,
      mustChangePin: user.must_change_pin
    }
  })
})

// Simple auth hook for protected routes
app.addHook('preHandler', async (req, reply) => {
  const openPaths = new Set(['/health', '/auth/login', '/ws', '/meta', '/integrations/gmail/auth/callback'])
  const pathname = String(req.url || '').split('?')[0]
  if (openPaths.has(pathname)) return

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return reply.code(401).send({ error: 'missing_token' })

  const tokenHash = sha256(token)
  const sessRes = await pool.query(
    `SELECT id, user_id, expires_at, revoked_at
     FROM sessions WHERE token_hash=$1`,
    [tokenHash]
  )
  if (sessRes.rowCount === 0) return reply.code(401).send({ error: 'invalid_token' })

  const sess = sessRes.rows[0]
  if (sess.revoked_at) return reply.code(401).send({ error: 'revoked_token' })
  if (new Date(sess.expires_at).getTime() < Date.now()) return reply.code(401).send({ error: 'expired_token' })

  ;(req as any).session = sess
})

app.get('/me', async (req) => {
  const sess = (req as any).session as { user_id: string }
  const res = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.primary_role_id, u.must_change_pin, u.is_active,
            r.key as role_key, r.label as role_label
     FROM users u
     JOIN roles r ON r.id = u.primary_role_id
     WHERE u.id=$1`,
    [sess.user_id]
  )
  return { user: res.rows[0] }
})

app.get('/locations', async (req) => {
  const sess = (req as any).session as { user_id: string }
  const res = await pool.query(
    `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features,
            l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled
     FROM user_location_access ula
     JOIN locations l ON l.id = ula.location_id
     WHERE ula.user_id = $1 AND l.is_active = true
     ORDER BY ula.is_default DESC, l.name ASC`,
    [sess.user_id]
  )
  const locations = res.rows.map((loc) => ({
    ...loc,
    features: normalizeLocationFeatures(loc)
  }))

  return { locations }
})

app.get('/locations/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.params as any)?.id as string
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features,
            l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled, l.is_active
     FROM locations l
     WHERE l.id=$1`,
    [locationId]
  )

  if (res.rowCount === 0) return reply.code(404).send({ error: 'location_not_found' })

  const loc = res.rows[0]
  return { location: { ...loc, features: normalizeLocationFeatures(loc) } }
})

app.patch('/locations/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const locationId = (req.params as any)?.id as string
  const body = req.body as {
    email_tag?: string | null
    hubspot_tag?: string | null
    intake_enabled?: boolean
    announcer_enabled?: boolean
  }

  await pool.query(
    `UPDATE locations
     SET email_tag=$1,
         hubspot_tag=$2,
         intake_enabled=COALESCE($3, intake_enabled),
         announcer_enabled=COALESCE($4, announcer_enabled),
         features=CASE
           WHEN $4 IS NULL THEN features
           ELSE jsonb_set(COALESCE(features, {}::jsonb), {announcer_enabled}, to_jsonb($4), true)
         END
     WHERE id=$5`,
    [
      body.email_tag ?? null,
      body.hubspot_tag ?? null,
      body.intake_enabled ?? null,
      body.announcer_enabled ?? null,
      locationId
    ]
  )

  return { ok: true }
})

app.get('/permissions', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const base = await pool.query(
    `SELECT can_staff, can_deck, can_front_desk, can_virtual_desk
     FROM user_location_access
     WHERE user_id=$1 AND location_id=$2`,
    [sess.user_id, locationId]
  )
  if (base.rowCount === 0) return reply.code(403).send({ error: 'no_access_to_location' })

  const ov = await pool.query(
    `SELECT id FROM coverage_overrides
     WHERE user_id=$1 AND location_id=$2
       AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
     LIMIT 1`,
    [sess.user_id, locationId]
  )

  const loc = await pool.query(
    `SELECT features FROM locations WHERE id=$1`,
    [locationId]
  )

  return {
    locationId,
    permissions: base.rows[0],
    coverageOverrideActive: ov.rowCount > 0,
    features: loc.rowCount ? normalizeLocationFeatures(loc.rows[0]) : normalizeLocationFeatures({})
  }
})

app.post('/auth/change-pin', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { oldPin?: string; newPin?: string }
  const oldPin = body.oldPin || ''
  const newPin = body.newPin || ''

  if (!oldPin || !newPin) return reply.code(400).send({ error: 'old_and_new_required' })
  if (newPin.length < 4) return reply.code(400).send({ error: 'pin_too_short' })

  const userRes = await pool.query(
    `SELECT pin_hash FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (userRes.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' })

  const ok = await bcrypt.compare(oldPin, userRes.rows[0].pin_hash)
  if (!ok) return reply.code(401).send({ error: 'invalid_old_pin' })

  const newHash = await bcrypt.hash(newPin, 12)
  await pool.query(
    `UPDATE users SET pin_hash=$1, must_change_pin=false WHERE id=$2`,
    [newHash, sess.user_id]
  )

  return { ok: true }
})

// ============================================
// TOTP (2FA) Routes
// ============================================

const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || 'default-dev-key-change-in-production'

// Get 2FA status
app.get('/auth/2fa/status', async (req) => {
  const sess = (req as any).session as { user_id: string }
  const status = await totp.getTotpStatus(pool, sess.user_id)
  const require2fa = await totp.isFeatureEnabled(pool, 'require_2fa')
  return { ...status, require2fa }
})

// Start 2FA enrollment (generate secret + QR)
app.post('/auth/2fa/enroll', async (req) => {
  const sess = (req as any).session as { user_id: string }
  
  // Get user email for TOTP issuer
  const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [sess.user_id])
  const email = userRes.rows[0]?.username || 'user'
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  const result = await totp.generateTotpSecret(svc, sess.user_id, email)
  
  return { 
    qrCodeDataUrl: result.qrCodeDataUrl,
    manualKey: result.manualKey
  }
})

// Verify token and enable 2FA
app.post('/auth/2fa/verify', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { token?: string }
  
  if (!body.token) return reply.code(400).send({ error: 'token_required' })
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  const result = await totp.verifyAndEnableTotp(svc, sess.user_id, body.token)
  
  if (!result.success) {
    return reply.code(400).send({ error: result.error })
  }
  
  return { 
    success: true,
    backupCodes: result.backupCodes
  }
})

// Validate 2FA token (for login flow)
app.post('/auth/2fa/validate', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { token?: string; backupCode?: string }
  const ip = req.ip
  const ua = req.headers['user-agent']
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  
  let result
  if (body.backupCode) {
    result = await totp.verifyBackupCode(svc, sess.user_id, body.backupCode, ip, ua)
  } else if (body.token) {
    result = await totp.verifyTotp(svc, sess.user_id, body.token, ip, ua)
  } else {
    return reply.code(400).send({ error: 'token_or_backup_code_required' })
  }
  
  if (!result.success) {
    return reply.code(401).send({ error: result.error })
  }
  
  return { success: true }
})

// Disable 2FA (user self-service)
app.post('/auth/2fa/disable', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { token?: string }
  
  // Require current TOTP token to disable
  if (!body.token) return reply.code(400).send({ error: 'token_required' })
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  const verifyResult = await totp.verifyTotp(svc, sess.user_id, body.token, req.ip, req.headers['user-agent'])
  
  if (!verifyResult.success) {
    return reply.code(401).send({ error: verifyResult.error })
  }
  
  await totp.disableTotp(svc, sess.user_id)
  return { success: true }
})

// Regenerate backup codes
app.post('/auth/2fa/backup-codes', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { token?: string }
  
  // Require current TOTP token
  if (!body.token) return reply.code(400).send({ error: 'token_required' })
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  const verifyResult = await totp.verifyTotp(svc, sess.user_id, body.token, req.ip, req.headers['user-agent'])
  
  if (!verifyResult.success) {
    return reply.code(401).send({ error: verifyResult.error })
  }
  
  const result = await totp.regenerateBackupCodes(svc, sess.user_id)
  
  if (!result.success) {
    return reply.code(400).send({ error: 'totp_not_enabled' })
  }
  
  return { success: true, backupCodes: result.backupCodes }
})

// Admin: Reset user's 2FA
app.post('/auth/2fa/admin-reset', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
  
  const body = req.body as { userId?: string }
  if (!body.userId) return reply.code(400).send({ error: 'userId_required' })
  
  const svc: totp.TotpService = { pool, encryptionKey: TOTP_ENCRYPTION_KEY }
  await totp.disableTotp(svc, body.userId, sess.user_id)
  
  return { success: true }
})


/**
 * Upload roster HTML (iClassPro roll sheet)
 * - stores raw html in DB
 * - parses classes + instructors + sub marker
 * - writes class_instances rows (date parsing expansion tomorrow)
 */
app.post('/reports/preflight', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const query = req.query as any
  const body = req.body as any
  const locationId = query?.locationId || body?.locationId

  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  let html = ''
  let reportTitle = ''
  if ((req as any).isMultipart && (req as any).isMultipart()) {
    const file = await (req as any).file()
    if (!file) return reply.code(400).send({ error: 'file_required' })
    const buf = await file.toBuffer()
    html = buf.toString('utf8')
    reportTitle = file.filename || ''
  } else {
    html = body?.html || ''
    reportTitle = body?.reportTitle || ''
  }

  if (!html) return reply.code(400).send({ error: 'html_required' })

  const locationsRes = await pool.query(`SELECT id, name, code FROM locations WHERE is_active=true`)
  const preflight = preflightReport(html, locationsRes.rows)

  const detected = preflight.detectedLocationIds
  if (detected.length > 1) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_AMBIGUOUS',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  const selectedLoc = locationsRes.rows.find((l: any) => l.id === locationId)
  const selectedNorm = normalizeLocationName(selectedLoc?.name)
  const detectedNorm = normalizeLocationName(preflight.detectedLocationName)
  if (!detected.length && detectedNorm && selectedNorm && !selectedNorm.includes(detectedNorm) && !detectedNorm.includes(selectedNorm)) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_MISMATCH',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  if (detected.length === 1 && detected[0] !== locationId) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_MISMATCH',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  return reply.send({
    ok: true,
    reportTitle,
    ...preflight
  })
})

app.post('/reports/upload', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const query = req.query as any
  const body = req.body as any
  const locationId = query?.locationId || body?.locationId

  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  let html = ''
  let reportTitle = ''
  let originalFilename = 'report.html'
  if ((req as any).isMultipart && (req as any).isMultipart()) {
    const file = await (req as any).file()
    if (!file) return reply.code(400).send({ error: 'file_required' })
    const buf = await file.toBuffer()
    html = buf.toString('utf8')
    reportTitle = file.filename || ''
    originalFilename = file.filename || originalFilename
  } else {
    html = body?.html || ''
    reportTitle = body?.reportTitle || ''
  }

  if (!html) return reply.code(400).send({ error: 'html_required' })

  const locationsRes = await pool.query(`SELECT id, name, code FROM locations WHERE is_active=true`)
  const preflight = preflightReport(html, locationsRes.rows)
  const detected = preflight.detectedLocationIds

  if (detected.length > 1) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_AMBIGUOUS',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  const selectedLoc = locationsRes.rows.find((l: any) => l.id === locationId)
  const selectedNorm = normalizeLocationName(selectedLoc?.name)
  const detectedNorm = normalizeLocationName(preflight.detectedLocationName)
  if (!detected.length && detectedNorm && selectedNorm && !selectedNorm.includes(detectedNorm) && !detectedNorm.includes(selectedNorm)) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_MISMATCH',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  if (detected.length === 1 && detected[0] !== locationId) {
    return reply.code(400).send({
      code: 'REPORT_LOCATION_MISMATCH',
      selectedLocationId: locationId,
      detectedLocationName: preflight.detectedLocationName,
      detectedLocationIds: detected,
      reportTitle
    })
  }

  const uploadsDir = process.env.REPORT_UPLOADS_DIR || '/opt/aquasuite/uploads/reports'
  await fs.mkdir(uploadsDir, { recursive: true })

  const hash = sha256(html)
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const storedName = `${locationId}_${Date.now()}_${safeName}`
  const storedPath = path.join(uploadsDir, storedName)
  await fs.writeFile(storedPath, html, 'utf8')

  const uploadRes = await pool.query(
    `INSERT INTO report_uploads
      (location_id, report_type, report_title, detected_location_name, detected_location_ids, date_ranges, sha256, stored_path, uploaded_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (location_id, report_type, sha256) DO NOTHING
     RETURNING id`,
    [
      locationId,
      preflight.reportType,
      reportTitle || null,
      preflight.detectedLocationName || null,
      JSON.stringify(preflight.detectedLocationIds || []),
      JSON.stringify(preflight.dateRanges || []),
      hash,
      storedPath,
      sess.user_id
    ]
  )

  if (preflight.reportType === 'instructor_retention') {
    const rows = extractInstructorRetention(html)
    const range = preflight.dateRanges?.[0] || {}
    const asOfStart = parseUsDate(range.start || null)
    const asOfEnd = parseUsDate(range.end || null)

    for (const row of rows) {
      const staffId = await upsertStaffDirectory(locationId, row.instructorName, null)
      await pool.query(
        `INSERT INTO instructor_retention_snapshots
          (location_id, staff_id, instructor_name, starting_headcount, ending_headcount, retention_percent, as_of_start, as_of_end, retained_start, retained_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (location_id, instructor_name, as_of_start, as_of_end) DO UPDATE SET
           starting_headcount=EXCLUDED.starting_headcount,
           ending_headcount=EXCLUDED.ending_headcount,
           retention_percent=EXCLUDED.retention_percent,
           retained_start=EXCLUDED.retained_start,
           retained_end=EXCLUDED.retained_end`,
        [
          locationId,
          staffId,
          row.instructorName,
          row.startingHeadcount,
          row.endingHeadcount,
          row.retentionPercent,
          asOfStart,
          asOfEnd,
          row.startingHeadcount,
          row.endingHeadcount
        ]
      )
    }
  }

  return reply.send({
    ok: true,
    reportTitle,
    preflight,
    uploadId: uploadRes.rows[0]?.id || null
  })
})

app.post('/uploads/roster', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const file = await (req as any).file()
  if (!file) return reply.code(400).send({ error: 'file_required' })

  const buf = await file.toBuffer()
  const html = buf.toString('utf8')
  const hash = sha256(html)

  // store to disk
  const uploadsDir = process.env.UPLOADS_DIR || '/opt/aquasuite/uploads/rosters'
  await fs.mkdir(uploadsDir, { recursive: true })

  const safeName = (file.filename || 'roster.html').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const storedName = `${locationId}_${Date.now()}_${safeName}`
  const storedPath = path.join(uploadsDir, storedName)

  await fs.writeFile(storedPath, buf)

  // Insert upload record (schema expects stored_path)
  const uploadRes = await pool.query(
    `INSERT INTO roster_uploads
      (location_id, uploaded_by_user_id, original_filename, content_type, bytes, sha256, stored_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      locationId,
      sess.user_id,
      file.filename || 'roster.html',
      file.mimetype || null,
      buf.length,
      hash,
      storedPath
    ]
  )
  const uploadId = uploadRes.rows[0].id

  // Parse schedule + instructors (+ sub marker)
  let parsed
  try {
    parsed = parseIclassproRollsheet(html)
  } catch (e: any) {
    await pool.query(
      `UPDATE roster_uploads SET parse_status='failed', parse_error=$1 WHERE id=$2`,
      [String(e?.message || e), uploadId]
    )
    return reply.code(400).send({ error: 'parse_failed', message: String(e?.message || e) })
  }

  const dateParam = (req.query as any)?.date as string | undefined
  const fallbackDate = dateParam || new Date().toISOString().slice(0, 10)

  const rosterParsed = parseIclassproRosterEntries(html)

  const summary = {
    totalParsed: parsed.classes.length,
    inserted: 0,
    skippedNoTime: 0,
    skippedNoDate: 0,
    skippedNoName: 0,
    swimmersParsed: rosterParsed.entries.length,
    swimmersInserted: 0
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const c of parsed.classes) {
      if (!c.className) {
        summary.skippedNoName += 1
        continue
      }
      if (!c.startTime) {
        summary.skippedNoTime += 1
        continue
      }
      const classDate = c.classDate || fallbackDate
      if (!classDate) {
        summary.skippedNoDate += 1
        continue
      }

      await client.query(
        `INSERT INTO class_instances
          (location_id, upload_id, class_date, start_time, end_time, class_name, scheduled_instructor, actual_instructor, is_sub)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          locationId,
          uploadId,
          classDate,
          c.startTime,
          c.endTime || null,
          c.className,
          c.scheduledInstructor || null,
          c.actualInstructor || null,
          c.isSub
        ]
      )
      summary.inserted += 1
    }

    if (rosterParsed.entries.length) {
      for (const entry of rosterParsed.entries) {
        if (!entry.startTime || !entry.swimmerName) continue
        const classDate = entry.classDate || fallbackDate
        if (!classDate) continue

        const instructorRaw = entry.instructorNameRaw || entry.instructorName || entry.actualInstructor || entry.scheduledInstructor || null
        const instructorNorm = instructorRaw ? normalizeName(instructorRaw) : null
        const instructorStaffId = await resolveInstructorStaffId(locationId, instructorRaw)

        await client.query(
          `INSERT INTO roster_entries
            (location_id, upload_id, class_date, start_time, class_name, swimmer_name, age_text, program, level,
             instructor_name, scheduled_instructor, actual_instructor, is_sub, zone,
             instructor_name_raw, instructor_name_norm, instructor_staff_id,
             attendance, attendance_auto_absent, attendance_at, attendance_marked_by_user_id,
             flag_first_time, flag_makeup, flag_policy, flag_owes, flag_trial, balance_amount)
           VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
           ON CONFLICT (location_id, class_date, start_time, swimmer_name) DO UPDATE SET
             class_name=excluded.class_name,
             age_text=excluded.age_text,
             program=excluded.program,
             level=excluded.level,
             instructor_name=excluded.instructor_name,
             scheduled_instructor=excluded.scheduled_instructor,
             actual_instructor=excluded.actual_instructor,
             is_sub=excluded.is_sub,
             zone=excluded.zone,
             instructor_name_raw=excluded.instructor_name_raw,
             instructor_name_norm=excluded.instructor_name_norm,
             instructor_staff_id=COALESCE(excluded.instructor_staff_id, roster_entries.instructor_staff_id),
             attendance=COALESCE(excluded.attendance, roster_entries.attendance),
             attendance_auto_absent=(roster_entries.attendance_auto_absent OR excluded.attendance_auto_absent),
             flag_first_time=excluded.flag_first_time,
             flag_makeup=excluded.flag_makeup,
             flag_policy=excluded.flag_policy,
             flag_owes=excluded.flag_owes,
             flag_trial=excluded.flag_trial,
             balance_amount=excluded.balance_amount,
             updated_at=now()`,
          [
            locationId,
            uploadId,
            classDate,
            entry.startTime,
            entry.className || null,
            entry.swimmerName,
            entry.ageText || null,
            entry.program || null,
            entry.level || null,
            entry.instructorName || null,
            entry.scheduledInstructor || null,
            entry.actualInstructor || null,
            entry.isSub,
            entry.zone ?? null,
            instructorRaw,
            instructorNorm,
            instructorStaffId,
            entry.attendance ?? null,
            entry.attendanceAutoAbsent,
            entry.attendance === 0 || entry.attendance === 1 ? new Date() : null,
            entry.attendance === 0 || entry.attendance === 1 ? sess.user_id : null,
            entry.flagFirstTime,
            entry.flagMakeup,
            entry.flagPolicy,
            entry.flagOwes,
            entry.flagTrial,
            entry.balanceAmount ?? null
          ]
        )
        summary.swimmersInserted += 1
      }
    }

    await client.query(
      `UPDATE roster_uploads SET parse_status='ok', parsed_at=now() WHERE id=$1`,
      [uploadId]
    )

    await client.query('COMMIT')
  } catch (e: any) {
    await client.query('ROLLBACK')
    await pool.query(
      `UPDATE roster_uploads SET parse_status='failed', parse_error=$1 WHERE id=$2`,
      [String(e?.message || e), uploadId]
    )
    return reply.code(500).send({ error: 'class_insert_failed', message: String(e?.message || e) })
  } finally {
    client.release()
  }

  return reply.send({
    ok: true,
    uploadId,
    storedPath,
    classesInserted: summary.inserted,
    swimmersInserted: summary.swimmersInserted,
    parseSummary: summary
  })
})

app.get('/class-instances', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, class_date, start_time, end_time, class_name, scheduled_instructor, actual_instructor, is_sub
     FROM class_instances
     WHERE location_id=$1 AND class_date=$2
     ORDER BY start_time ASC, class_name ASC`,
    [locationId, date]
  )
  return { classes: res.rows }
})

app.get('/class-instances/mine', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const u = await pool.query(
    `SELECT first_name, last_name FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (u.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' })

  const first = (u.rows[0].first_name || '').trim()
  const last = (u.rows[0].last_name || '').trim()

  const forms = [
    `${last}, ${first}`,
    `${first} ${last}`
  ].filter(Boolean)

  const res = await pool.query(
    `SELECT id, class_date, start_time, end_time, class_name, scheduled_instructor, actual_instructor, is_sub
     FROM class_instances
     WHERE location_id=$1 AND class_date=$2
       AND (
         scheduled_instructor = ANY($3::text[])
         OR actual_instructor = ANY($3::text[])
       )
     ORDER BY start_time ASC, class_name ASC`,
    [locationId, date, forms]
  )

  return { classes: res.rows }
})

app.get('/roster-entries', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  const startTime = (req.query as any)?.start_time as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const params = [locationId, date]
  let filter = ''
  if (startTime) {
    params.push(startTime)
    filter = ' AND start_time = $3'
  }

  const res = await pool.query(
    `SELECT id, class_date, start_time, class_name, swimmer_name, age_text, program, level,
            instructor_name, scheduled_instructor, actual_instructor, is_sub, zone,
            instructor_name_raw, instructor_name_norm, instructor_staff_id,
            attendance, attendance_auto_absent, flag_first_time, flag_makeup, flag_policy, flag_owes, flag_trial,
            balance_amount
     FROM roster_entries
     WHERE location_id=$1 AND class_date=$2${filter}
     ORDER BY start_time ASC, instructor_name ASC, swimmer_name ASC`,
    params
  )

  return { entries: res.rows }
})

app.get('/roster-entries/mine', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  const startTime = (req.query as any)?.start_time as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const u = await pool.query(
    `SELECT first_name, last_name, username FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (u.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' })

  const first = (u.rows[0].first_name || '').trim()
  const last = (u.rows[0].last_name || '').trim()
  const username = (u.rows[0].username || '').trim().toLowerCase()

  const staffMatch = await pool.query(
    `SELECT s.id
     FROM staff s
     JOIN staff_locations sl ON sl.staff_id = s.id
     WHERE s.email=$1 AND sl.location_id=$2 AND sl.is_active=true
     LIMIT 1`,
    [username, locationId]
  )

  const forms = [
    `${last}, ${first}`,
    `${first} ${last}`
  ].filter(Boolean)

  let res
  if (staffMatch.rowCount) {
    const staffId = staffMatch.rows[0].id
    const params: any[] = [locationId, date, staffId]
    let filter = ''
    if (startTime) {
      params.push(startTime)
      filter = ' AND start_time = $4'
    }
    res = await pool.query(
      `SELECT id, class_date, start_time, class_name, swimmer_name, age_text, program, level,
              instructor_name, scheduled_instructor, actual_instructor, is_sub, zone,
              instructor_name_raw, instructor_name_norm, instructor_staff_id,
              attendance, attendance_auto_absent, flag_first_time, flag_makeup, flag_policy, flag_owes, flag_trial,
              balance_amount
       FROM roster_entries
       WHERE location_id=$1 AND class_date=$2${filter} AND instructor_staff_id=$3
       ORDER BY start_time ASC, instructor_name ASC, swimmer_name ASC`,
      params
    )
  } else {
    const params: any[] = [locationId, date, forms]
    let filter = ''
    if (startTime) {
      params.push(startTime)
      filter = ' AND start_time = $4'
    }
    res = await pool.query(
      `SELECT id, class_date, start_time, class_name, swimmer_name, age_text, program, level,
              instructor_name, scheduled_instructor, actual_instructor, is_sub, zone,
              instructor_name_raw, instructor_name_norm, instructor_staff_id,
              attendance, attendance_auto_absent, flag_first_time, flag_makeup, flag_policy, flag_owes, flag_trial,
              balance_amount
       FROM roster_entries
       WHERE location_id=$1 AND class_date=$2${filter}
         AND (scheduled_instructor = ANY($3::text[]) OR actual_instructor = ANY($3::text[]) OR instructor_name = ANY($3::text[]))
       ORDER BY start_time ASC, instructor_name ASC, swimmer_name ASC`,
      params
    )
  }

  return { entries: res.rows }
})

app.post('/attendance', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { rosterEntryId?: string; attendance?: number | null }
  const rosterEntryId = body.rosterEntryId
  if (!rosterEntryId) return reply.code(400).send({ error: 'rosterEntryId_required' })

  const entry = await pool.query(
    `SELECT id, location_id FROM roster_entries WHERE id=$1`,
    [rosterEntryId]
  )
  if (entry.rowCount === 0) return reply.code(404).send({ error: 'roster_entry_not_found' })

  const locationId = entry.rows[0].location_id
  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const att = body.attendance === 0 ? 0 : body.attendance === 1 ? 1 : null
  const attendanceAt = att === 0 || att === 1 ? new Date() : null

  await pool.query(
    `UPDATE roster_entries
     SET attendance=$1, attendance_at=$2, attendance_marked_by_user_id=$3
     WHERE id=$4`,
    [att, attendanceAt, att === null ? null : sess.user_id, rosterEntryId]
  )

  return { ok: true, attendance: att }
})

app.post('/attendance/bulk', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { locationId?: string; date?: string; start_time?: string; attendance?: number | null }
  const locationId = body.locationId
  const date = body.date
  const startTime = body.start_time
  if (!locationId || !date || !startTime) return reply.code(400).send({ error: 'locationId_date_start_time_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const att = body.attendance === 0 ? 0 : body.attendance === 1 ? 1 : null
  const attendanceAt = att === 0 || att === 1 ? new Date() : null

  const res = await pool.query(
    `UPDATE roster_entries
     SET attendance=$1, attendance_at=$2, attendance_marked_by_user_id=$3
     WHERE location_id=$4 AND class_date=$5 AND start_time=$6`,
    [att, attendanceAt, att === null ? null : sess.user_id, locationId, date, startTime]
  )

  return { ok: true, updated: res.rowCount }
})

app.get('/analytics/retention', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const retentionParams: any[] = []
  let retentionWhere = ''
  if (locationId) {
    retentionParams.push(locationId)
    retentionWhere = 'WHERE location_id=$1'
  }

  const rowsRes = await pool.query(
    `SELECT location_id, instructor_name, starting_headcount, ending_headcount, retention_percent,
            as_of_start, as_of_end, retained_start, retained_end, created_at
     FROM instructor_retention_snapshots
     ${retentionWhere}
     ORDER BY instructor_name ASC, as_of_end DESC NULLS LAST`,
    retentionParams
  )

  const latestByInstructor = new Map()
  for (const row of rowsRes.rows) {
    const key = row.instructor_name
    if (!latestByInstructor.has(key)) {
      latestByInstructor.set(key, { latest: row, prior: null })
    } else if (!latestByInstructor.get(key).prior) {
      latestByInstructor.get(key).prior = row
    }
  }

  const summary = Array.from(latestByInstructor.entries()).map(([name, pair]) => {
    const latest = pair.latest
    const prior = pair.prior
    const delta = prior ? Number(latest.retention_percent || 0) - Number(prior.retention_percent || 0) : null
    return {
      instructorName: name,
      latest,
      prior,
      retentionDelta: delta
    }
  })

  return { snapshots: rowsRes.rows, summary }
})

app.get('/observations', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const staffId = (req.query as any)?.staffId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const observationParams: any[] = [locationId]
  let observationWhere = 'WHERE location_id=$1'
  if (staffId) {
    observationParams.push(staffId)
    observationWhere += ' AND staff_id=$2'
  }

  const res = await pool.query(
    `SELECT id, location_id, staff_id, instructor_name, class_date, class_time, notes, form_data, created_at, updated_at
     FROM instructor_observations
     ${observationWhere}
     ORDER BY created_at DESC`,
    observationParams
  )

  return { observations: res.rows }
})

app.post('/observations', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as any
  const locationId = body?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const instructorName = body?.instructorName || null
  let staffId = body?.staffId || null
  if (!staffId && instructorName) {
    staffId = await upsertStaffDirectory(locationId, instructorName, null)
  }

  const res = await pool.query(
    `INSERT INTO instructor_observations (location_id, staff_id, instructor_name, class_date, class_time, notes, form_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      locationId,
      staffId,
      instructorName,
      body?.classDate || null,
      body?.classTime || null,
      body?.notes || null,
      body?.formData ? JSON.stringify(body.formData) : null
    ]
  )
  const observationId = res.rows[0].id

  const swimmers = Array.isArray(body?.swimmers) ? body.swimmers : []
  for (const swimmer of swimmers) {
    await pool.query(
      `INSERT INTO instructor_observation_swimmers (observation_id, swimmer_name, scores, notes)
       VALUES ($1,$2,$3,$4)`,
      [observationId, swimmer?.name || 'Unknown', swimmer?.scores ? JSON.stringify(swimmer.scores) : null, swimmer?.notes || null]
    )
  }

  return { ok: true, id: observationId }
})

app.get('/staff', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.birthday,
            sl.permission_level, sl.pin, sl.hire_date, sl.is_active
     FROM staff_locations sl
     JOIN staff s ON s.id = sl.staff_id
     WHERE sl.location_id=$1
     ORDER BY s.last_name ASC, s.first_name ASC`,
    [locationId]
  )

  const directoryRes = await pool.query(
    `SELECT id, full_name, iclasspro_staff_id, is_active, created_at
     FROM staff_directory
     WHERE location_id=$1
     ORDER BY full_name ASC`,
    [locationId]
  )

  return { staff: res.rows, staffDirectory: directoryRes.rows }
})

app.get('/instructor-variants', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const sinceDays = Number((req.query as any)?.sinceDays || 90)
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT
        COALESCE(instructor_name_raw, instructor_name) AS name_raw,
        instructor_name_norm AS name_norm,
        instructor_staff_id AS matched_staff_id,
        COUNT(*)::int AS count_seen,
        MAX(created_at) AS last_seen_at
     FROM roster_entries
     WHERE location_id=$1 AND class_date >= CURRENT_DATE - $2
       AND COALESCE(instructor_name_raw, instructor_name) IS NOT NULL
     GROUP BY name_raw, name_norm, matched_staff_id
     ORDER BY count_seen DESC`,
    [locationId, sinceDays]
  )
  return { variants: res.rows }
})

app.get('/instructor-aliases', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT a.id, a.alias_raw, a.alias_norm, a.source, a.created_at,
            s.id as staff_id, s.first_name, s.last_name, s.email
     FROM staff_instructor_aliases a
     JOIN staff s ON s.id = a.staff_id
     WHERE a.location_id=$1
     ORDER BY a.created_at DESC`,
    [locationId]
  )

  return { aliases: res.rows }
})

app.post('/instructor-aliases', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { locationId?: string; staffId?: string; aliasRaw?: string }
  if (!body.locationId || !body.staffId || !body.aliasRaw) {
    return reply.code(400).send({ error: 'locationId_staffId_aliasRaw_required' })
  }

  const hasAccess = await requireLocationAccess(sess.user_id, body.locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const aliasNorm = normalizeName(body.aliasRaw)
  await pool.query(
    `INSERT INTO staff_instructor_aliases (staff_id, location_id, alias_raw, alias_norm)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (location_id, alias_norm) DO UPDATE SET
       staff_id=excluded.staff_id,
       alias_raw=excluded.alias_raw`,
    [body.staffId, body.locationId, body.aliasRaw, aliasNorm]
  )

  return { ok: true }
})

app.post('/instructor-aliases/apply', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { locationId?: string; aliasRaw?: string; staffId?: string }
  if (!body.locationId || !body.aliasRaw || !body.staffId) {
    return reply.code(400).send({ error: 'locationId_aliasRaw_staffId_required' })
  }

  const hasAccess = await requireLocationAccess(sess.user_id, body.locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const aliasNorm = normalizeName(body.aliasRaw)
  const res = await pool.query(
    `UPDATE roster_entries
     SET instructor_staff_id=$1
     WHERE location_id=$2 AND instructor_name_norm=$3`,
    [body.staffId, body.locationId, aliasNorm]
  )
  return { ok: true, updated: res.rowCount }
})

app.get('/intakes', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const status = (req.query as any)?.status as string | undefined
  const owner = (req.query as any)?.owner as string | undefined
  const limit = Math.min(200, Number((req.query as any)?.limit || 100))

  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId) {
    params.push(locationId)
    where += ` AND ci.location_id = $${params.length}`
  }
  if (status) {
    params.push(status)
    where += ` AND ci.status = $${params.length}`
  }
  if (owner) {
    params.push(owner)
    where += ` AND ci.owner_staff_id = $${params.length}`
  }

  const res = await pool.query(
    `SELECT ci.*, l.name as location_name,
            s.first_name as owner_first_name, s.last_name as owner_last_name
     FROM client_intakes ci
     LEFT JOIN locations l ON l.id = ci.location_id
     LEFT JOIN staff s ON s.id = ci.owner_staff_id
     ${where}
     ORDER BY ci.received_at DESC NULLS LAST
     LIMIT ${limit}`,
    params
  )
  return { intakes: res.rows }
})

app.patch('/intakes/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const intakeId = (req.params as any)?.id as string
  const body = req.body as {
    status?: string
    owner_staff_id?: string | null
    next_follow_up_at?: string | null
    notes?: string | null
  }

  const intake = await pool.query(`SELECT location_id FROM client_intakes WHERE id=$1`, [intakeId])
  if (!intake.rowCount) return reply.code(404).send({ error: 'intake_not_found' })
  const locationId = intake.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query(
    `UPDATE client_intakes
     SET status=COALESCE($1,status),
         owner_staff_id=$2,
         next_follow_up_at=$3,
         notes=$4
     WHERE id=$5`,
    [body.status ?? null, body.owner_staff_id ?? null, body.next_follow_up_at ?? null, body.notes ?? null, intakeId]
  )
  return { ok: true }
})

app.get('/integrations/gmail/status', async (_req, reply) => {
  const res = await pool.query(
    `SELECT email, expires_at, last_received_at FROM gmail_oauth_tokens ORDER BY updated_at DESC LIMIT 1`
  )
  if (!res.rowCount) return reply.send({ connected: false })
  return reply.send({ connected: true, ...res.rows[0] })
})

app.get('/integrations/gmail/auth/start', async (_req, reply) => {
  try {
    const { url } = getGmailAuthUrl()
    return reply.send({ url })
  } catch (e: any) {
    return reply.code(400).send({ error: 'gmail_oauth_not_configured' })
  }
})

app.get('/integrations/gmail/auth/callback', async (req, reply) => {
  const code = (req.query as any)?.code as string | undefined
  if (!code) return reply.code(400).send({ error: 'code_required' })
  try {
    const token = await exchangeGmailCode(code)
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null
    await pool.query(`DELETE FROM gmail_oauth_tokens`)
    await pool.query(
      `INSERT INTO gmail_oauth_tokens (access_token, refresh_token, scope, token_type, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [token.access_token, token.refresh_token, token.scope || null, token.token_type || null, expiresAt]
    )
    return reply.send({ ok: true })
  } catch (e: any) {
    return reply.code(500).send({ error: 'gmail_oauth_failed', message: String(e?.message || e) })
  }
})

app.get('/integrations/hubspot/status', async (_req, reply) => {
  const enabled = String(process.env.HUBSPOT_ENABLED || '').toLowerCase() === 'true'
  return reply.send({ enabled, configured: enabled && !!process.env.HUBSPOT_PRIVATE_APP_TOKEN })
})

app.get('/roster-uploads', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, original_filename, bytes, content_type, sha256, stored_path, uploaded_at,
            parse_status, parse_error, parsed_at
     FROM roster_uploads
     WHERE location_id=$1
     ORDER BY uploaded_at DESC
     LIMIT 25`,
    [locationId]
  )
  return { uploads: res.rows }
})

// Backward-compatible aliases
app.get('/roster/day', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, class_date, start_time, end_time, class_name, scheduled_instructor, actual_instructor, is_sub
     FROM class_instances
     WHERE location_id=$1 AND class_date=$2
     ORDER BY start_time ASC, class_name ASC`,
    [locationId, date]
  )
  return { classes: res.rows }
})

app.get('/roster/my', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const u = await pool.query(
    `SELECT first_name, last_name FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (u.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' })

  const first = (u.rows[0].first_name || '').trim()
  const last = (u.rows[0].last_name || '').trim()

  const forms = [
    `${last}, ${first}`,
    `${first} ${last}`
  ].filter(Boolean)

  const res = await pool.query(
    `SELECT id, class_date, start_time, end_time, class_name, scheduled_instructor, actual_instructor, is_sub
     FROM class_instances
     WHERE location_id=$1 AND class_date=$2
       AND (
         scheduled_instructor = ANY($3::text[])
         OR actual_instructor = ANY($3::text[])
       )
     ORDER BY start_time ASC, class_name ASC`,
    [locationId, date, forms]
  )

  return { classes: res.rows }
})

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
await app.listen({ port, host })
