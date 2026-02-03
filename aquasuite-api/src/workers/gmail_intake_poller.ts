import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { gmailListMessages, gmailGetMessage, getHeader, extractBody } from '../integrations/gmail/gmail_api.js'
import { parseIntakeFromEmail } from '../integrations/gmail/gmail_parser.js'
import { refreshGmailToken } from '../integrations/gmail/oauth.js'
import { normalizeName } from '../utils/normalizeName.js'
import { upsertHubspotContact } from '../integrations/hubspot/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function getTokenRow() {
  const res = await pool.query('SELECT * FROM gmail_oauth_tokens ORDER BY updated_at DESC LIMIT 1')
  return res.rowCount ? res.rows[0] : null
}

async function updateTokenRow(id: string, updates: any) {
  const fields = Object.keys(updates)
  if (!fields.length) return
  const values = fields.map((k) => updates[k])
  const sets = fields.map((k, i) => `${k}=$${i + 1}`).join(', ')
  await pool.query(`UPDATE gmail_oauth_tokens SET ${sets} WHERE id=$${fields.length + 1}`, [...values, id])
}

async function ensureAccessToken(row: any) {
  if (!row) throw new Error('gmail_not_connected')
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  if (expiresAt && expiresAt > Date.now() + 60_000) return row.access_token
  if (!row.refresh_token) throw new Error('gmail_refresh_token_missing')

  const refreshed = await refreshGmailToken(row.refresh_token)
  const expiresAtNew = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null
  await updateTokenRow(row.id, {
    access_token: refreshed.access_token,
    expires_at: expiresAtNew
  })
  return refreshed.access_token
}

async function mapLocationId(locationNameRaw?: string) {
  if (!locationNameRaw) return null
  const norm = normalizeName(locationNameRaw)
  const res = await pool.query('SELECT id, name FROM locations')
  for (const row of res.rows) {
    if (normalizeName(row.name) === norm) return row.id
    if (normalizeName(row.name).includes(norm) || norm.includes(normalizeName(row.name))) return row.id
  }
  return null
}

async function insertIntake(payload: ReturnType<typeof parseIntakeFromEmail>) {
  const locationId = await mapLocationId(payload.locationNameRaw)

  const res = await pool.query(
    `INSERT INTO client_intakes
      (gmail_message_id, received_at, raw_subject, raw_body, location_id, location_name_raw, client_name,
       preferred_day, preferred_time, contact_phone, contact_email, instructor_primary, instructor_secondary,
       code, score_goal, score_structure, score_connection, score_value, level, ratio, why, enrollment_link)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (gmail_message_id) DO NOTHING
     RETURNING id`,
    [
      payload.gmailMessageId,
      payload.receivedAt || null,
      payload.rawSubject || null,
      payload.rawBody || null,
      locationId,
      payload.locationNameRaw || null,
      payload.clientName || null,
      payload.preferredDay || null,
      payload.preferredTime || null,
      payload.contactPhone || null,
      payload.contactEmail || null,
      payload.instructorPrimary || null,
      payload.instructorSecondary || null,
      payload.code || null,
      payload.scoreGoal || null,
      payload.scoreStructure || null,
      payload.scoreConnection || null,
      payload.scoreValue || null,
      payload.level || null,
      payload.ratio || null,
      payload.why || null,
      payload.enrollmentLink || null
    ]
  )

  if (!res.rowCount) return null

  if (String(process.env.HUBSPOT_ENABLED || '').toLowerCase() === 'true') {
    try {
      const hubspot = await upsertHubspotContact({
        email: payload.contactEmail || undefined,
        phone: payload.contactPhone || undefined,
        properties: {
          location_tag: payload.locationNameRaw || '',
          intake_status: 'new',
          preferred_day: payload.preferredDay || '',
          preferred_time: payload.preferredTime || '',
          level: payload.level || '',
          ratio: payload.ratio || ''
        }
      })
      if (hubspot?.id) {
        await pool.query('UPDATE client_intakes SET hubspot_contact_id=$1 WHERE id=$2', [hubspot.id, res.rows[0].id])
      }
    } catch (e) {
      console.error('HubSpot sync failed', e)
    }
  }

  return res.rows[0].id
}

async function runOnce() {
  const tokenRow = await getTokenRow()
  if (!tokenRow) {
    console.log('Gmail intake poller: not connected')
    return
  }

  const accessToken = await ensureAccessToken(tokenRow)
  const queryParts = ['subject:"New Intake"']
  if (tokenRow.last_received_at) {
    const after = Math.floor(new Date(tokenRow.last_received_at).getTime() / 1000)
    queryParts.push(`after:${after}`)
  } else {
    queryParts.push('newer_than:7d')
  }
  const query = queryParts.join(' ')

  const list = await gmailListMessages(accessToken, query, 25)
  const messages = list.messages || []
  let newestReceived: string | null = tokenRow.last_received_at || null

  for (const msg of messages) {
    const full = await gmailGetMessage(accessToken, msg.id)
    const headers = full.payload?.headers || []
    const subject = getHeader(headers, 'Subject') || ''
    const dateHeader = getHeader(headers, 'Date')
    const receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString()
    const body = extractBody(full.payload)

    const payload = parseIntakeFromEmail(subject, body, msg.id, receivedAt)
    const insertedId = await insertIntake(payload)
    if (insertedId) {
      console.log('Inserted intake', insertedId)
    }

    if (!newestReceived || new Date(receivedAt) > new Date(newestReceived)) {
      newestReceived = receivedAt
    }
  }

  if (newestReceived && newestReceived !== tokenRow.last_received_at) {
    await updateTokenRow(tokenRow.id, { last_received_at: newestReceived })
  }
}

async function loop() {
  const intervalMs = Number(process.env.GMAIL_POLL_INTERVAL_MS || 90000)
  while (true) {
    try {
      await runOnce()
    } catch (e) {
      console.error('Gmail intake poller error', e)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

loop().catch((e) => {
  console.error(e)
  process.exit(1)
})
