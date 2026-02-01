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
import { parseIclassproRollsheet } from './roster/parseRollsheet.js'

dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })
await app.register(websocket)
await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}
function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

async function requireLocationAccess(userId: string, locationId: string) {
  const access = await pool.query(
    `SELECT 1 FROM user_location_access WHERE user_id=$1 AND location_id=$2`,
    [userId, locationId]
  )
  return access.rowCount > 0
}

app.get('/health', async () => ({ ok: true, app: 'AquaSuite' }))

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
  const openPaths = new Set(['/health', '/auth/login', '/ws'])
  if (openPaths.has(req.url)) return

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
    `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features
     FROM user_location_access ula
     JOIN locations l ON l.id = ula.location_id
     WHERE ula.user_id = $1 AND l.is_active = true
     ORDER BY ula.is_default DESC, l.name ASC`,
    [sess.user_id]
  )
  return { locations: res.rows }
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
    features: loc.rowCount ? loc.rows[0].features : {}
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

/**
 * Upload roster HTML (iClassPro roll sheet)
 * - stores raw html in DB
 * - parses classes + instructors + sub marker
 * - writes class_instances rows (date parsing expansion tomorrow)
 */
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

  const summary = {
    totalParsed: parsed.classes.length,
    inserted: 0,
    skippedNoTime: 0,
    skippedNoDate: 0,
    skippedNoName: 0
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

const port = Number(process.env.PORT || 3000)
await app.listen({ port, host: '127.0.0.1' })
