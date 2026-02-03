import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const args = process.argv.slice(2)
const fileArg = args[args.indexOf('--file') + 1]
const locationArg = args[args.indexOf('--location') + 1]

if (!fileArg || !locationArg) {
  console.error('Usage: npm run staff:import -- --file "..." --location "location-code"')
  process.exit(1)
}

const filePath = path.resolve(fileArg)
const csv = fs.readFileSync(filePath, 'utf8')

function parseCSV(text: string) {
  const rows: string[][] = []
  let current: string[] = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      current.push(value)
      value = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (value || current.length) {
        current.push(value)
        rows.push(current)
        current = []
        value = ''
      }
      continue
    }
    value += char
  }
  if (value || current.length) {
    current.push(value)
    rows.push(current)
  }
  return rows
}

function normalizePhone(raw: string | undefined) {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return null
  return digits
}

function parseDateMDY(raw: string | undefined) {
  if (!raw) return null
  const parts = raw.split('/')
  if (parts.length < 3) return null
  const mm = parts[0].padStart(2, '0')
  const dd = parts[1].padStart(2, '0')
  let yyyy = parts[2]
  if (yyyy.length === 2) yyyy = `20${yyyy}`
  const iso = `${yyyy}-${mm}-${dd}`
  return iso
}

async function run() {
  const rows = parseCSV(csv)
  const [header, ...data] = rows
  const index = (name: string) => header.findIndex((h) => h.trim() === name)

  const idxFirst = index('First Name')
  const idxLast = index('Last Name')
  const idxEmail = index('Email')
  const idxPhone = index('Phone')
  const idxBirthday = index('Birthday')
  const idxLocation = index('Location')
  const idxPermission = index('Permission Level')
  const idxPin = index('PIN for Time Clock')
  const idxPayroll = index('Payroll ID')
  const idxHire = index('Hire Date')

  const locRes = await pool.query('SELECT id, code, name FROM locations')
  const location = locRes.rows.find((l) => l.code === locationArg) || locRes.rows.find((l) => l.name === locationArg)
  if (!location) {
    console.error('Location not found:', locationArg)
    process.exit(1)
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of data) {
    const first = row[idxFirst]?.trim()
    const last = row[idxLast]?.trim()
    const email = row[idxEmail]?.trim().toLowerCase()
    if (!first || !last || !email) {
      skipped += 1
      continue
    }

    const phone = normalizePhone(row[idxPhone])
    const birthday = parseDateMDY(row[idxBirthday])
    const permission = row[idxPermission]?.trim() || null
    const pin = row[idxPin]?.replace(/'/g, '').trim() || null
    const payrollId = row[idxPayroll]?.trim() || null
    const hireDate = parseDateMDY(row[idxHire])
    const locationName = row[idxLocation]?.trim() || ''

    if (locationName && !locationName.toLowerCase().includes(location.name.toLowerCase())) {
      // skip rows not matching the target location
      continue
    }

    const staffRes = await pool.query(
      `INSERT INTO staff (first_name, last_name, email, phone, birthday)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET
         first_name=EXCLUDED.first_name,
         last_name=EXCLUDED.last_name,
         phone=EXCLUDED.phone,
         birthday=EXCLUDED.birthday
       RETURNING id`,
      [first, last, email, phone, birthday]
    )

    const staffId = staffRes.rows[0].id
    if (staffRes.rowCount) inserted += 1

    const locRes2 = await pool.query(
      `INSERT INTO staff_locations (staff_id, location_id, permission_level, pin, payroll_id, hire_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (staff_id, location_id) DO UPDATE SET
         permission_level=EXCLUDED.permission_level,
         pin=EXCLUDED.pin,
         payroll_id=EXCLUDED.payroll_id,
         hire_date=EXCLUDED.hire_date
       RETURNING id`,
      [staffId, location.id, permission, pin, payrollId, hireDate]
    )
    if (locRes2.rowCount) updated += 1
  }

  console.log(`Staff import complete. inserted=${inserted} updated=${updated} skipped=${skipped}`)
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
