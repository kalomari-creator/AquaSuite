export type LeadRow = { full_name?: string | null; email?: string | null; phone?: string | null }
export type WorkQueueRow = LeadRow & { lead_date?: string | null }

export function dedupeWorkQueue(leads: WorkQueueRow[], enrolledNames: Set<string>) {
  const seen = new Set<string>()
  const result: WorkQueueRow[] = []
  for (const row of leads || []) {
    const name = String(row.full_name || '').toLowerCase()
    if (!name || enrolledNames.has(name)) continue
    const keyEmail = String(row.email || '').toLowerCase()
    const keyPhone = String(row.phone || '').replace(/\D/g, '')
    const dedupeKey = `${name}|${keyEmail}|${keyPhone}`
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
