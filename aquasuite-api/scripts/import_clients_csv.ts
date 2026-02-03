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
  console.error('Usage: npm run clients:import -- --file "..." --location "location-code"')
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

async function run() {
  const rows = parseCSV(csv)
  const [header, ...data] = rows
  const index = (name: string) => header.findIndex((h) => h.trim() === name)

  const idxFirst = index('First Name')
  const idxLast = index('Last Name')
  const idxEmail = index('Email')
  const idxPhone = index('Phone')
  const idxExternal = index('External ID')

  const locRes = await pool.query('SELECT id, code, name FROM locations')
  const location = locRes.rows.find((l) => l.code === locationArg) || locRes.rows.find((l) => l.name === locationArg)
  if (!location) {
    console.error('Location not found:', locationArg)
    process.exit(1)
  }

  let inserted = 0
  for (const row of data) {
    const first = row[idxFirst]?.trim()
    const last = row[idxLast]?.trim()
    if (!first || !last) continue

    const email = row[idxEmail]?.trim() || null
    const phone = normalizePhone(row[idxPhone])
    const externalId = row[idxExternal]?.trim() || null

    await pool.query(
      `INSERT INTO clients (location_id, first_name, last_name, email, phone, source_system, source_external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [location.id, first, last, email, phone, 'csv', externalId]
    )
    inserted += 1
  }

  console.log(`Client import complete. inserted=${inserted}`)
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
