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
import { hasIntegration, listLocationUuids, maskUuid, validateEnv, getDefaultLocationKey, normalizeLocation, getLocationUuid } from './config/keys.js'
import { normalizeName } from './utils/normalizeName.js'
import { preflightReport } from './services/reportPreflight.js'
import { extractInstructorRetention, extractAgedAccounts, extractDropList, extractEnrollmentEvents, extractAcneLeads, parseUsDate } from './utils/reportParsing.js'
import { normalizeLocationFeatures } from './services/locationFeatures.js'
import { getGmailAuthUrl, exchangeGmailCode } from './integrations/gmail/oauth.js'
import { fetchHomebaseEmployees, fetchHomebaseShifts } from './integrations/homebase/client.js'
import { hubspotConfigured, fetchHubspotContacts, searchHubspotContactByEmail } from './integrations/hubspot/client.js'
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
function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
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
  if (access.rowCount > 0) return true

  const staffId = await findStaffIdForUser(userId)
  if (!staffId) return false

  const staffAccess = await pool.query(
    `SELECT 1 FROM staff_locations WHERE staff_id=$1 AND location_id=$2 AND is_active=true
     UNION
     SELECT 1 FROM staff_location_access WHERE staff_id=$1 AND location_id=$2 AND is_active=true`,
    [staffId, locationId]
  )
  return staffAccess.rowCount > 0
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

async function logActivity(locationId: string | null, actorUserId: string | null, entityType: string, entityId: string | null, action: string, diff?: any) {
  await pool.query(
    `INSERT INTO activity_log (location_id, actor_user_id, entity_type, entity_id, action, diff)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [locationId || null, actorUserId || null, entityType, entityId || null, action, diff ? JSON.stringify(diff) : null]
  )
}

async function findStaffIdForUser(userId: string) {
  const userRes = await pool.query(
    `SELECT first_name, last_name, username FROM users WHERE id=$1`,
    [userId]
  )
  if (!userRes.rowCount) return null
  const user = userRes.rows[0]
  const username = String(user.username || '').trim()
  const email = username.includes('@') ? username : null
  if (email) {
    const staffRes = await pool.query(`SELECT id FROM staff WHERE lower(email)=lower($1)`, [email])
    if (staffRes.rowCount) return staffRes.rows[0].id
  }
  const fullName = normalizeName(`${user.first_name || ''} ${user.last_name || ''}`)
  if (fullName) {
    const staffRes = await pool.query(
      `SELECT id, first_name, last_name FROM staff`
    )
    const match = staffRes.rows.find((row: any) => normalizeName(`${row.first_name || ''} ${row.last_name || ''}`) === fullName)
    if (match) return match.id
  }
  return null
}

async function ensureStaffForUser(userId: string) {
  const existing = await findStaffIdForUser(userId)
  if (existing) return existing

  const userRes = await pool.query(
    `SELECT first_name, last_name, username FROM users WHERE id=$1`,
    [userId]
  )
  if (!userRes.rowCount) return null
  const user = userRes.rows[0]
  const username = String(user.username || '').trim()
  const email = username.includes('@') ? username : `${username || userId}@aquasuite.local`

  const insertRes = await pool.query(
    `INSERT INTO staff (first_name, last_name, email, source_system, source_external_id)
     VALUES ($1,$2,$3,'user',$4)
     ON CONFLICT (email) DO UPDATE SET
       first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name
     RETURNING id`,
    [user.first_name || 'User', user.last_name || 'Account', email, userId]
  )
  return insertRes.rows[0]?.id || null
}

async function createNotification(
  locationId: string | null,
  type: string,
  message: string,
  createdBy: string | null,
  payload?: any,
  options?: {
    channel?: 'general' | 'manager'
    title?: string
    body?: string
    entityType?: string | null
    entityId?: string | null
  }
) {
  const staffId = createdBy ? await ensureStaffForUser(createdBy) : null
  const channel = options?.channel || 'manager'
  const title = options?.title || type.replace(/_/g, ' ')
  const body = options?.body || message
  await pool.query(
    `INSERT INTO notifications
      (location_id, type, message, payload_json, created_by, channel, title, body, entity_type, entity_id, created_by_staff_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      locationId || null,
      type,
      message,
      payload ? JSON.stringify(payload) : null,
      createdBy || null,
      channel,
      title,
      body,
      options?.entityType || null,
      options?.entityId || null,
      staffId || null
    ]
  )
}

async function createManagerNotification(locationId: string | null, type: string, message: string, createdBy: string | null, payload?: any, entityType?: string | null, entityId?: string | null) {
  return createNotification(locationId, type, message, createdBy, payload, { channel: 'manager', entityType, entityId })
}

async function createGeneralNotification(locationId: string | null, type: string, message: string, createdBy: string | null, payload?: any, entityType?: string | null, entityId?: string | null) {
  return createNotification(locationId, type, message, createdBy, payload, { channel: 'general', entityType, entityId })
}


async function createReconciliationIfMissing(locationId: string | null, entityType: string, entityKey: string, issueType: string, options: any) {
  const existing = await pool.query(
    `SELECT id FROM reconciliations
     WHERE entity_type=$1 AND entity_key=$2 AND issue_type=$3 AND resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [entityType, entityKey, issueType]
  )
  if (existing.rowCount) return existing.rows[0].id
  const res = await pool.query(
    `INSERT INTO reconciliations (location_id, entity_type, entity_key, issue_type, options)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [locationId, entityType, entityKey, issueType, options ? JSON.stringify(options) : null]
  )
  return res.rows[0]?.id || null
}

async function upsertContactFromLead(locationId: string | null, source: string, fullName: string | null, email: string | null, phone: string | null) {
  if (!email && !phone) {
    if (!fullName) return null
    const existingByName = await pool.query(
      `SELECT id FROM contacts WHERE location_id IS NOT DISTINCT FROM $1 AND lower(full_name)=lower($2) LIMIT 1`,
      [locationId, fullName]
    )
    if (existingByName.rowCount) return existingByName.rows[0].id
    const res = await pool.query(
      `INSERT INTO contacts (location_id, source, full_name, email, phone)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [locationId, source, fullName, null, null]
    )
    return res.rows[0]?.id || null
  }
  const existing = await pool.query(
    `SELECT id, full_name, email, phone FROM contacts
     WHERE (email IS NOT NULL AND lower(email)=lower($1)) OR (phone IS NOT NULL AND phone=$2)
     LIMIT 1`,
    [email, phone]
  )
  if (existing.rowCount) {
    const current = existing.rows[0]
    const changedName = fullName && current.full_name && normalizeName(current.full_name) !== normalizeName(fullName)
    if (changedName) {
      const entityKey = (email || phone || current.id || '').toLowerCase()
      const recId = await createReconciliationIfMissing(locationId, 'contact', entityKey, 'contact_conflict', {
        existing: { id: current.id, fullName: current.full_name, email: current.email, phone: current.phone },
        incoming: { fullName, email, phone, source }
      })
      await createManagerNotification(locationId, 'contact_conflict', `Contact conflict detected for ${email || phone || fullName || 'contact'}`, null, { entityKey }, 'reconciliation', recId)
    }
    await pool.query(
      `UPDATE contacts
       SET full_name=COALESCE($1, full_name),
           email=COALESCE($2, email),
           phone=COALESCE($3, phone),
           source=COALESCE($4, source),
           updated_at=now()
       WHERE id=$12`,
      [fullName, email, phone, source, current.id]
    )
    return current.id
  }
  const res = await pool.query(
    `INSERT INTO contacts (location_id, source, full_name, email, phone)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [locationId, source, fullName, email, phone]
  )
  return res.rows[0]?.id || null
}

async function logParseAnomaly(locationId: string | null, reportType: string, warnings: string[], meta?: any) {
  if (!warnings || !warnings.length) return
  const key = `${reportType}_${locationId || 'all'}`
  const recId = await createReconciliationIfMissing(locationId, 'report', key, 'parse_anomaly', { reportType, warnings, meta })
  await createManagerNotification(locationId, 'report_parse_warning', `Parse warnings for ${reportType}: ${warnings.join(', ')}`, null, { reportType, warnings }, 'reconciliation', recId)
}

async function upsertIntegrationStatus(provider: string, locationId: string | null, fields: {
  lastSyncedAt?: Date | null
  lastSuccessAt?: Date | null
  lastError?: string | null
  meta?: any
}) {
  await pool.query(
    `INSERT INTO integration_status
      (provider, location_id, last_synced_at, last_success_at, last_error, meta, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (provider, location_id) DO UPDATE SET
       last_synced_at=COALESCE(EXCLUDED.last_synced_at, integration_status.last_synced_at),
       last_success_at=COALESCE(EXCLUDED.last_success_at, integration_status.last_success_at),
       last_error=EXCLUDED.last_error,
       meta=COALESCE(EXCLUDED.meta, integration_status.meta),
       updated_at=now()`,
    [
      provider,
      locationId || null,
      fields.lastSyncedAt || null,
      fields.lastSuccessAt || null,
      fields.lastError || null,
      fields.meta ? JSON.stringify(fields.meta) : null
    ]
  )
}

async function getIntegrationStatus(provider: string, locationId: string | null) {
  const res = await pool.query(
    `SELECT provider, location_id, last_synced_at, last_success_at, last_error, meta
     FROM integration_status
     WHERE provider=$1 AND location_id IS NOT DISTINCT FROM $2`,
    [provider, locationId || null]
  )
  return res.rows[0] || null
}

async function logIntegrationEvent(provider: string, locationId: string | null, eventType: string, status: string, message?: string | null, payload?: any) {
  await pool.query(
    `INSERT INTO integration_events (provider, location_id, event_type, status, message, payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [provider, locationId || null, eventType, status, message || null, payload ? JSON.stringify(payload) : null]
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

async function resolveHomebaseLocationId(locationId: string) {
  const res = await pool.query(
    `SELECT location_key, state, code, name FROM locations WHERE id=$1`,
    [locationId]
  )
  if (!res.rowCount) return null
  const loc = res.rows[0]
  const token = loc.location_key || loc.state || loc.code || loc.name || ''
  try {
    const key = normalizeLocation(token)
    return getLocationUuid(key)
  } catch {
    return null
  }
}

function extractList(payload: any, keys: string[]) {
  if (Array.isArray(payload)) return payload
  if (!payload) return []
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  if (Array.isArray(payload.results)) return payload.results
  return []
}

function normalizeHomebaseStaff(raw: any) {
  const id = raw?.id || raw?.uuid || raw?.employee_id || raw?.employeeId || raw?.user_id || null
  const first = raw?.first_name || raw?.firstName || raw?.first || ''
  const last = raw?.last_name || raw?.lastName || raw?.last || ''
  const fullName = raw?.full_name || raw?.name || `${first} ${last}`.trim()
  const email = raw?.email || raw?.email_address || raw?.contact?.email || null
  const phone = raw?.phone || raw?.phone_number || raw?.mobile || raw?.contact?.phone || null
  const role = raw?.role || raw?.title || null
  const isActive = raw?.active ?? raw?.is_active ?? true
  return { id, firstName: first || null, lastName: last || null, fullName: fullName || null, email, phone, role, isActive }
}

function normalizeHomebaseShift(raw: any) {
  const id = raw?.id || raw?.shift_id || raw?.uuid || null
  const staffId = raw?.employee_id || raw?.employeeId || raw?.user_id || raw?.staff_id || null
  const start = raw?.start_at || raw?.start_time || raw?.start || raw?.starts_at || null
  const end = raw?.end_at || raw?.end_time || raw?.end || raw?.ends_at || null
  const role = raw?.role || raw?.position || null
  const status = raw?.status || raw?.state || null
  const isOpen = raw?.is_open ?? raw?.open ?? false
  const startAt = start ? new Date(start) : null
  const endAt = end ? new Date(end) : null
  return { id, staffId, startAt, endAt, role, status, isOpen, raw }
}

async function resolveHubspotContactForLocation(locationId: string) {
  const res = await pool.query(
    `SELECT name, hubspot_tag, email_tag FROM locations WHERE id=$1`,
    [locationId]
  )
  if (!res.rowCount) return { email: null, name: null }
  const row = res.rows[0]
  const email = [row.hubspot_tag, row.email_tag].find((v: string | null) => v && v.includes('@')) || null
  return { email, name: row.name || null }
}

async function logHubspotEvent(locationId: string, eventType: string, message: string, payload?: any) {
  try {
    if (!hubspotConfigured()) {
      await logIntegrationEvent('hubspot', locationId, eventType, 'skipped', 'hubspot_not_configured', payload)
      return
    }
    const contactInfo = await resolveHubspotContactForLocation(locationId)
    if (!contactInfo.email) {
      await logIntegrationEvent('hubspot', locationId, eventType, 'skipped', 'no_contact_email', payload)
      return
    }
    const contact = await searchHubspotContactByEmail(contactInfo.email)
    if (!contact?.id) {
      await logIntegrationEvent('hubspot', locationId, eventType, 'skipped', 'contact_not_found', payload)
      return
    }
    await upsertIntegrationStatus('hubspot', null, { lastSyncedAt: new Date(), lastSuccessAt: new Date(), lastError: null })
    await logIntegrationEvent('hubspot', locationId, eventType, 'ok', 'read_only_logged', payload)
  } catch (err: any) {
    await upsertIntegrationStatus('hubspot', null, { lastSyncedAt: new Date(), lastError: String(err?.message || err) })
    await logIntegrationEvent('hubspot', locationId, eventType, 'error', String(err?.message || err), payload)
  }
}

async function syncHomebaseLocation(locationId: string, startDate: string, endDate: string) {
  const homebaseLocationId = await resolveHomebaseLocationId(locationId)
  if (!homebaseLocationId) {
    await upsertIntegrationStatus('homebase', locationId, { lastSyncedAt: new Date(), lastError: 'homebase_location_not_mapped' })
    throw new Error('homebase_location_not_mapped')
  }

  const staffPayload = await fetchHomebaseEmployees(homebaseLocationId)
  const shiftPayload = await fetchHomebaseShifts(homebaseLocationId, startDate, endDate)

  const staffList = extractList(staffPayload, ['employees', 'staff', 'team_members'])
  const shiftList = extractList(shiftPayload, ['shifts', 'results'])

  const staffRes = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.email
     FROM staff_locations sl
     JOIN staff s ON s.id = sl.staff_id
     WHERE sl.location_id=$1 AND sl.is_active=true`,
    [locationId]
  )
  const staffByEmail = new Map<string, string>()
  const staffByName = new Map<string, string>()
  staffRes.rows.forEach((row) => {
    if (row.email) staffByEmail.set(String(row.email).toLowerCase(), row.id)
    const full = `${row.first_name || ''} ${row.last_name || ''}`.trim()
    if (full) staffByName.set(normalizeName(full), row.id)
  })

  const client = await pool.connect()
  const missingStaffMappings: Array<{ fullName: string | null; homebaseId: string | null }> = []
  try {
    await client.query('BEGIN')

    for (const raw of staffList) {
      const staff = normalizeHomebaseStaff(raw)
      if (!staff.id) continue
      await client.query(
        `INSERT INTO homebase_staff
          (location_id, homebase_id, first_name, last_name, full_name, email, phone, role, is_active, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         ON CONFLICT (location_id, homebase_id) DO UPDATE SET
           first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name,
           full_name=EXCLUDED.full_name,
           email=EXCLUDED.email,
           phone=EXCLUDED.phone,
           role=EXCLUDED.role,
           is_active=EXCLUDED.is_active,
           updated_at=now()`,
        [
          locationId,
          staff.id,
          staff.firstName,
          staff.lastName,
          staff.fullName,
          staff.email,
          staff.phone,
          staff.role,
          staff.isActive
        ]
      )

      if (!staff.email) {
        missingStaffMappings.push({ fullName: staff.fullName || null, homebaseId: String(staff.id || '') || null })
        continue
      }

      const staffRes = await client.query(
        `INSERT INTO staff
          (first_name, last_name, email, phone, source_system, source_external_id)
         VALUES ($1,$2,$3,$4,'homebase',$5)
         ON CONFLICT (email) DO UPDATE SET
           first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name,
           phone=COALESCE(EXCLUDED.phone, staff.phone),
           source_system='homebase',
           source_external_id=COALESCE(EXCLUDED.source_external_id, staff.source_external_id)
         RETURNING id`,
        [
          staff.firstName || 'Unknown',
          staff.lastName || 'Staff',
          staff.email,
          staff.phone || null,
          String(staff.id)
        ]
      )
      const staffId = staffRes.rows[0]?.id
      if (staffId) {
        await client.query(
          `INSERT INTO staff_location_access (staff_id, location_id, is_active)
           VALUES ($1,$2,$3)
           ON CONFLICT (staff_id, location_id) DO UPDATE SET is_active=EXCLUDED.is_active`,
          [staffId, locationId, staff.isActive !== false]
        )
        await client.query(
          `INSERT INTO staff_locations (staff_id, location_id, is_active, source_external_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (staff_id, location_id) DO UPDATE SET is_active=EXCLUDED.is_active`,
          [staffId, locationId, staff.isActive !== false, String(staff.id)]
        )
        if (staff.email) staffByEmail.set(String(staff.email).toLowerCase(), staffId)
        if (staff.fullName) staffByName.set(normalizeName(staff.fullName), staffId)
      }
    }

    for (const raw of shiftList) {
      const shift = normalizeHomebaseShift(raw)
      if (!shift.id) continue
      let staffId: string | null = null
      if (shift.staffId) {
        const match = staffList.find((s) => {
          const norm = normalizeHomebaseStaff(s)
          return norm.id === shift.staffId
        })
        if (match) {
          const norm = normalizeHomebaseStaff(match)
          if (norm.email) staffId = staffByEmail.get(String(norm.email).toLowerCase()) || null
          if (!staffId && norm.fullName) staffId = staffByName.get(normalizeName(norm.fullName)) || null
        }
      }
      await client.query(
        `INSERT INTO homebase_shifts
          (location_id, homebase_shift_id, homebase_staff_id, staff_id, start_at, end_at, role, status, is_open, raw, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         ON CONFLICT (location_id, homebase_shift_id) DO UPDATE SET
           homebase_staff_id=EXCLUDED.homebase_staff_id,
           staff_id=EXCLUDED.staff_id,
           start_at=EXCLUDED.start_at,
           end_at=EXCLUDED.end_at,
           role=EXCLUDED.role,
           status=EXCLUDED.status,
           is_open=EXCLUDED.is_open,
           raw=EXCLUDED.raw,
           updated_at=now()`,
        [
          locationId,
          shift.id,
          shift.staffId,
          staffId,
          shift.startAt,
          shift.endAt,
          shift.role,
          shift.status,
          shift.isOpen,
          JSON.stringify(shift.raw || {})
        ]
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await upsertIntegrationStatus('homebase', locationId, {
    lastSyncedAt: new Date(),
    lastSuccessAt: new Date(),
    lastError: null,
    meta: { staffCount: staffList.length, shiftCount: shiftList.length, range: { startDate, endDate } }
  })

  if (missingStaffMappings.length) {
    for (const missing of missingStaffMappings) {
      const title = `Homebase staff missing email`
      const body = `${missing.fullName || 'Staff'} missing email in Homebase.`
      await createManagerNotification(locationId, 'homebase_staff_missing_email', body, null, {
        homebaseId: missing.homebaseId,
        fullName: missing.fullName
      })
      await pool.query(
        `INSERT INTO reconciliations (location_id, entity_type, entity_key, issue_type, options)
         VALUES ($1,'staff','homebase_missing_email','missing_email',$2)`,
        [locationId, JSON.stringify({ homebaseId: missing.homebaseId, fullName: missing.fullName })]
      )
    }
  }
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
  const query = req.query as any
  const locationId = query?.locationId as string | undefined
  const channel = query?.channel as string | undefined
  const type = query?.type as string | undefined
  const start = query?.start as string | undefined
  const end = query?.end as string | undefined

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (locationId && locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const staffId = await ensureStaffForUser(sess.user_id)
  const params: any[] = []
  const where: string[] = []
  let idx = 1
  if (locationId && locationId !== 'all') {
    where.push(`n.location_id=$${idx}`)
    params.push(locationId)
    idx += 1
  }
  if (channel) {
    where.push(`n.channel=$${idx}`)
    params.push(channel)
    idx += 1
  }
  if (type) {
    where.push(`n.type=$${idx}`)
    params.push(type)
    idx += 1
  }
  if (start) {
    where.push(`n.created_at >= $${idx}`)
    params.push(start)
    idx += 1
  }
  if (end) {
    where.push(`n.created_at <= $${idx}`)
    params.push(end)
    idx += 1
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const res = await pool.query(
    `SELECT n.id, n.channel, n.type, n.title, n.body, n.message, n.payload_json, n.created_at,
            nr.read_at
     FROM notifications n
     LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.staff_id = $${idx}
     ${whereSql}
     ORDER BY n.created_at DESC
     LIMIT 200`,
    [...params, staffId]
  )

  const notifications = res.rows.map((n) => ({
    id: n.id,
    channel: n.channel,
    type: n.type,
    title: n.title || n.type.replace(/_/g, ' '),
    body: n.body || n.message,
    payload: n.payload_json,
    created_at: n.created_at,
    read_at: n.read_at
  }))

  return { notifications }
})

app.post('/notifications/read', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const body = req.body as any
  const notificationId = body?.notificationId as string | undefined
  if (!notificationId) return reply.code(400).send({ error: 'notificationId_required' })
  const staffId = await ensureStaffForUser(sess.user_id)
  if (!staffId) return reply.code(400).send({ error: 'staff_not_found' })

  await pool.query(
    `INSERT INTO notification_reads (notification_id, staff_id, read_at)
     VALUES ($1,$2,now())
     ON CONFLICT (notification_id, staff_id) DO UPDATE SET read_at=EXCLUDED.read_at`,
    [notificationId, staffId]
  )
  return { ok: true }
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
  const mode = ((req.query as any)?.mode as string | undefined) === 'replace' ? 'replace' : 'merge'
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
              l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled,
              l.created_at
       FROM locations l
       WHERE l.is_active = true
       ORDER BY l.name ASC`
    )
  } else {
    res = await pool.query(
      `SELECT l.id, l.code, l.name, l.state, l.timezone, l.features,
              l.email_tag, l.hubspot_tag, l.intake_enabled, l.announcer_enabled,
              l.created_at
       FROM (
         SELECT location_id, MAX(is_default::int)::int AS is_default
         FROM (
           SELECT location_id, is_default FROM user_locations WHERE user_id=$1
           UNION ALL
           SELECT location_id, is_default FROM user_location_access WHERE user_id=$1
         ) ula
         GROUP BY location_id
       ) ula
       JOIN locations l ON l.id = ula.location_id
       WHERE l.is_active = true
       ORDER BY ula.is_default DESC, l.name ASC`,
      [sess.user_id]
    )
  }

  const usageRes = await pool.query(
    `SELECT location_id, SUM(cnt)::int as count
     FROM (
       SELECT location_id, COUNT(*) as cnt FROM roster_entries GROUP BY location_id
       UNION ALL
       SELECT location_id, COUNT(*) as cnt FROM class_instances GROUP BY location_id
       UNION ALL
       SELECT location_id, COUNT(*) as cnt FROM roster_uploads GROUP BY location_id
       UNION ALL
       SELECT location_id, COUNT(*) as cnt FROM report_uploads GROUP BY location_id
       UNION ALL
       SELECT location_id, COUNT(*) as cnt FROM uploads GROUP BY location_id
     ) t
     GROUP BY location_id`
  )
  const usageMap = new Map<string, number>()
  for (const row of usageRes.rows || []) {
    usageMap.set(row.location_id, Number(row.count) || 0)
  }

  const locationsRaw = res.rows.map((loc) => ({
    ...loc,
    features: normalizeLocationFeatures(loc)
  }))

  const groups = new Map<string, any[]>()
  for (const loc of locationsRaw) {
    const name = String(loc.name || '').trim()
    const state = String(loc.state || '').trim()
    const groupKey = name.toLowerCase() + '|' + state.toLowerCase()
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)?.push(loc)
  }

  const deduped: any[] = []
  for (const [groupKey, group] of groups.entries()) {
    if (!group || group.length <= 1) {
      if (group && group[0]) deduped.push(group[0])
      continue
    }

    const scored = group.map((loc) => ({
      loc,
      score: usageMap.get(loc.id) || 0
    }))
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aTime = new Date(a.loc.created_at || 0).getTime()
      const bTime = new Date(b.loc.created_at || 0).getTime()
      return bTime - aTime
    })
    const selected = scored[0]?.loc || group[0]
    deduped.push(selected)

    const existing = await pool.query(
      `SELECT id FROM reconciliations
       WHERE entity_type='location' AND entity_key=$1 AND issue_type='duplicate_location'
       ORDER BY created_at DESC
       LIMIT 1`,
      [groupKey]
    )
    if (!existing.rowCount) {
      const options = group.map((loc) => ({
        locationId: loc.id,
        code: loc.code,
        name: loc.name,
        state: loc.state,
        createdAt: loc.created_at,
        usageScore: usageMap.get(loc.id) || 0
      }))
      const recIns = await pool.query(
        `INSERT INTO reconciliations
          (location_id, entity_type, entity_key, issue_type, options)
         VALUES ($1,'location',$2,'duplicate_location',$3)
         RETURNING id`,
        [selected?.id || null, groupKey, JSON.stringify({ options })]
      )
      const recId = recIns.rows[0]?.id || null
      await createManagerNotification(
        selected?.id || null,
        'duplicate_locations',
        'Duplicate locations detected for ' + String(group[0].name || '') + ' (' + String(group[0].state || '') + '). Please resolve.',
        null,
        { groupKey, options, suggestedLocationId: selected?.id || null },
        'reconciliation',
        recId
      )
    }
  }

  return { locations: deduped }
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
     WHERE id=$12`,
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

app.post('/locations', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const body = req.body as { name?: string; code?: string; state?: string; timezone?: string }
  if (!body?.name || !body?.code) return reply.code(400).send({ error: 'name_code_required' })

  const res = await pool.query(
    `INSERT INTO locations (name, code, state, timezone, is_active)
     VALUES ($1,$2,$3,$4,true)
     RETURNING id`,
    [body.name, body.code, body.state || null, body.timezone || null]
  )
  const locationId = res.rows[0]?.id
  await logAuditEvent(locationId || null, sess.user_id, 'location_created', 'location', locationId || null, body)
  return reply.send({ ok: true, locationId })
})

app.delete('/locations/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })

  const locationId = (req.params as any)?.id as string
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })

  await pool.query(
    `UPDATE locations SET is_active=false WHERE id=$1`,
    [locationId]
  )
  await logAuditEvent(locationId, sess.user_id, 'location_deactivated', 'location', locationId, {})
  await createManagerNotification(locationId, 'location_deactivated', `Location deactivated`, sess.user_id, {}, 'location', locationId)
  return reply.send({ ok: true })
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
  const reportTypeHint = query?.reportType || body?.reportType || null

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

  if (!preflight.reportType && reportTypeHint) preflight.reportType = reportTypeHint
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
  const reportTypeHint = query?.reportType || body?.reportType || null

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

  const resolvedReportType = preflight.reportType || reportTypeHint || 'report'
  const uploadRes = await pool.query(
    `INSERT INTO report_uploads
      (location_id, report_type, report_title, detected_location_name, detected_location_ids, date_ranges, sha256, stored_path, uploaded_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (location_id, report_type, sha256) DO NOTHING
     RETURNING id`,
    [
      locationId,
      resolvedReportType,
      reportTitle || null,
      preflight.detectedLocationName || null,
      JSON.stringify(preflight.detectedLocationIds || []),
      JSON.stringify(preflight.dateRanges || []),
      hash,
      storedPath,
      sess.user_id
    ]
  )

  const dateRange = preflight.dateRanges?.[0] || {}
  const detectedStart = parseUsDate(dateRange.start || null)
  const detectedEnd = parseUsDate(dateRange.end || null)


  const uploadLogRes = await pool.query(
    `INSERT INTO uploads
      (type, location_id, uploaded_by_user_id, detected_start_date, detected_end_date, parsed_count, inserted_count, warnings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      resolvedReportType,
      locationId,
      sess.user_id,
      detectedStart,
      detectedEnd,
      null,
      null,
      JSON.stringify(preflight.warnings || [])
    ]
  )
  const uploadLogId = uploadLogRes.rows[0]?.id || null
  const parseWarnings = [...(preflight.warnings || [])]

  let parsedCount = 0
  let insertedCount = 0

  if (resolvedReportType === 'instructor_retention') {
    const rows = extractInstructorRetention(html)
    parsedCount = rows.length
    insertedCount = rows.length
    if (!rows.length) parseWarnings.push('no_rows_parsed')
    const asOfStart = detectedStart
    const asOfEnd = detectedEnd

    const snapshotRes = await pool.query(
      `INSERT INTO retention_snapshots (location_id, report_date, source_upload_id)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [locationId, asOfEnd || asOfStart, uploadLogId]
    )
    const snapshotId = snapshotRes.rows[0]?.id

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

      if (snapshotId) {
        await pool.query(
          `INSERT INTO retention_rows
            (snapshot_id, instructor_name, booked, retained, percent_this_cycle, percent_change)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            snapshotId,
            row.instructorName,
            row.startingHeadcount,
            row.endingHeadcount,
            row.retentionPercent,
            null
          ]
        )
      }
    }
  } else if (resolvedReportType === 'aged_accounts') {
    const result = extractAgedAccounts(html)
    parsedCount = result.rows.length
    insertedCount = result.rows.length
    parseWarnings.push(...result.warnings)
    if (!result.rows.length) parseWarnings.push('no_rows_parsed')

    const snapshotRes = await pool.query(
      `INSERT INTO aged_accounts_snapshots (location_id, report_date, source_upload_id)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [locationId, detectedEnd || detectedStart, uploadLogId]
    )
    const snapshotId = snapshotRes.rows[0]?.id

    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO aged_accounts_rows (snapshot_id, bucket, amount, total)
         VALUES ($1,$2,$3,$4)`,
        [snapshotId, row.bucket, row.amount, row.total]
      )
    }
  } else if (resolvedReportType === 'drop_list') {
    const result = extractDropList(html)
    parsedCount = result.rows.length
    insertedCount = result.rows.length
    parseWarnings.push(...result.warnings)
    if (!result.rows.length) parseWarnings.push('no_rows_parsed')

    if (detectedStart || detectedEnd) {
      await pool.query(
        `DELETE FROM drop_events WHERE location_id=$1 AND drop_date BETWEEN $2 AND $3`,
        [locationId, detectedStart || detectedEnd, detectedEnd || detectedStart]
      )
    }

    for (const row of result.rows) {
      const dropDate = row.dropDate || detectedEnd || detectedStart
      await pool.query(
        `INSERT INTO drop_events (location_id, drop_date, swimmer_name, reason, source_upload_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [locationId, dropDate, row.swimmerName, row.reason, uploadLogId]
      )
    }
  } else if (resolvedReportType === 'new_enrollments') {
    const result = extractEnrollmentEvents(html)
    parsedCount = result.rows.length
    insertedCount = result.rows.length
    parseWarnings.push(...result.warnings)
    if (!result.rows.length) parseWarnings.push('no_rows_parsed')

    if (detectedStart || detectedEnd) {
      await pool.query(
        `DELETE FROM enrollment_events WHERE location_id=$1 AND event_date BETWEEN $2 AND $3`,
        [locationId, detectedStart || detectedEnd, detectedEnd || detectedStart]
      )
    }

    for (const row of result.rows) {
      const eventDate = row.eventDate || detectedEnd || detectedStart
      await pool.query(
        `INSERT INTO enrollment_events (location_id, event_date, swimmer_name, source_upload_id)
         VALUES ($1,$2,$3,$4)`,
        [locationId, eventDate, row.swimmerName, uploadLogId]
      )
      await upsertContactFromLead(locationId, 'enrollment', row.swimmerName, null, null)
    }
  } else if (resolvedReportType === 'acne') {
    const result = extractAcneLeads(html)
    parsedCount = result.rows.length
    insertedCount = result.rows.length
    parseWarnings.push(...result.warnings)
    if (!result.rows.length) parseWarnings.push('no_rows_parsed')

    if (detectedStart || detectedEnd) {
      await pool.query(
        `DELETE FROM acne_leads WHERE location_id=$1 AND lead_date BETWEEN $2 AND $3`,
        [locationId, detectedStart || detectedEnd, detectedEnd || detectedStart]
      )
    }

    for (const row of result.rows) {
      const leadDate = row.leadDate || detectedEnd || detectedStart
      await pool.query(
        `INSERT INTO acne_leads (location_id, lead_date, full_name, email, phone, source_upload_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [locationId, leadDate, row.fullName, row.email, row.phone, uploadLogId]
      )
      await upsertContactFromLead(locationId, 'acne', row.fullName, row.email, row.phone)
    }
  }

  if (uploadLogId) {
    await pool.query(
      `UPDATE uploads SET parsed_count=$1, inserted_count=$2, warnings=$3 WHERE id=$4`,
      [parsedCount, insertedCount, JSON.stringify(parseWarnings), uploadLogId]
    )
  }

  if (parseWarnings.length) {
    await logParseAnomaly(locationId, resolvedReportType, parseWarnings, { parsedCount, insertedCount })
  }

  await logActivity(locationId, sess.user_id, 'report_upload', uploadLogId, 'parsed', {
    reportType: resolvedReportType,
    parsedCount,
    insertedCount,
    warnings: parseWarnings
  })
  await createManagerNotification(locationId, 'report_upload_completed', `Report upload complete: ${resolvedReportType} (${parsedCount})`, sess.user_id, {
    reportType: resolvedReportType,
    parsedCount,
    insertedCount,
    warnings: parseWarnings
  }, 'upload', uploadLogId)

  return reply.send({
    ok: true,
    reportTitle,
    preflight,
    uploadId: uploadRes.rows[0]?.id || null
  })
})

app.get('/reports/attendance', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const instructor = query.instructor as string | undefined
  const program = query.program as string | undefined
  if ((!locationId || locationId === 'all') && !start) return reply.code(400).send({ error: 'start_end_required' })
  if (!start || !end) return reply.code(400).send({ error: 'start_end_required' })

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [start, end] : [locationId, start, end]
  let idx = params.length + 1
  let where = locationId === 'all'
    ? `class_date BETWEEN $1 AND $2`
    : `location_id=$1 AND class_date BETWEEN $2 AND $3`
  if (instructor) {
    where += ` AND (actual_instructor=$${idx} OR scheduled_instructor=$${idx} OR instructor_name=$${idx})`
    params.push(instructor)
    idx += 1
  }
  if (program) {
    where += ` AND program=$${idx}`
    params.push(program)
    idx += 1
  }

  const byDateRes = await pool.query(
    `SELECT class_date::text as date, attendance, COUNT(*)::int as count
     FROM roster_entries
     WHERE ${where}
     GROUP BY class_date, attendance
     ORDER BY class_date`,
    params
  )
  const dateMap = new Map<string, any>()
  byDateRes.rows.forEach((row) => {
    const entry = dateMap.get(row.date) || { date: row.date, present: 0, absent: 0, unknown: 0, total: 0 }
    if (row.attendance === 1) entry.present += row.count
    else if (row.attendance === 0) entry.absent += row.count
    else entry.unknown += row.count
    entry.total += row.count
    dateMap.set(row.date, entry)
  })

  const byInstructorRes = await pool.query(
    `SELECT COALESCE(actual_instructor, scheduled_instructor, instructor_name, 'Unassigned') as instructor,
            SUM(CASE WHEN attendance=1 THEN 1 ELSE 0 END)::int as present,
            SUM(CASE WHEN attendance=0 THEN 1 ELSE 0 END)::int as absent,
            SUM(CASE WHEN attendance IS NULL THEN 1 ELSE 0 END)::int as unknown,
            COUNT(*)::int as total
     FROM roster_entries
     WHERE ${where}
     GROUP BY instructor
     ORDER BY instructor`,
    params
  )

  const summary = {
    total: byInstructorRes.rows.reduce((sum, r) => sum + (r.total || 0), 0),
    present: byInstructorRes.rows.reduce((sum, r) => sum + (r.present || 0), 0),
    absent: byInstructorRes.rows.reduce((sum, r) => sum + (r.absent || 0), 0),
    unknown: byInstructorRes.rows.reduce((sum, r) => sum + (r.unknown || 0), 0)
  }

  const filtersRes = await pool.query(
    `SELECT DISTINCT COALESCE(actual_instructor, scheduled_instructor, instructor_name) as instructor
     FROM roster_entries
     WHERE location_id=$1 AND class_date BETWEEN $2 AND $3 AND COALESCE(actual_instructor, scheduled_instructor, instructor_name) IS NOT NULL
     ORDER BY instructor`,
    locationId === 'all' ? [start, end] : [locationId, start, end]
  )
  const programRes = await pool.query(
    `SELECT DISTINCT program FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'} AND program IS NOT NULL
     ORDER BY program`,
    locationId === 'all' ? [start, end] : [locationId, start, end]
  )

  return reply.send({
    summary,
    byDate: Array.from(dateMap.values()),
    byInstructor: byInstructorRes.rows,
    filters: {
      instructors: filtersRes.rows.map((r) => r.instructor).filter(Boolean),
      programs: programRes.rows.map((r) => r.program).filter(Boolean)
    }
  })
})

app.get('/reports/instructor-load', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const instructor = query.instructor as string | undefined
  if (!start || !end) return reply.code(400).send({ error: 'start_end_required' })

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [start, end] : [locationId, start, end]
  let idx = params.length + 1
  let classWhere = locationId === 'all'
    ? `class_date BETWEEN $1 AND $2`
    : `location_id=$1 AND class_date BETWEEN $2 AND $3`
  let rosterWhere = classWhere
  if (instructor) {
    classWhere += ` AND (actual_instructor=$${idx} OR scheduled_instructor=$${idx})`
    rosterWhere += ` AND (actual_instructor=$${idx} OR scheduled_instructor=$${idx} OR instructor_name=$${idx})`
    params.push(instructor)
    idx += 1
  }

  const classRes = await pool.query(
    `SELECT COALESCE(actual_instructor, scheduled_instructor, 'Unassigned') as instructor,
            COUNT(*)::int as classes,
            SUM(CASE WHEN is_sub THEN 1 ELSE 0 END)::int as sub_count
     FROM class_instances
     WHERE ${classWhere}
     GROUP BY instructor`,
    params
  )

  const rosterRes = await pool.query(
    `SELECT COALESCE(actual_instructor, scheduled_instructor, instructor_name, 'Unassigned') as instructor,
            COUNT(*)::int as swimmers
     FROM roster_entries
     WHERE ${rosterWhere}
     GROUP BY instructor`,
    params
  )

  const byDateRes = await pool.query(
    `SELECT class_date::text as date, COUNT(*)::int as swimmers
     FROM roster_entries
     WHERE ${rosterWhere}
     GROUP BY class_date
     ORDER BY class_date`,
    params
  )

  const swimmersByInstructor = new Map<string, number>()
  rosterRes.rows.forEach((r) => swimmersByInstructor.set(r.instructor, r.swimmers))

  const byInstructor = classRes.rows.map((r) => ({
    instructor: r.instructor,
    classes: r.classes || 0,
    swimmers: swimmersByInstructor.get(r.instructor) || 0,
    subCount: r.sub_count || 0,
    subRate: r.classes ? Math.round((r.sub_count || 0) / r.classes * 100) : 0
  }))

  return reply.send({
    byInstructor,
    byDate: byDateRes.rows
  })
})

app.get('/reports/roster-health', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  if (!start || !end) return reply.code(400).send({ error: 'start_end_required' })

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const baseParams = locationId === 'all' ? [start, end] : [locationId, start, end]
  const missingZonesRes = await pool.query(
    `SELECT swimmer_name, class_date::text as class_date, start_time::text as start_time, class_name
     FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'} AND zone IS NULL
     ORDER BY class_date DESC
     LIMIT 200`,
    baseParams
  )

  const missingInstRes = await pool.query(
    `SELECT swimmer_name, class_date::text as class_date, start_time::text as start_time, class_name
     FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'}
       AND COALESCE(actual_instructor, scheduled_instructor, instructor_name, '') = ''
     ORDER BY class_date DESC
     LIMIT 200`,
    baseParams
  )

  const dupRes = await pool.query(
    `SELECT swimmer_name, class_date::text as class_date, start_time::text as start_time, class_name, COUNT(*)::int as count
     FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'}
     GROUP BY swimmer_name, class_date, start_time, class_name
     HAVING COUNT(*) > 1
     ORDER BY class_date DESC
     LIMIT 200`,
    baseParams
  )

  return reply.send({
    summary: {
      missingZones: missingZonesRes.rowCount,
      missingInstructors: missingInstRes.rowCount,
      duplicates: dupRes.rowCount
    },
    missingZones: missingZonesRes.rows,
    missingInstructors: missingInstRes.rows,
    duplicates: dupRes.rows
  })
})

app.get('/reports/retention', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [] : [locationId]
  let where = locationId === 'all' ? `WHERE 1=1` : `WHERE rs.location_id=$1`
  if (start) {
    params.push(start)
    where += ` AND rs.report_date >= $${params.length}`
  }
  if (end) {
    params.push(end)
    where += ` AND rs.report_date <= $${params.length}`
  }

  const rows = await pool.query(
    `SELECT rs.report_date::text as report_date, rr.instructor_name, rr.booked, rr.retained, rr.percent_this_cycle, rr.percent_change
     FROM retention_snapshots rs
     JOIN retention_rows rr ON rr.snapshot_id=rs.id
     ${where}
     ORDER BY rs.report_date DESC`,
    params
  )

  return reply.send({ rows: rows.rows })
})

app.get('/reports/aged-accounts', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [] : [locationId]
  let where = locationId === 'all' ? `WHERE 1=1` : `WHERE a.location_id=$1`
  if (start) {
    params.push(start)
    where += ` AND a.report_date >= $${params.length}`
  }
  if (end) {
    params.push(end)
    where += ` AND a.report_date <= $${params.length}`
  }

  const rows = await pool.query(
    `SELECT a.report_date::text as report_date, r.bucket, r.amount, r.total
     FROM aged_accounts_snapshots a
     JOIN aged_accounts_rows r ON r.snapshot_id=a.id
     ${where}
     ORDER BY a.report_date DESC`,
    params
  )
  return reply.send({ rows: rows.rows })
})

app.get('/reports/drop-list', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [] : [locationId]
  let where = locationId === 'all' ? `WHERE 1=1` : `WHERE location_id=$1`
  if (start) {
    params.push(start)
    where += ` AND drop_date >= $${params.length}`
  }
  if (end) {
    params.push(end)
    where += ` AND drop_date <= $${params.length}`
  }

  const rows = await pool.query(
    `SELECT id, drop_date::text as drop_date, swimmer_name, reason
     FROM drop_events
     ${where}
     ORDER BY drop_date DESC
     LIMIT 300`,
    params
  )
  return reply.send({ rows: rows.rows })
})

app.get('/reports/enrollment-tracker', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [] : [locationId]
  let where = locationId === 'all' ? `WHERE 1=1` : `WHERE location_id=$1`
  if (start) {
    params.push(start)
    where += ` AND event_date >= $${params.length}`
  }
  if (end) {
    params.push(end)
    where += ` AND event_date <= $${params.length}`
  }
  const enrollments = await pool.query(
    `SELECT event_date::text as date, COUNT(*)::int as count
     FROM enrollment_events
     ${where}
     GROUP BY event_date
     ORDER BY event_date`,
    params
  )

  const leadParams: any[] = locationId === 'all' ? [] : [locationId]
  let leadWhere = locationId === 'all' ? `WHERE 1=1` : `WHERE location_id=$1`
  if (start) {
    leadParams.push(start)
    leadWhere += ` AND lead_date >= $${leadParams.length}`
  }
  if (end) {
    leadParams.push(end)
    leadWhere += ` AND lead_date <= $${leadParams.length}`
  }
  const leads = await pool.query(
    `SELECT lead_date::text as date, COUNT(*)::int as count
     FROM acne_leads
     ${leadWhere}
     GROUP BY lead_date
     ORDER BY lead_date`,
    leadParams
  )

  const attendanceSignals = await pool.query(
    `SELECT class_date::text as date, COUNT(*)::int as count
     FROM roster_entries
     WHERE ${where} AND flag_first_time=true
     GROUP BY class_date
     ORDER BY class_date`,
    params
  )

  let byLocation = []
  if (locationId === 'all') {
    const leadByLoc = await pool.query(
      `SELECT l.id, l.name, COUNT(a.*)::int as leads
       FROM locations l
       LEFT JOIN acne_leads a ON a.location_id=l.id
       ${leadWhere.replace('WHERE 1=1', 'WHERE 1=1')}
       GROUP BY l.id, l.name
       ORDER BY l.name`,
      leadParams
    )
    const enrollByLoc = await pool.query(
      `SELECT l.id, l.name, COUNT(e.*)::int as enrollments
       FROM locations l
       LEFT JOIN enrollment_events e ON e.location_id=l.id
       ${where.replace('WHERE 1=1', 'WHERE 1=1')}
       GROUP BY l.id, l.name
       ORDER BY l.name`,
      params
    )
    const enrollMap = new Map(enrollByLoc.rows.map((r) => [r.id, r.enrollments]))
    byLocation = leadByLoc.rows.map((row) => ({
      location_id: row.id,
      location_name: row.name,
      leads: row.leads || 0,
      enrollments: enrollMap.get(row.id) || 0
    }))
  }

  const byStaffRes = await pool.query(
    `SELECT COALESCE(actual_instructor, scheduled_instructor, instructor_name, 'Unassigned') as instructor,
            COUNT(*)::int as count
     FROM roster_entries
     WHERE ${where} AND flag_first_time=true
     GROUP BY instructor
     ORDER BY count DESC`,
    params
  )

  const enrollmentNames = await pool.query(
    `SELECT DISTINCT lower(swimmer_name) as name
     FROM enrollment_events
     ${where}`,
    params
  )
  const enrolledNames = new Set(enrollmentNames.rows.map((r) => r.name))
  const leadsRaw = await pool.query(
    `SELECT lead_date::text as lead_date, full_name, email, phone
     FROM acne_leads
     ${leadWhere}
     ORDER BY lead_date DESC
     LIMIT 200`,
    leadParams
  )
  const workQueue = leadsRaw.rows.filter((row) => {
    const key = String(row.full_name || '').toLowerCase()
    return key && !enrolledNames.has(key)
  })

  return reply.send({
    enrollments: enrollments.rows,
    leads: leads.rows,
    attendanceSignals: attendanceSignals.rows,
    byLocation,
    byStaff: byStaffRes.rows,
    workQueue
  })
})

app.get('/reports/ssp', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  let locationId = query.locationId as string | undefined
  const start = query.start as string | undefined
  const end = query.end as string | undefined
  if (!start || !end) return reply.code(400).send({ error: 'start_end_required' })

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId) {
    if (!isAdmin) return reply.code(400).send({ error: 'locationId_required' })
    locationId = 'all'
  }
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = locationId === 'all' ? [start, end] : [locationId, start, end]
  const byDateRes = await pool.query(
    `SELECT class_date::text as date, COUNT(*)::int as count
     FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'} AND ssp_passed=true
     GROUP BY class_date
     ORDER BY class_date`,
    params
  )

  const byInstructorRes = await pool.query(
    `SELECT COALESCE(actual_instructor, scheduled_instructor, instructor_name, 'Unassigned') as instructor,
            COUNT(*)::int as count
     FROM roster_entries
     WHERE ${locationId === 'all' ? 'class_date BETWEEN $1 AND $2' : 'location_id=$1 AND class_date BETWEEN $2 AND $3'} AND ssp_passed=true
     GROUP BY instructor
     ORDER BY instructor`,
    params
  )

  return reply.send({
    byDate: byDateRes.rows,
    byInstructor: byInstructorRes.rows
  })
})

app.post('/uploads/roster/preflight', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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

  const normalizeTimeKey = (value: string | null | undefined) => {
    if (!value) return ''
    const parts = String(value).split(':')
    if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
    return value
  }

  let classInserts = 0
  let classUpdates = 0
  let swimmerInserts = 0
  let swimmerUpdates = 0

  if (dateStart || dateEnd) {
    const startKey = dateStart || date || ''
    const endKey = dateEnd || date || ''
    const classRes = await pool.query(
      `SELECT class_date::text as class_date, start_time::text as start_time, class_name
       FROM class_instances
       WHERE location_id=$1 AND class_date BETWEEN $2 AND $3`,
      [locationId, startKey, endKey]
    )
    const classKeys = new Set(
      classRes.rows.map((r) => `${r.class_date}|${normalizeTimeKey(r.start_time)}|${r.class_name}`)
    )
    for (const c of parsed.classes || []) {
      const key = `${c.classDate || startKey}|${normalizeTimeKey(c.startTime)}|${c.className || ''}`
      if (classKeys.has(key)) classUpdates += 1
      else classInserts += 1
    }

    const rosterRes = await pool.query(
      `SELECT class_date::text as class_date, start_time::text as start_time, swimmer_name
       FROM roster_entries
       WHERE location_id=$1 AND class_date BETWEEN $2 AND $3`,
      [locationId, startKey, endKey]
    )
    const rosterKeys = new Set(
      rosterRes.rows.map((r) => `${r.class_date}|${normalizeTimeKey(r.start_time)}|${r.swimmer_name}`)
    )
    for (const entry of rosterParsed.entries || []) {
      const key = `${entry.classDate || startKey}|${normalizeTimeKey(entry.startTime)}|${entry.swimmerName || ''}`
      if (rosterKeys.has(key)) swimmerUpdates += 1
      else swimmerInserts += 1
    }
  }

  return reply.send({
    ok: true,
    hash,
    locationName,
    classCount: parsed.classes.length,
    swimmerCount: rosterParsed.entries.length,
    dateStart,
    dateEnd,
    isDuplicate,
    classInserts,
    classUpdates,
    swimmerInserts,
    swimmerUpdates
  })
})

app.post('/uploads/roster', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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
  const classDates = (parsed.classes || []).map((c: any) => c.classDate).filter(Boolean).sort()
  const dateStart = classDates[0] || fallbackDate
  const dateEnd = classDates[classDates.length - 1] || fallbackDate

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

    if (mode === 'replace') {
      await client.query(
        `DELETE FROM roster_entries WHERE location_id=$1 AND class_date BETWEEN $2 AND $3`,
        [locationId, dateStart, dateEnd]
      )
      await client.query(
        `DELETE FROM class_instances WHERE location_id=$1 AND class_date BETWEEN $2 AND $3`,
        [locationId, dateStart, dateEnd]
      )
    }

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
  await pool.query(
    `INSERT INTO uploads
      (type, location_id, uploaded_by_user_id, detected_start_date, detected_end_date, parsed_count, inserted_count, warnings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      'daily_roster',
      locationId,
      sess.user_id,
      dateStart,
      dateEnd,
      summary.inserted,
      summary.swimmersInserted,
      JSON.stringify(summary.warnings || [])
    ]
  )
  await createManagerNotification(locationId, 'upload_completed', `Roster upload complete: ${summary.inserted} classes • ${summary.swimmersInserted} swimmers`, sess.user_id, {
    uploadId,
    dateStart,
    dateEnd,
    classes: summary.inserted,
    swimmers: summary.swimmersInserted
  }, 'upload', uploadId)
  void logHubspotEvent(
    locationId,
    'roster_upload',
    `Roster upload: ${summary.inserted} classes, ${summary.swimmersInserted} swimmers (${dateStart || ''} to ${dateEnd || ''})`,
    { uploadId, dateStart, dateEnd, classes: summary.inserted, swimmers: summary.swimmersInserted }
  )

  if (mode === 'replace') {
    await logActivity(locationId, sess.user_id, 'roster_upload', uploadId, 'replace', { dateStart, dateEnd })
    await createManagerNotification(locationId, 'roster_replace', `Roster replaced for ${dateStart || ''}`, sess.user_id, { uploadId, dateStart, dateEnd }, 'upload', uploadId)
  }

  return reply.send({
    ok: true,
    uploadId,
    storedPath,
    classesInserted: summary.inserted,
    swimmersInserted: summary.swimmersInserted,
    parseSummary: summary,
    mode
  })
})

app.get('/class-instances', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager','instructor'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })
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
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager','instructor'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })
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

  let locationId = (req.query as any)?.locationId as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (!locationId) locationId = 'all'
  if (locationId === 'all' && !isAdmin) return reply.code(403).send({ error: 'admin_required' })

  if (locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const res = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.birthday,
            sl.permission_level, sl.pin, sl.hire_date, sl.is_active, sl.location_id,
            l.name as location_name
     FROM staff_locations sl
     JOIN staff s ON s.id = sl.staff_id
     LEFT JOIN locations l ON l.id = sl.location_id
     ${locationId === 'all' ? '' : 'WHERE sl.location_id=$1'}
     ORDER BY s.last_name ASC, s.first_name ASC`,
    locationId === 'all' ? [] : [locationId]
  )

  const directoryRes = locationId === 'all'
    ? await pool.query(
        `SELECT id, full_name, iclasspro_staff_id, is_active, created_at
         FROM staff_directory
         ORDER BY full_name ASC`
      )
    : await pool.query(
        `SELECT id, full_name, iclasspro_staff_id, is_active, created_at
         FROM staff_directory
         WHERE location_id=$1
         ORDER BY full_name ASC`,
        [locationId]
      )

  return { staff: res.rows, staffDirectory: directoryRes.rows }
})

app.patch('/staff/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const staffId = (req.params as any)?.id as string
  const body = req.body as {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string | null
    birthday?: string | null
    location_id?: string
    permission_level?: string | null
    pin?: string | null
    hire_date?: string | null
    is_active?: boolean
  }

  if (!body.location_id) return reply.code(400).send({ error: 'location_id_required' })

  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) {
    const hasAccess = await requireLocationAccess(sess.user_id, body.location_id)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query(
    `UPDATE staff
     SET first_name=COALESCE($1, first_name),
         last_name=COALESCE($2, last_name),
         email=COALESCE($3, email),
         phone=$4,
         birthday=$5
     WHERE id=$6`,
    [
      body.first_name ?? null,
      body.last_name ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.birthday ?? null,
      staffId
    ]
  )

  await pool.query(
    `INSERT INTO staff_locations (staff_id, location_id, permission_level, pin, hire_date, is_active)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (staff_id, location_id)
     DO UPDATE SET permission_level=EXCLUDED.permission_level,
                  pin=EXCLUDED.pin,
                  hire_date=EXCLUDED.hire_date,
                  is_active=EXCLUDED.is_active`,
    [
      staffId,
      body.location_id,
      body.permission_level ?? null,
      body.pin ?? null,
      body.hire_date ?? null,
      body.is_active ?? true
    ]
  )

  await logAuditEvent(body.location_id, sess.user_id, 'staff_updated', 'staff', staffId, {
    permission_level: body.permission_level ?? null,
    is_active: body.is_active ?? true
  })

  return reply.send({ ok: true })
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
     WHERE location_id=$1 AND class_date >= (CURRENT_DATE - ($2::int))
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

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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

app.get('/ssp/events', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager','instructor'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  const rosterEntryId = (req.query as any)?.rosterEntryId as string | undefined
  if (!locationId || !rosterEntryId) return reply.code(400).send({ error: 'locationId_and_rosterEntryId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `SELECT id, status, note, created_at
     FROM ssp_events
     WHERE location_id=$1 AND roster_entry_id=$2
     ORDER BY created_at DESC`,
    [locationId, rosterEntryId]
  )
  return reply.send({ events: res.rows })
})

app.post('/ssp/pass', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager','instructor'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { locationId?: string; rosterEntryId?: string; classInstanceId?: string | null; note?: string | null }
  if (!body.locationId || !body.rosterEntryId) return reply.code(400).send({ error: 'locationId_and_rosterEntryId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, body.locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const entryRes = await pool.query(
    `SELECT id, swimmer_name, instructor_name, scheduled_instructor, actual_instructor, class_date, start_time, class_name
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

  await pool.query(
    `INSERT INTO ssp_events
      (roster_entry_id, location_id, swimmer_name, swimmer_external_id, status, note, created_by_user_id)
     VALUES ($1,$2,$3,$4,'passed',$5,$6)`,
    [
      body.rosterEntryId,
      body.locationId,
      entry.swimmer_name || null,
      entry.swimmer_external_id || null,
      body.note || null,
      sess.user_id
    ]
  )

  await logAuditEvent(body.locationId, sess.user_id, 'ssp_pass', 'roster_entry', body.rosterEntryId, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  })
  await createManagerNotification(body.locationId, 'ssp_pass', message, sess.user_id, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  }, 'ssp_event', body.rosterEntryId)
  void logHubspotEvent(
    body.locationId,
    'ssp_pass',
    `SSP pass: ${entry.swimmer_name || 'Swimmer'} (${instructor || 'Instructor'}) ${entry.class_date || ''} ${entry.start_time || ''}`,
    {
      swimmer: entry.swimmer_name,
      instructor,
      classDate: entry.class_date,
      startTime: entry.start_time,
      className: entry.class_name
    }
  )

  return { ok: true }
})

app.post('/ssp/revoke', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { locationId?: string; rosterEntryId?: string; classInstanceId?: string | null; note?: string | null }
  if (!body.locationId || !body.rosterEntryId) return reply.code(400).send({ error: 'locationId_and_rosterEntryId_required' })

  const hasAccess = await requireLocationAccess(sess.user_id, body.locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const entryRes = await pool.query(
    `SELECT id, swimmer_name, instructor_name, scheduled_instructor, actual_instructor, class_date, start_time, class_name
     FROM roster_entries
     WHERE id=$1 AND location_id=$2`,
    [body.rosterEntryId, body.locationId]
  )
  if (!entryRes.rowCount) return reply.code(404).send({ error: 'roster_entry_not_found' })

  await pool.query(
    `UPDATE roster_entries
     SET ssp_passed=false, ssp_passed_at=null, ssp_passed_by_user_id=null
     WHERE id=$1`,
    [body.rosterEntryId]
  )

  const entry = entryRes.rows[0]
  const instructor = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || ''
  const message = `${entry.swimmer_name || 'Swimmer'} SSP revoked`

  await pool.query(
    `INSERT INTO ssp_events
      (roster_entry_id, location_id, swimmer_name, swimmer_external_id, status, note, created_by_user_id, revoked_by_user_id, revoked_at)
     VALUES ($1,$2,$3,$4,'revoked',$5,$6,$6,now())`,
    [
      body.rosterEntryId,
      body.locationId,
      entry.swimmer_name || null,
      entry.swimmer_external_id || null,
      body.note || null,
      sess.user_id
    ]
  )

  await logAuditEvent(body.locationId, sess.user_id, 'ssp_revoke', 'roster_entry', body.rosterEntryId, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  })
  await createManagerNotification(body.locationId, 'ssp_revoke', message, sess.user_id, {
    swimmer: entry.swimmer_name,
    instructor,
    classInstanceId: body.classInstanceId || null
  }, 'ssp_event', body.rosterEntryId)

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

app.get('/intakes/:id/activity', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const intakeId = (req.params as any)?.id as string
  const intake = await pool.query(`SELECT location_id FROM client_intakes WHERE id=$1`, [intakeId])
  if (!intake.rowCount) return reply.code(404).send({ error: 'intake_not_found' })
  const locationId = intake.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const res = await pool.query(
    `SELECT a.id, a.action_type, a.payload, a.created_at,
            s.first_name, s.last_name
     FROM client_intake_activity a
     LEFT JOIN staff s ON s.id = a.staff_id
     WHERE a.intake_id=$1
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [intakeId]
  )
  return reply.send({ activity: res.rows })
})




app.get('/intakes/activity', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const locationId = (req.query as any)?.locationId as string | undefined
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = ''
  if (locationId) {
    params.push(locationId)
    where = `WHERE ci.location_id=$1`
  }

  const res = await pool.query(
    `SELECT a.id, a.action_type, a.payload, a.created_at,
            ci.client_name, ci.raw_subject, ci.status, ci.location_id,
            l.name as location_name,
            s.first_name, s.last_name
     FROM client_intake_activity a
     JOIN client_intakes ci ON ci.id = a.intake_id
     LEFT JOIN locations l ON l.id = ci.location_id
     LEFT JOIN staff s ON s.id = a.staff_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT 200`,
    params
  )

  return reply.send({ activity: res.rows })
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
    swimmer_name?: string | null
    guardian_name?: string | null
    requested_start_date?: string | null
    contact_email?: string | null
    contact_phone?: string | null
    source_detail?: string | null
    location_id?: string | null
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
         notes=$4,
         swimmer_name=COALESCE($5, swimmer_name),
         guardian_name=COALESCE($6, guardian_name),
         requested_start_date=COALESCE($7, requested_start_date),
         contact_email=COALESCE($8, contact_email),
         contact_phone=COALESCE($9, contact_phone),
         source_detail=COALESCE($10, source_detail),
         location_id=COALESCE($11, location_id)
     WHERE id=$12`,
    [
      body.status ?? null,
      body.owner_staff_id ?? null,
      body.next_follow_up_at ?? null,
      body.notes ?? null,
      body.swimmer_name ?? null,
      body.guardian_name ?? null,
      body.requested_start_date ?? null,
      body.contact_email ?? null,
      body.contact_phone ?? null,
      body.source_detail ?? null,
      body.location_id ?? null,
      intakeId
    ]
  )


  await pool.query(
    `INSERT INTO client_intake_activity (intake_id, staff_id, action_type, payload)
     VALUES ($1,$2,$3,$4)`,
    [intakeId, sess.user_id, 'updated', body ? JSON.stringify(body) : null]
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
  const status = await getIntegrationStatus('hubspot', null)
  return reply.send({
    enabled: configured,
    configured,
    mode: 'read_only',
    lastSync: status?.last_synced_at || null,
    lastError: status?.last_error || null
  })
})

app.get('/integrations/hubspot/logs', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const ok = await requireAdmin(sess.user_id)
  if (!ok) return reply.code(403).send({ error: 'admin_required' })
  const limit = Math.min(Number((req.query as any)?.limit || 50), 200)
  const res = await pool.query(
    `SELECT id, event_type, status, message, payload, created_at, location_id
     FROM integration_events
     WHERE provider='hubspot'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )
  return reply.send({ events: res.rows })
})

app.get('/integrations/homebase/status', async (_req, reply) => {
  const configured = !!process.env.HOMEBASE_API_KEY
  const res = await pool.query(
    `SELECT last_synced_at, last_error, meta
     FROM integration_status
     WHERE provider='homebase'
     ORDER BY last_synced_at DESC NULLS LAST
     LIMIT 1`
  )
  const status = res.rows[0] || null
  return reply.send({
    enabled: configured,
    configured,
    lastSync: status?.last_synced_at || null,
    lastError: status?.last_error || null,
    meta: status?.meta || null
  })
})

app.post('/integrations/homebase/sync', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const ok = await requireAdmin(sess.user_id)
  if (!ok) return reply.code(403).send({ error: 'admin_required' })
  if (!process.env.HOMEBASE_API_KEY) return reply.code(400).send({ error: 'homebase_not_configured' })

  const body = (req.body as any) || {}
  const locationId = body.locationId as string | undefined
  const startDate = body.startDate || formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  const endDate = body.endDate || formatDate(new Date())

  const locationsRes = locationId
    ? await pool.query(`SELECT id FROM locations WHERE id=$1`, [locationId])
    : await pool.query(`SELECT id FROM locations WHERE is_active=true`)

  const results: any[] = []
  for (const row of locationsRes.rows) {
    try {
      await syncHomebaseLocation(row.id, startDate, endDate)
      results.push({ locationId: row.id, ok: true })
    } catch (err: any) {
      await upsertIntegrationStatus('homebase', row.id, { lastSyncedAt: new Date(), lastError: String(err?.message || err) })
      results.push({ locationId: row.id, ok: false, error: String(err?.message || err) })
    }
  }
  return reply.send({ ok: true, results, range: { startDate, endDate } })
})

app.get('/integrations/homebase/on-shift', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })
  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  if (!process.env.HOMEBASE_API_KEY) return reply.send({ enabled: false, count: 0, names: [] })

  const res = await pool.query(
    `SELECT s.homebase_staff_id, hb.full_name
     FROM homebase_shifts s
     LEFT JOIN homebase_staff hb
       ON hb.location_id=s.location_id AND hb.homebase_id=s.homebase_staff_id
     WHERE s.location_id=$1
       AND s.start_at <= now()
       AND (s.end_at IS NULL OR s.end_at >= now())`,
    [locationId]
  )
  const names = res.rows.map((r) => r.full_name).filter(Boolean)
  return reply.send({ enabled: true, count: res.rowCount, names })
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

app.get('/uploads/history', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (locationId && locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = ''
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where = `WHERE u.location_id=$1`
  }

  const res = await pool.query(
    `SELECT u.id, u.type, u.uploaded_at, u.detected_start_date, u.detected_end_date,
            u.parsed_count, u.inserted_count, u.warnings,
            l.name as location_name, usr.first_name, usr.last_name
     FROM uploads u
     LEFT JOIN locations l ON l.id=u.location_id
     LEFT JOIN users usr ON usr.id=u.uploaded_by_user_id
     ${where}
     ORDER BY u.uploaded_at DESC
     LIMIT 200`,
    params
  )

  const uploads = res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    uploaded_at: r.uploaded_at,
    detected_start_date: r.detected_start_date,
    detected_end_date: r.detected_end_date,
    parsed_count: r.parsed_count,
    inserted_count: r.inserted_count,
    warnings: r.warnings,
    location_name: r.location_name,
    uploaded_by: `${r.first_name || ''} ${r.last_name || ''}`.trim() || null
  }))

  return reply.send({ uploads })
})

app.get('/contacts', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  const locationId = query.locationId as string | undefined
  const search = String(query.search || '').trim()

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (locationId && locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where += ` AND c.location_id=$${params.length}`
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    where += ` AND (lower(c.full_name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length} OR lower(c.phone) LIKE $${params.length})`
  }

  const res = await pool.query(
    `SELECT c.*, cg.id as group_id, cg.canonical_contact_id, l.name as location_name
     FROM contacts c
     LEFT JOIN contact_group_members cgm ON cgm.contact_id=c.id
     LEFT JOIN contact_groups cg ON cg.id=cgm.group_id
     LEFT JOIN locations l ON l.id=c.location_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT 400`,
    params
  )

  const dupRes = await pool.query(
    `SELECT lower(email) as email, COUNT(*)::int as count
     FROM contacts
     WHERE email IS NOT NULL
     GROUP BY lower(email)
     HAVING COUNT(*) > 1
     ORDER BY count DESC
     LIMIT 50`
  )

  return reply.send({ contacts: res.rows, duplicates: dupRes.rows })
})

app.post('/contacts/merge', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { contactIds?: string[]; canonicalId?: string }
  const contactIds = body.contactIds || []
  if (contactIds.length < 2) return reply.code(400).send({ error: 'contactIds_required' })

  const groupRes = await pool.query(
    `INSERT INTO contact_groups (canonical_contact_id)
     VALUES ($1)
     RETURNING id`,
    [body.canonicalId || contactIds[0]]
  )
  const groupId = groupRes.rows[0].id
  for (const contactId of contactIds) {
    await pool.query(
      `INSERT INTO contact_group_members (group_id, contact_id, added_by_user_id)
       VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [groupId, contactId, sess.user_id]
    )
  }

  await logActivity(null, sess.user_id, 'contact_group', groupId, 'merge', { contactIds })
  await createManagerNotification(null, 'contact_merge', `Merged ${contactIds.length} contacts`, sess.user_id, { contactIds }, 'contact_group', groupId)

  return reply.send({ ok: true, groupId })
})

app.post('/contacts/unmerge', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as { groupId?: string; contactId?: string }
  if (!body.groupId || !body.contactId) return reply.code(400).send({ error: 'groupId_contactId_required' })

  await pool.query(
    `DELETE FROM contact_group_members WHERE group_id=$1 AND contact_id=$2`,
    [body.groupId, body.contactId]
  )
  await logActivity(null, sess.user_id, 'contact_group', body.groupId, 'unmerge', { contactId: body.contactId })
  await createManagerNotification(null, 'contact_unmerge', `Unmerged contact`, sess.user_id, { contactId: body.contactId }, 'contact_group', body.groupId)
  return reply.send({ ok: true })
})

app.post('/integrations/hubspot/contacts', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const isAdmin = await requireAdmin(sess.user_id)
  if (!isAdmin) return reply.code(403).send({ error: 'admin_required' })
  if (!hubspotConfigured()) return reply.code(400).send({ error: 'hubspot_not_configured' })

  const body = req.body as { limit?: number }
  const limit = Math.min(200, Number(body?.limit || 100))

  try {
    const data: any = await fetchHubspotContacts(limit)
    const results = Array.isArray(data?.results) ? data.results : []
    let inserted = 0
    let updated = 0

    for (const item of results) {
      const props = item.properties || {}
      const email = props.email || null
      const phone = props.phone || null
      const fullName = `${props.firstname || ''} ${props.lastname || ''}`.trim() || null

      if (!email && !phone) continue

      const existing = await pool.query(
        `SELECT id FROM contacts WHERE (email IS NOT NULL AND lower(email)=lower($1)) OR (phone IS NOT NULL AND phone=$2) LIMIT 1`,
        [email, phone]
      )
      if (existing.rowCount) {
        await pool.query(
          `UPDATE contacts SET full_name=COALESCE($1, full_name), phone=COALESCE($2, phone), updated_at=now()
           WHERE id=$3`,
          [fullName, phone, existing.rows[0].id]
        )
        updated += 1
      } else {
        await pool.query(
          `INSERT INTO contacts (location_id, source, full_name, email, phone)
           VALUES (NULL, 'hubspot', $1, $2, $3)`,
          [fullName, email, phone]
        )
        inserted += 1
      }
    }

    await upsertIntegrationStatus('hubspot', null, { lastSyncedAt: new Date(), lastSuccessAt: new Date(), lastError: null, meta: { fetched: results.length } })
    await createManagerNotification(null, 'hubspot_sync', `HubSpot contacts synced (${inserted} new, ${updated} updated)`, sess.user_id, { fetched: results.length })
    return reply.send({ ok: true, fetched: results.length, inserted, updated })
  } catch (err: any) {
    const message = String(err?.message || err)
    await upsertIntegrationStatus('hubspot', null, { lastSyncedAt: new Date(), lastError: message })
    return reply.code(500).send({ error: 'hubspot_sync_failed', message })
  }
})

app.get('/billing/tickets', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  const locationId = query.locationId as string | undefined
  const status = query.status as string | undefined

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (locationId && locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where += ` AND bt.location_id=$${params.length}`
  }
  if (status) {
    params.push(status)
    where += ` AND bt.status=$${params.length}`
  }

  const res = await pool.query(
    `SELECT bt.*, l.name as location_name,
            u.first_name as created_first_name, u.last_name as created_last_name
     FROM billing_tickets bt
     LEFT JOIN locations l ON l.id=bt.location_id
     LEFT JOIN users u ON u.id=bt.created_by_user_id
     ${where}
     ORDER BY bt.updated_at DESC
     LIMIT 200`,
    params
  )
  return reply.send({ tickets: res.rows })
})

app.post('/billing/tickets', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const body = req.body as any
  const locationId = body?.locationId as string | undefined
  if (!locationId) return reply.code(400).send({ error: 'locationId_required' })
  const hasAccess = await requireLocationAccess(sess.user_id, locationId)
  if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })

  const res = await pool.query(
    `INSERT INTO billing_tickets
      (location_id, contact_id, child_external_id, status, priority, assigned_to_user_id, reason, internal_notes, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      locationId,
      body.contactId || null,
      body.childExternalId || null,
      body.status || 'open',
      body.priority || 'med',
      body.assignedToUserId || null,
      body.reason || null,
      body.internalNotes || null,
      sess.user_id
    ]
  )
  const ticketId = res.rows[0].id
  await logActivity(locationId, sess.user_id, 'billing_ticket', ticketId, 'create', body)
  await createManagerNotification(locationId, 'billing_ticket_created', `Billing ticket created`, sess.user_id, { ticketId }, 'billing_ticket', ticketId)
  return reply.send({ ok: true, ticketId })
})

app.patch('/billing/tickets/:id', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const ticketId = (req.params as any)?.id as string
  const body = req.body as any
  const ticketRes = await pool.query(`SELECT location_id FROM billing_tickets WHERE id=$1`, [ticketId])
  if (!ticketRes.rowCount) return reply.code(404).send({ error: 'ticket_not_found' })
  const locationId = ticketRes.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query(
    `UPDATE billing_tickets
     SET status=COALESCE($1,status),
         priority=COALESCE($2,priority),
         assigned_to_user_id=$3,
         reason=COALESCE($4,reason),
         internal_notes=COALESCE($5,internal_notes),
         updated_at=now()
     WHERE id=$6`,
    [body.status ?? null, body.priority ?? null, body.assignedToUserId ?? null, body.reason ?? null, body.internalNotes ?? null, ticketId]
  )
  await logActivity(locationId, sess.user_id, 'billing_ticket', ticketId, 'update', body)
  await createManagerNotification(locationId, 'billing_ticket_updated', `Billing ticket updated`, sess.user_id, { ticketId }, 'billing_ticket', ticketId)
  return reply.send({ ok: true })
})

app.get('/reconciliations', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const query = req.query as any
  const locationId = query.locationId as string | undefined
  const unresolvedOnly = query.unresolvedOnly === 'true'

  const isAdmin = await requireAdmin(sess.user_id)
  if (!locationId && !isAdmin) return reply.code(400).send({ error: 'locationId_required' })
  if (locationId && locationId !== 'all') {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  const params: any[] = []
  let where = 'WHERE 1=1'
  if (locationId && locationId !== 'all') {
    params.push(locationId)
    where += ` AND location_id=$${params.length}`
  }
  if (unresolvedOnly) {
    where += ` AND resolved_at IS NULL`
  }

  const res = await pool.query(
    `SELECT * FROM reconciliations
     ${where}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  )
  return reply.send({ reconciliations: res.rows })
})

app.post('/reconciliations/:id/resolve', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const roleOk = await requireAnyRole(sess.user_id, ['admin','manager'])
  if (!roleOk) return reply.code(403).send({ error: 'role_forbidden' })

  const id = (req.params as any)?.id as string
  const body = req.body as { selectedOption?: any }

  const recRes = await pool.query(`SELECT location_id FROM reconciliations WHERE id=$1`, [id])
  if (!recRes.rowCount) return reply.code(404).send({ error: 'reconciliation_not_found' })
  const locationId = recRes.rows[0].location_id
  if (locationId) {
    const hasAccess = await requireLocationAccess(sess.user_id, locationId)
    if (!hasAccess) return reply.code(403).send({ error: 'no_access_to_location' })
  }

  await pool.query(
    `UPDATE reconciliations
     SET selected_option=$1, resolved_by_user_id=$2, resolved_at=now()
     WHERE id=$3`,
    [body.selectedOption ? JSON.stringify(body.selectedOption) : null, sess.user_id, id]
  )
  await logActivity(locationId, sess.user_id, 'reconciliation', id, 'resolve', body.selectedOption)
  return reply.send({ ok: true })
})

// Backward-compatible aliases
app.get('/roster/day', async (req, reply) => {
  const sess = (req as any).session as { user_id: string }
  const locationId = (req.query as any)?.locationId as string | undefined
  const date = (req.query as any)?.date as string | undefined
  if (!locationId || !date) return reply.code(400).send({ error: 'locationId_and_date_required' })

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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

  const modeRaw = (req.query as any)?.mode as string | undefined
  const mode = modeRaw === 'replace' ? 'replace' : 'merge'

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
