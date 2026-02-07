export type LeadRow = { full_name?: string | null; email?: string | null; phone?: string | null }
export type WorkQueueRow = LeadRow & { lead_date?: string | null }

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeName(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function buildWorkQueueIdentityKey(row: WorkQueueRow) {
  // Prefer a stable contact identity key. This prevents "duplicate-looking" queue entries when
  // names vary but email/phone is the same.
  const phone = normalizePhone(row.phone)
  if (phone) return `p:${phone}`
  const email = normalizeEmail(row.email)
  if (email) return `e:${email}`
  const name = normalizeName(row.full_name)
  const date = String(row.lead_date || '').slice(0, 10)
  return `n:${name}|d:${date}`
}

export function dedupeWorkQueue(leads: WorkQueueRow[], enrolledNames: Set<string>) {
  const seen = new Set<string>()
  const result: WorkQueueRow[] = []
  for (const row of leads || []) {
    const name = normalizeName(row.full_name)
    if (!name || enrolledNames.has(name)) continue
    const dedupeKey = buildWorkQueueIdentityKey(row)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    result.push(row)
  }
  return result
}

export type RetentionRow = {
  report_date?: string
  instructor_name?: string
  booked?: number | null
  retained?: number | null
  percent_this_cycle?: number | null
  percent_change?: number | null
}

export function collapseRetentionRows(rows: RetentionRow[]) {
  const seen = new Set<string>()
  const out: RetentionRow[] = []
  for (const row of rows || []) {
    const key = String(row.instructor_name || '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
