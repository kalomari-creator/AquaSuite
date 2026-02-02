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
import { hasIntegration, listLocationUuids, maskUuid, validateEnv, getDefaultLocationKey } from './config/keys.js'
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

try {
  validateEnv()
} catch (err) {
  const message = err instanceof Error ? err.message : "Invalid environment configuration"
  console.error(message)
  process.exit(1)
}
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

async function getUserRoleKeys(userId: string) {
  const res = await pool.query(
    `SELECT r.key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id=$1`,
    [userId]
  )

  if (res.rowCount) return res.rows.map((r) => r.key)

  const primary = await getUserRoleKey(userId)
  return primary ? [primary] : []
}

function mapEffectiveRoleKey(key: string | null) {
  const raw = String(key || '').trim().toLowerCase()
  if (['owner','exec_admin','admin'].includes(raw)) return 'admin'
  if (['front_desk','virtual_desk','manager'].includes(raw)) return 'manager'
  if (['deck','staff','instructor'].includes(raw)) return 'instructor'
  return 'readonly'
}

function pickEffectiveRole(keys: string[]) {
  const mapped = keys.map(mapEffectiveRoleKey)
  if (mapped.includes('admin')) return 'admin'
  if (mapped.includes('manager')) return 'manager'
  if (mapped.includes('instructor')) return 'instructor'
  return 'readonly'
}

async function getEffectiveRoleKey(userId: string) {
  const keys = await getUserRoleKeys(userId)
  return pickEffectiveRole(keys)
}

async function requireRole(userId: string, role: 'admin' | 'manager' | 'instructor' | 'readonly') {
  const effective = await getEffectiveRoleKey(userId)
  return effective === role
}

async function requireAnyRole(userId: string, roles: Array<'admin' | 'manager' | 'instructor' | 'readonly'>) {
  const effective = await getEffectiveRoleKey(userId)
  return roles.includes(effective)
}

async function requireLocationAccess(userId: string, locationId: string) {
  const effective = await getEffectiveRoleKey(userId)
  if (effective === 'admin') return true

  const access = await pool.query(
    `SELECT 1 FROM user_locations WHERE user_id=$1 AND location_id=$2
     UNION
     SELECT 1 FROM user_location_access WHERE user_id=$1 AND location_id=$2`,
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


async function isDayClosed(locationId: string, date: string) {
  const res = await pool.query(
    `SELECT id, reopened_at FROM day_closures WHERE location_id=$1 AND closed_date=$2`,
    [locationId, date]
  )
  if (!res.rowCount) return false
  return res.rows[0].reopened_at ? false : true
}
async function requireAdmin(userId: string) {
  const effective = await getEffectiveRoleKey(userId)
  return effective === 'admin'
}

async function logAdminAction(actorUserId: string, actionType: string, targetUserId?: string | null, locationId?: string | null, metadata?: any) {
  await pool.query(
    `INSERT INTO admin_actions (actor_user_id, action_type, target_user_id, location_id, metadata_json)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorUserId, actionType, targetUserId || null, locationId || null, metadata ? JSON.stringify(metadata) : null]
  )
}

async function logAuditEvent(locationId: string | null, actorUserId: string | null, eventType: string, entityType?: string | null, entityId?: string | null, payload?: any) {
  await pool.query(
    `INSERT INTO audit_events (location_id, actor_user_id, event_type, entity_type, entity_id, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [locationId || null, actorUserId || null, eventType, entityType || null, entityId || null, payload ? JSON.stringify(payload) : null]
  )
}

async function createNotification(locationId: string | null, type: string, message: string, createdBy: string | null, payload?: any) {
  await pool.query(
    `INSERT INTO notifications (location_id, type, message, created_by, payload_json)
     VALUES ($1,$2,$3,$4,$5)`,
    [locationId || null, type, message, createdBy || null, payload ? JSON.stringify(payload) : null]
  )
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
  gitSha: process.env.GIT_SHA || 'dev',
  defaultLocationKey: getDefaultLocationKey(),
  locations: listLocationUuids().map((loc) => ({
    key: loc.key,
    uuidMasked: maskUuid(loc.uuid)
  })),
  integrations: {
    homebase: hasIntegration('homebase'),
    hubspot: hasIntegration('hubspot')
  }
}))

app.get('/admin/config-check', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const ok = await requireAdmin(sess.user_id)
  if (!ok) return reply.code(403).send({ error: 'forbidden' })

  return {
    HOMEBASE_API_KEY: hasIntegration('homebase'),
    HUBSPOT_ACCESS_TOKEN: hasIntegration('hubspot'),
    LOCATION_UUID_CA: Boolean(process.env.LOCATION_UUID_CA),
    LOCATION_UUID_NV: Boolean(process.env.LOCATION_UUID_NV),
    LOCATION_UUID_NY: Boolean(process.env.LOCATION_UUID_NY),
    LOCATION_UUID_TX: Boolean(process.env.LOCATION_UUID_TX),
    DEFAULT_LOCATION_KEY: Boolean(process.env.DEFAULT_LOCATION_KEY)
  }
})






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
            u.primary_role_id, u.is_active, u.is_disabled, r.key as role_key, r.label as role_label
     FROM users u
     JOIN roles r ON r.id = u.primary_role_id
     WHERE u.username=$1`,
    [username]
  )

  if (userRes.rowCount === 0) return reply.code(401).send({ error: 'invalid_credentials' })
  const user = userRes.rows[0]
  if (!user.is_active) return reply.code(403).send({ error: 'user_inactive' })
  if (user.is_disabled) return reply.code(403).send({ error: 'user_disabled' })

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

  const effectiveRoleKey = await getEffectiveRoleKey(user.id)

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
      effectiveRoleKey,
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

  const userRes = await pool.query(
    `SELECT must_change_pin, is_active, is_disabled FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (userRes.rowCount === 0) return reply.code(401).send({ error: 'invalid_user' })
  const user = userRes.rows[0]
  if (!user.is_active || user.is_disabled) return reply.code(403).send({ error: 'user_inactive' })

  const mustChangeAllow = new Set(['/auth/change-pin'])
  if (user.must_change_pin && !mustChangeAllow.has(pathname)) {
    return reply.code(403).send({ error: 'must_change_pin' })
  }
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
  const user = res.rows[0]
  const effectiveRoleKey = await getEffectiveRoleKey(user.id)
  return { user: { ...user, effectiveRoleKey } }
})



app.post('/admin/data-quality/run', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { locationId?: string; date?: string }
  const locationId = body?.locationId
  const date = body?.date
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const alerts: any[] = []
  const classes = await pool.query(
    `SELECT id, class_name, scheduled_instructor, actual_instructor
     FROM class_instances
     WHERE location_id=$1 AND class_date=$2`,
    [locationId, date]
  )
  const noInstructor = classes.rows.filter((c) => !c.scheduled_instructor && !c.actual_instructor)
  noInstructor.forEach((c) => alerts.push({ type: 'class_no_instructor', severity: 'warn', entity_id: c.id, message: 'Class missing instructor' }))

  const swimmers = await pool.query(
    `SELECT class_name, COUNT(*)::int AS swimmer_count
     FROM roster_entries
     WHERE location_id=$1 AND class_date=$2
     GROUP BY class_name`,
    [locationId, date]
  )
  swimmers.rows.forEach((row) => {
    if (row.swimmer_count == 0) alerts.push({ type: 'class_no_swimmers', severity: 'warn', entity_id: null, message: `Class ${row.class_name} has zero swimmers` })
  })

  await pool.query(`DELETE FROM alerts WHERE location_id=$1 AND created_at::date=$2`, [locationId, date])
  for (const a of alerts) {
    await pool.query(
      `INSERT INTO alerts (location_id, type, severity, entity_type, entity_id, message)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [locationId, a.type, a.severity, a.type.startsWith('class') ? 'class_instance' : null, a.entity_id, a.message]
    )
  }

  return { ok: true, alertsInserted: alerts.length }
})

app.get('/admin/activity-feed', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const eventType = (req.query as any)?.eventType as string | undefined
  const actorUserId = (req.query as any)?.actorUserId as string | undefined
  const from = (req.query as any)?.from as string | undefined
  const to = (req.query as any)?.to as string | undefined
  const limit = Math.min(200, Number((req.query as any)?.limit || 100))

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where += ` AND (location_id = $${params.length} OR location_id IS NULL)`
  }
  if (eventType) {
    params.push(eventType)
    where += ` AND event_type = $${params.length}`
  }

  if (actorUserId) {
    params.push(actorUserId)
    where += ` AND actor_user_id = $${params.length}`
  }
  if (from) {
    params.push(from)
    where += ` AND created_at >= $${params.length}`
  }
  if (to) {
    params.push(to)
    where += ` AND created_at <= $${params.length}`
  }

  const res = await pool.query(
    `SELECT id, created_at, event_type, entity_id, location_id, actor_user_id, payload
     FROM activity_feed
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    params
  )

  return { events: res.rows }
})

app.get('/admin/audit-events', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const eventType = (req.query as any)?.eventType as string | undefined
  const limit = Math.min(200, Number((req.query as any)?.limit || 100))

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where += ` AND location_id = $${params.length}`
  }
  if (eventType) {
    params.push(eventType)
    where += ` AND event_type = $${params.length}`
  }

  const res = await pool.query(
    `SELECT id, created_at, event_type, entity_type, entity_id, location_id, actor_user_id, payload_json
     FROM audit_events
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    params
  )

  return { events: res.rows }
})


app.get('/admin/lineage', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const classInstanceId = (req.query as any)?.classInstanceId as string | undefined
  if (!classInstanceId) return reply.code(400).send({ error: 'classInstanceId_required' })

  const classRes = await pool.query(
    `SELECT id, location_id, upload_id, class_date, start_time, end_time, class_name,
            scheduled_instructor, actual_instructor, is_sub, created_at
     FROM class_instances WHERE id=$1`,
    [classInstanceId]
  )
  if (!classRes.rowCount) return reply.code(404).send({ error: 'class_instance_not_found' })
  const classInstance = classRes.rows[0]

  const uploadRes = classInstance.upload_id
    ? await pool.query(
        `SELECT id, original_filename, uploaded_at, parse_status, parse_error, sha256
         FROM roster_uploads WHERE id=$1`,
        [classInstance.upload_id]
      )
    : { rows: [] }

  const rosterRes = await pool.query(
    `SELECT id, attendance, attendance_at, attendance_marked_by_user_id
     FROM roster_entries
     WHERE location_id=$1 AND class_date=$2 AND start_time=$3 AND class_name=$4`,
    [classInstance.location_id, classInstance.class_date, classInstance.start_time, classInstance.class_name]
  )

  const rosterIds = rosterRes.rows.map((r) => r.id)
  const attendanceEvents = rosterIds.length
    ? await pool.query(
        `SELECT id, roster_entry_id, marked_status, marked_at, marked_by_user_id, note
         FROM attendance_events
         WHERE roster_entry_id = ANY($1::uuid[])
         ORDER BY marked_at DESC
         LIMIT 50`,
        [rosterIds]
      )
    : { rows: [] }

  const notesRes = await pool.query(
    `SELECT id, note, is_internal, created_by, created_at
     FROM entity_notes
     WHERE entity_type='class_instance' AND entity_id=$1
     ORDER BY created_at DESC`,
    [classInstanceId]
  )

  return {
    classInstance,
    rosterUpload: uploadRes.rows[0] || null,
    rosterEntries: { count: rosterRes.rows.length, entries: rosterRes.rows },
    attendanceEvents: attendanceEvents.rows,
    notes: notesRes.rows
  }
})

app.get('/notifications', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })
  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, type, message, payload_json, created_at, read_at
     FROM notifications
     WHERE location_id=$1
     ORDER BY created_at DESC
     LIMIT 50`,
    [locationId]
  )

  const notifications = res.rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.type.replace(/_/g, ' '),
    message: n.message,
    payload: n.payload_json,
    created_at: n.created_at,
    read_at: n.read_at
  }))

  return { notifications }
})
app.get('/admin/users', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const usersRes = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.must_change_pin, u.is_active, u.is_disabled,
            r.key as role_key, r.label as role_label
     FROM users u
     JOIN roles r ON r.id = u.primary_role_id
     ORDER BY u.last_name ASC, u.first_name ASC`
  )

  const rolesRes = await pool.query(
    `SELECT ur.user_id, r.key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id`
  )
  const locationsRes = await pool.query(
    `SELECT user_id, location_id, is_default FROM user_locations`
  )

  const rolesByUser = new Map()
  rolesRes.rows.forEach((row) => {
    const list = rolesByUser.get(row.user_id) || []
    list.push(row.key)
    rolesByUser.set(row.user_id, list)
  })
  const locationsByUser = new Map()
  locationsRes.rows.forEach((row) => {
    const list = locationsByUser.get(row.user_id) || []
    list.push({ location_id: row.location_id, is_default: row.is_default })
    locationsByUser.set(row.user_id, list)
  })

  const users = usersRes.rows.map((u) => ({
    ...u,
    effectiveRoleKey: null,
    roles: rolesByUser.get(u.id) || [],
    locations: locationsByUser.get(u.id) || []
  }))

  return { users }
})

app.post('/admin/users', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const body = req.body as any
  const firstName = String(body?.firstName || '').trim()
  const lastName = String(body?.lastName || '').trim()
  const username = String(body?.username || '').trim().toLowerCase()
  const roleKey = String(body?.roleKey || 'readonly').trim().toLowerCase()
  const locationIds = Array.isArray(body?.locationIds) ? body.locationIds : []

  if (!firstName || !lastName || !username) return reply.code(400).send({ error: 'missing_fields' })

  const roleRes = await pool.query('SELECT id FROM roles WHERE key=$1', [roleKey])
  if (roleRes.rowCount === 0) return reply.code(400).send({ error: 'invalid_role' })

  const pinHash = await bcrypt.hash('1234', 10)
  const userRes = await pool.query(
    `INSERT INTO users (first_name, last_name, username, pin_hash, must_change_pin, primary_role_id)
     VALUES ($1,$2,$3,$4,true,$5)
     RETURNING id`,
    [firstName, lastName, username, pinHash, roleRes.rows[0].id]
  )
  const userId = userRes.rows[0].id

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [userId, roleRes.rows[0].id]
  )

  for (const locId of locationIds) {
    await pool.query(
      `INSERT INTO user_locations (user_id, location_id, is_default) VALUES ($1,$2,false)
       ON CONFLICT (user_id, location_id) DO NOTHING`,
      [userId, locId]
    )
  }

  await logAdminAction(sess.user_id, 'user_created', userId, null, { roleKey, locationCount: locationIds.length })

  return { ok: true, id: userId }
})

app.patch('/admin/users/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const userId = (req.params as any)?.id as string
  if (!userId) return reply.code(400).send({ error: 'user_id_required' })

  const body = req.body as any
  const fields = [] as string[]
  const values: any[] = []
  let idx = 1

  if (body?.firstName) { fields.push(`first_name=$${idx++}`); values.push(String(body.firstName).trim()) }
  if (body?.lastName) { fields.push(`last_name=$${idx++}`); values.push(String(body.lastName).trim()) }
  if (body?.username) { fields.push(`username=$${idx++}`); values.push(String(body.username).trim().toLowerCase()) }
  if (typeof body?.isActive === 'boolean') { fields.push(`is_active=$${idx++}`); values.push(Boolean(body.isActive)) }
  if (typeof body?.isDisabled === 'boolean') { fields.push(`is_disabled=$${idx++}`); values.push(Boolean(body.isDisabled)) }

  if (fields.length) {
    values.push(userId)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`, values)
  }

  if (body?.roleKey) {
    const roleRes = await pool.query('SELECT id FROM roles WHERE key=$1', [String(body.roleKey).trim().toLowerCase()])
    if (roleRes.rowCount) {
      await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId])
      await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [userId, roleRes.rows[0].id])
      await pool.query(`UPDATE users SET primary_role_id=$1 WHERE id=$2`, [roleRes.rows[0].id, userId])
    }
  }

  if (Array.isArray(body?.locationIds)) {
    await pool.query(`DELETE FROM user_locations WHERE user_id=$1`, [userId])
    for (const locId of body.locationIds) {
      await pool.query(
        `INSERT INTO user_locations (user_id, location_id, is_default) VALUES ($1,$2,false)`,
        [userId, locId]
      )
    }
  }

  await logAdminAction(sess.user_id, 'user_updated', userId, null, { updated: true })
  return { ok: true }
})

app.post('/admin/users/:id/reset-pin', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const userId = (req.params as any)?.id as string
  if (!userId) return reply.code(400).send({ error: 'user_id_required' })

  const pinHash = await bcrypt.hash('1234', 10)
  await pool.query(
    `UPDATE users SET pin_hash=$1, must_change_pin=true WHERE id=$2`,
    [pinHash, userId]
  )

  await logAdminAction(sess.user_id, 'user_pin_reset', userId, null, { pin: 'default' })

  return { ok: true }
})


app.get('/closures', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  if (locationId === 'all') {
    const isAdmin = await requireAdmin(sess.user_id)
    if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
    return { classes: [] }
  }

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, closed_by, closed_at, reopened_by, reopened_at FROM day_closures WHERE location_id=$1 AND closed_date=$2`,
    [locationId, date]
  )
  return { closure: res.rows[0] || null }
})

app.post('/closures', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { locationId?: string; date?: string }
  const locationId = body?.locationId
  const date = body?.date
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  await pool.query(
    `INSERT INTO day_closures (location_id, closed_date, closed_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (location_id, closed_date) DO UPDATE SET
       closed_by=EXCLUDED.closed_by,
       closed_at=now(),
       reopened_by=NULL,
       reopened_at=NULL`,
    [locationId, date, sess.user_id]
  )

  await logAdminAction(sess.user_id, 'day_closed', null, locationId, { date })
  return { ok: true }
})

app.post('/closures/reopen', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const body = req.body as { locationId?: string; date?: string }
  const locationId = body?.locationId
  const date = body?.date
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  await pool.query(
    `UPDATE day_closures SET reopened_by=$1, reopened_at=now() WHERE location_id=$2 AND closed_date=$3`,
    [sess.user_id, locationId, date]
  )

  await logAdminAction(sess.user_id, 'day_reopened', null, locationId, { date })
  return { ok: true }
})

app.get('/locations', async (req) => {
  const sess = (req as any).session as { user_id: string }
  const effective = await getEffectiveRoleKey(sess.user_id)

  let res
  if (effective === 'admin') {
    res = await pool.query(
      `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features,
              l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled
       FROM locations l
       WHERE l.is_active = true
       ORDER BY l.name ASC`
    )
  } else {
    res = await pool.query(
      `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features,
              l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled
       FROM (
         SELECT location_id, is_default FROM user_locations WHERE user_id=$1
         UNION
         SELECT location_id, is_default FROM user_location_access WHERE user_id=$1
       ) ula
       JOIN locations l ON l.id = ula.location_id
       WHERE l.is_active = true
       ORDER BY ula.is_default DESC, l.name ASC`,
      [sess.user_id]
    )
  }

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

  await logAuditEvent(locationId, sess.user_id, 'location_updated', 'location', locationId, {
    intake_enabled: body.intake_enabled ?? null,
    announcer_enabled: body.announcer_enabled ?? null
  })

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
  const newPin = String(body?.newPin || '').trim()

  if (!newPin || newPin.length < 4) return reply.code(400).send({ error: 'pin_invalid' })

  const userRes = await pool.query(
    `SELECT id, pin_hash, must_change_pin, is_active, is_disabled FROM users WHERE id=$1`,
    [sess.user_id]
  )
  if (userRes.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' })
  const user = userRes.rows[0]
  if (!user.is_active || user.is_disabled) return reply.code(403).send({ error: 'user_inactive' })

  if (!user.must_change_pin) {
    const oldPin = String(body?.oldPin || '').trim()
    const ok = await bcrypt.compare(oldPin, user.pin_hash)
    if (!ok) return reply.code(401).send({ error: 'invalid_pin' })
  }

  const newHash = await bcrypt.hash(newPin, 10)
  await pool.query(
    `UPDATE users SET pin_hash=$1, must_change_pin=false WHERE id=$2`,
    [newHash, sess.user_id]
  )

  await pool.query(
    `INSERT INTO auth_audit_log (user_id, event_type, details) VALUES ($1, 'pin_changed', $2)`,
    [sess.user_id, JSON.stringify({ source: 'self' })]
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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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

app.post('/uploads/roster/preflight', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  if (locationId === 'all') {
    const isAdmin = await requireAdmin(sess.user_id)
    if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
    return { classes: [] }
  }

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const file = await (req as any).file()
  if (!file) return reply.code(400).send({ error: 'file_required' })

  const buf = await file.toBuffer()
  const html = buf.toString('utf8')
  const hash = sha256(html)

  const dupRes = await pool.query(
    `SELECT 1 FROM roster_uploads WHERE location_id=$1 AND sha256=$2 LIMIT 1`,
    [locationId, hash]
  )
  const isDuplicate = dupRes.rowCount > 0

  let parsed
  let rosterParsed
  try {
    parsed = parseIclassproRollsheet(html)
    rosterParsed = parseIclassproRosterEntries(html)
  } catch (e: any) {
    return reply.code(400).send({ error: 'parse_failed', message: String(e?.message || e) })
  }

  const classDates = (parsed.classes || []).map((c: any) => c.classDate).filter(Boolean).sort()
  const dateStart = classDates[0] || null
  const dateEnd = classDates[classDates.length - 1] || null

  const locRes = await pool.query(`SELECT name FROM locations WHERE id=$1`, [locationId])
  const locationName = locRes.rows[0]?.name || null

  return reply.send({
    ok: true,
    hash,
    locationName,
    classCount: parsed.classes.length,
    swimmerCount: rosterParsed.entries.length,
    dateStart,
    dateEnd,
    isDuplicate
  })
})

app.post('/uploads/roster', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

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

  await logAuditEvent(locationId, sess.user_id, 'roster_upload_ingested', 'roster_upload', uploadId, {
    filename: file.filename || 'roster.html',
    hash
  })

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

  const classes = await Promise.all(
    res.rows.map(async (row) => {
      const instructorUserId = await resolveInstructorStaffId(locationId, row.actual_instructor || row.scheduled_instructor || null)
      return {
        ...row,
        instructor_original_name: row.scheduled_instructor,
        instructor_actual_name: row.actual_instructor,
        instructor_user_id: instructorUserId
      }
    })
  )
  return { classes }
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

  const classes = await Promise.all(
    res.rows.map(async (row) => {
      const instructorUserId = await resolveInstructorStaffId(locationId, row.actual_instructor || row.scheduled_instructor || null)
      return {
        ...row,
        instructor_original_name: row.scheduled_instructor,
        instructor_actual_name: row.actual_instructor,
        instructor_user_id: instructorUserId
      }
    })
  )

  return { classes }
})

app.get('/roster-entries', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  const startTime = (req.query as any)?.start_time as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  if (locationId === 'all') {
    const isAdmin = await requireAdmin(sess.user_id)
    if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
    const params: any[] = [date]
    let filter = ''
    if (startTime) {
      params.push(startTime)
      filter = ' AND r.start_time = $2'
    }
    const res = await pool.query(
      `SELECT r.id, r.class_date, r.start_time, r.class_name, r.swimmer_name, r.age_text, r.program, r.level,
              r.instructor_name, r.scheduled_instructor, r.actual_instructor, r.is_sub, r.zone,
              r.instructor_name_raw, r.instructor_name_norm, r.instructor_staff_id,
              r.attendance, r.attendance_auto_absent, r.flag_first_time, r.flag_makeup, r.flag_policy, r.flag_owes, r.flag_trial,
              r.balance_amount, l.name AS location_name
       FROM roster_entries r
       JOIN locations l ON l.id = r.location_id
       WHERE r.class_date=$1${filter}
       ORDER BY r.start_time ASC, r.instructor_name ASC, r.swimmer_name ASC`,
      params
    )
    return { entries: res.rows }
  }

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

  if (locationId === 'all') {
    const isAdmin = await requireAdmin(sess.user_id)
    if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
    const params: any[] = [date]
    let filter = ''
    if (startTime) {
      params.push(startTime)
      filter = ' AND r.start_time = $2'
    }
    const res = await pool.query(
      `SELECT r.id, r.class_date, r.start_time, r.class_name, r.swimmer_name, r.age_text, r.program, r.level,
              r.instructor_name, r.scheduled_instructor, r.actual_instructor, r.is_sub, r.zone,
              r.instructor_name_raw, r.instructor_name_norm, r.instructor_staff_id,
              r.attendance, r.attendance_auto_absent, r.flag_first_time, r.flag_makeup, r.flag_policy, r.flag_owes, r.flag_trial,
              r.balance_amount, l.name AS location_name
       FROM roster_entries r
       JOIN locations l ON l.id = r.location_id
       WHERE r.class_date=$1${filter}
       ORDER BY r.start_time ASC, r.instructor_name ASC, r.swimmer_name ASC`,
      params
    )
    return { entries: res.rows }
  }

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

  await logAuditEvent(locationId, sess.user_id, 'attendance', 'roster_entry', rosterEntryId, { attendance: att })

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

  await logAuditEvent(locationId, sess.user_id, 'attendance_bulk', 'class_block', null, { attendance: att, date, startTime })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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



app.get('/alerts', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, type, severity, entity_type, entity_id, message, created_at, resolved_at
     FROM alerts
     WHERE location_id=$1 AND resolved_at IS NULL
     ORDER BY created_at DESC`,
    [locationId]
  )

  return { alerts: res.rows }
})

app.post('/alerts/:id/resolve', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const alertId = (req.params as any)?.id as string
  const note = (req.body as any)?.note as string | undefined
  if (!alertId) return reply.code(400).send({ error: 'alert_id_required' })

  const alertRes = await pool.query(`SELECT location_id FROM alerts WHERE id=$1`, [alertId])
  if (!alertRes.rowCount) return reply.code(404).send({ error: 'alert_not_found' })
  const locationId = alertRes.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query(
    `UPDATE alerts SET resolved_at=now(), resolved_by=$1, resolved_note=$2 WHERE id=$3`,
    [sess.user_id, note || null, alertId]
  )

  await logAdminAction(sess.user_id, 'alert_resolved', null, locationId, { alertId, note: note || null })
  await logAuditEvent(locationId || null, sess.user_id, 'alert_resolved', 'alert', alertId, { note: note || null })
  return { ok: true }
})

app.get('/notes', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const entityType = (req.query as any)?.entityType as string | undefined
  const entityId = (req.query as any)?.entityId as string | undefined
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!entityType || !entityId) return reply.code(400).send({ error: 'entity_required' })

  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const res = await pool.query(
    `SELECT id, entity_type, entity_id, note, is_internal, created_by, created_at
     FROM entity_notes
     WHERE entity_type=$1 AND entity_id=$2
     ORDER BY created_at DESC`,
    [entityType, entityId]
  )
  return { notes: res.rows }
})

app.post('/ssp/pass', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager','instructor'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { locationId?: string; rosterEntryId?: string; classInstanceId?: string | null }
  if (!body.locationId || !body.rosterEntryId) return reply.code(400).send({ error: 'locationId_and_rosterEntryId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, body.locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const entryRes = await pool.query(
    `SELECT id, swimmer_name, instructor_name, scheduled_instructor, actual_instructor
     FROM roster_entries
     WHERE id=$1 AND location_id=$2`,
    [body.rosterEntryId, body.locationId]
  )
  if (!entryRes.rowCount) return reply.code(404).send({ error: 'roster_entry_not_found' })

  await pool.query(
    `UPDATE roster_entries
     SET ssp_passed=true, ssp_passed_at=now(), ssp_passed_by_user_id=$1
     WHERE id=$2`,
    [sess.user_id, body.rosterEntryId]
  )

  const entry = entryRes.rows[0]
  const instructor = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || ''
  const message = `${entry.swimmer_name || 'Swimmer'} passed SSP (${instructor || 'Instructor'})`

  await logAuditEvent(body.locationId, sess.user_id, 'ssp_pass', 'roster_entry', body.rosterEntryId, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  })
  await createNotification(body.locationId, 'ssp_pass', message, sess.user_id, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  })

  return { ok: true }
})

app.post('/notes', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as { locationId?: string; entityType?: string; entityId?: string; note?: string; isInternal?: boolean }
  const locationId = body?.locationId
  const entityType = body?.entityType
  const entityId = body?.entityId
  const note = String(body?.note || '').trim()

  if (!locationId || !entityType || !entityId || !note) return reply.code(400).send({ error: 'missing_fields' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  await pool.query(
    `INSERT INTO entity_notes (location_id, entity_type, entity_id, note, is_internal, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [locationId, entityType, entityId, note, body?.isInternal ?? true, sess.user_id]
  )

  await logAuditEvent(locationId, sess.user_id, 'note_created', entityType, entityId, { isInternal: body?.isInternal ?? true })
  return { ok: true }
})

app.get('/intakes', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

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

app.delete('/intakes/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const intakeId = (req.params as any)?.id as string

  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const intake = await pool.query("SELECT id, location_id FROM client_intakes WHERE id=$1", [intakeId])
  if (!intake.rowCount) return reply.code(404).send({ error: 'intake_not_found' })
  const locationId = intake.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query('BEGIN')
  try {
    await pool.query('DELETE FROM client_intake_activity WHERE intake_id=$1', [intakeId])
    await pool.query('DELETE FROM client_intakes WHERE id=$1', [intakeId])
    await pool.query('COMMIT')
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }

  return { ok: true, deleted: intakeId }
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
  const configured = !!process.env.HUBSPOT_ACCESS_TOKEN
  const enabled = configured
  return reply.send({ enabled, configured })
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

  const classes = await Promise.all(
    res.rows.map(async (row) => {
      const instructorUserId = await resolveInstructorStaffId(locationId, row.actual_instructor || row.scheduled_instructor || null)
      return {
        ...row,
        instructor_original_name: row.scheduled_instructor,
        instructor_actual_name: row.actual_instructor,
        instructor_user_id: instructorUserId
      }
    })
  )
  return { classes }
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

  const classes = await Promise.all(
    res.rows.map(async (row) => {
      const instructorUserId = await resolveInstructorStaffId(locationId, row.actual_instructor || row.scheduled_instructor || null)
      return {
        ...row,
        instructor_original_name: row.scheduled_instructor,
        instructor_actual_name: row.actual_instructor,
        instructor_user_id: instructorUserId
      }
    })
  )

  return { classes }
})

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
await app.listen({ port, host })
