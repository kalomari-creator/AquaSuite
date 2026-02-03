import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'
import pg from 'pg'
import { preflightReport } from '../src/services/reportPreflight.js'
import { parseIclassproRollsheet } from '../src/parsers/parseRollsheet.js'
import { parseIclassproRosterEntries } from '../src/parsers/parseRosterEntries.js'
import { extractInstructorRetention, parseUsDate } from '../src/utils/reportParsing.js'
import { normalizeName } from '../src/utils/normalizeName.js'

dotenv.config()

const folder = process.argv[2]
if (!folder) {
  console.error('Usage: tsx scripts/import_reports_folder.ts <folder>')
  process.exit(1)
}

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

async function upsertStaffDirectory(locationId: string, fullName: string | null) {
  if (!fullName) return null
  const name = fullName.trim()
  if (!name) return null

  const res = await pool.query(
    `INSERT INTO staff_directory (location_id, full_name)
     VALUES ($1,$2)
     ON CONFLICT (location_id, full_name) DO UPDATE SET is_active=true
     RETURNING id`,
    [locationId, name]
  )
  return res.rows[0]?.id || null
}

async function ingestRoster(locationId: string, html: string, uploadId: string | null, fallbackDate: string) {
  const parsed = parseIclassproRollsheet(html)
  const rosterParsed = parseIclassproRosterEntries(html)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const c of parsed.classes) {
      if (!c.className || !c.startTime) continue
      const classDate = c.classDate || fallbackDate
      if (!classDate) continue

      const exists = await client.query(
        `SELECT 1 FROM class_instances WHERE location_id=$1 AND class_date=$2 AND start_time=$3 AND class_name=$4 LIMIT 1`,
        [locationId, classDate, c.startTime, c.className]
      )
      if (exists.rowCount) continue

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
    }

    for (const entry of rosterParsed.entries) {
      if (!entry.startTime || !entry.swimmerName) continue
      const classDate = entry.classDate || fallbackDate
      if (!classDate) continue

      const exists = await client.query(
        `SELECT 1 FROM roster_entries WHERE location_id=$1 AND class_date=$2 AND start_time=$3 AND swimmer_name=$4 LIMIT 1`,
        [locationId, classDate, entry.startTime, entry.swimmerName]
      )
      if (exists.rowCount) continue

      const instructorRaw = entry.instructorNameRaw || entry.instructorName || entry.actualInstructor || entry.scheduledInstructor || null
      const instructorNorm = instructorRaw ? normalizeName(instructorRaw) : null
      const instructorStaffId = await upsertStaffDirectory(locationId, instructorRaw)

      await client.query(
        `INSERT INTO roster_entries
          (location_id, upload_id, class_date, start_time, class_name, swimmer_name, age_text, program, level,
           instructor_name, scheduled_instructor, actual_instructor, is_sub, zone,
           instructor_name_raw, instructor_name_norm, instructor_staff_id,
           attendance, attendance_auto_absent, attendance_at, attendance_marked_by_user_id,
           flag_first_time, flag_makeup, flag_policy, flag_owes, flag_trial, balance_amount)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
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
          null,
          entry.flagFirstTime,
          entry.flagMakeup,
          entry.flagPolicy,
          entry.flagOwes,
          entry.flagTrial,
          entry.balanceAmount ?? null
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
}

async function run() {
  const files = await fs.readdir(folder)
  const htmlFiles = files.filter((f) => f.toLowerCase().endsWith('.html') || f.toLowerCase().endsWith('.htm'))

  const locationsRes = await pool.query(`SELECT id, name, code FROM locations WHERE is_active=true`)

  for (const file of htmlFiles) {
    const fullPath = path.join(folder, file)
    const html = await fs.readFile(fullPath, 'utf8')
    const hash = sha256(html)

    const preflight = preflightReport(html, locationsRes.rows)
    if (preflight.detectedLocationIds.length !== 1) {
      console.warn(`[skip] ${file} ambiguous location`, preflight.detectedLocationIds)
      continue
    }
    const locationId = preflight.detectedLocationIds[0]

    const dup = await pool.query(
      `SELECT 1 FROM report_uploads WHERE location_id=$1 AND report_type=$2 AND sha256=$3`,
      [locationId, preflight.reportType, hash]
    )
    if (dup.rowCount) {
      console.log(`[skip] ${file} duplicate`) 
      continue
    }

    const uploadsDir = process.env.REPORT_UPLOADS_DIR || '/opt/aquasuite/uploads/reports'
    await fs.mkdir(uploadsDir, { recursive: true })
    const safeName = file.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const storedName = `${locationId}_${Date.now()}_${safeName}`
    const storedPath = path.join(uploadsDir, storedName)
    await fs.writeFile(storedPath, html, 'utf8')

    const uploadRes = await pool.query(
      `INSERT INTO report_uploads
        (location_id, report_type, report_title, detected_location_name, detected_location_ids, date_ranges, sha256, stored_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        locationId,
        preflight.reportType,
        file,
        preflight.detectedLocationName || null,
        JSON.stringify(preflight.detectedLocationIds || []),
        JSON.stringify(preflight.dateRanges || []),
        hash,
        storedPath
      ]
    )
    const uploadId = uploadRes.rows[0]?.id || null

    if (preflight.reportType === 'instructor_retention') {
      const rows = extractInstructorRetention(html)
      const range = preflight.dateRanges?.[0] || {}
      const asOfStart = parseUsDate(range.start || null)
      const asOfEnd = parseUsDate(range.end || null)
      for (const row of rows) {
        const staffId = await upsertStaffDirectory(locationId, row.instructorName)
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
      console.log(`[ok] ${file} retention rows: ${rows.length}`)
      continue
    }

    if (preflight.reportType === 'roll_sheets' || preflight.reportType === 'roster') {
      const fallbackDate = new Date().toISOString().slice(0, 10)
      await ingestRoster(locationId, html, uploadId, fallbackDate)
      console.log(`[ok] ${file} roster ingested`)
      continue
    }

    console.log(`[ok] ${file} stored (no parser)`)
  }

  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
