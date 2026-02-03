import * as cheerio from "cheerio"

export type InstructorRetentionRow = {
  instructorName: string
  startingHeadcount: number | null
  endingHeadcount: number | null
  retentionPercent: number | null
}

export function parseUsDate(input?: string | null): string | null {
  if (!input) return null
  const match = String(input).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) return null
  const mm = match[1].padStart(2, "0")
  const dd = match[2].padStart(2, "0")
  let yyyy = match[3]
  if (yyyy.length === 2) yyyy = `20${yyyy}`
  return `${yyyy}-${mm}-${dd}`
}

function normalizeRetentionName(raw: string) {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[0]
    const first = parts.slice(1).join(' ')
    return `${first} ${last}`.trim()
  }
  return raw
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100
}

export function extractInstructorRetention(html: string): InstructorRetentionRow[] {
  const $ = cheerio.load(html)
  const rows: InstructorRetentionRow[] = []

  const headers = $('h2').toArray()
  if (headers.length) {
    headers.forEach((h2) => {
      const nameRaw = $(h2).text().trim()
      if (!nameRaw || nameRaw.toLowerCase() === 'totals') return
      const table = $(h2).closest('table')
      if (!table.length) return

      const row = table.find('tbody tr.bg-shaded').first().length
        ? table.find('tbody tr.bg-shaded').first()
        : table.find('tbody tr').first()
      if (!row.length) return

      const cells = row.find('td').toArray().map((td) => $(td).text().replace(/\s+/g, ' ').trim())
      const dataCells = cells.slice(2)
      const values = dataCells.map((cell) => {
        const match = cell.match(/\d+/)
        return match ? Number(match[0]) : null
      })

      let bookedVals = values.slice(0, 7)
      let retainedVals = values.slice(8, 15)

      const bookedTotal = bookedVals.filter((v) => v !== null).slice(-1)[0] ?? bookedVals.find((v) => v !== null) ?? null
      const retainedTotal = retainedVals.filter((v) => v !== null).slice(-1)[0] ?? retainedVals.find((v) => v !== null) ?? null
      const retentionPercent = bookedTotal && retainedTotal ? roundPercent((retainedTotal / bookedTotal) * 100) : null

      rows.push({
        instructorName: normalizeRetentionName(nameRaw),
        startingHeadcount: bookedTotal,
        endingHeadcount: retainedTotal,
        retentionPercent
      })
    })
  }

  if (rows.length) return rows

  // Fallback: previous heuristic
  $('table tr').each((_, tr) => {
    const text = $(tr).text().replace(/\s+/g, ' ').trim()
    if (!text) return
    const match = text.match(/^(.*?)\s+(\d+)\s+\d+(?:\.\d+)?%\s+(\d+)\s+([\d.]+)%/)
    if (!match) return
    const name = match[1].trim()
    if (!name) return
    rows.push({
      instructorName: normalizeRetentionName(name),
      startingHeadcount: Number(match[2]),
      endingHeadcount: Number(match[3]),
      retentionPercent: Number(match[4])
    })
  })

  if (rows.length) return rows

  const fallback = html.split(/\n/)
  fallback.forEach((line) => {
    const text = line.replace(/\s+/g, ' ').trim()
    const match = text.match(/^(.*?)\s+(\d+)\s+\d+(?:\.\d+)?%\s+(\d+)\s+([\d.]+)%/)
    if (!match) return
    const name = match[1].trim()
    if (!name) return
    rows.push({
      instructorName: normalizeRetentionName(name),
      startingHeadcount: Number(match[2]),
      endingHeadcount: Number(match[3]),
      retentionPercent: Number(match[4])
    })
  })

  return rows
}


export type AgedAccountsRow = {
  bucket: string
  amount: number | null
  total: number | null
}

export type DropListRow = {
  dropDate: string | null
  swimmerName: string
  reason: string | null
}

export type EnrollmentRow = {
  eventDate: string | null
  swimmerName: string
}

export type AcneLeadRow = {
  leadDate: string | null
  fullName: string
  email: string | null
  phone: string | null
}

export type ReportParseResult<T> = {
  rows: T[]
  warnings: string[]
}

function normalizeHeader(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function cleanCellText(input: string) {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

function parseMoney(input: string) {
  const raw = cleanCellText(input)
  if (!raw) return null
  const normalized = raw.replace(/[^0-9.\-]/g, '')
  if (!normalized) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function parseTableRows(html: string, headerAliases: Record<string, string[]>) {
  const $ = cheerio.load(html)
  const tables = $('table').toArray()

  for (const table of tables) {
    const rows = $(table).find('tr').toArray()
    if (!rows.length) continue

    let headerRowIndex = -1
    let headerCells: string[] = []
    let headerNodes: any[] = []

    rows.some((tr, idx) => {
      const ths = $(tr).find('th').toArray()
      const tds = $(tr).find('td').toArray()
      const nodes = ths.length >= 2 ? ths : tds
      if (nodes.length >= 2) {
        headerRowIndex = idx
        headerNodes = nodes
        headerCells = nodes.map((node) => normalizeHeader(cleanCellText($(node).text())))
        return true
      }
      return false
    })

    if (headerRowIndex < 0) continue

    const headerMap: Record<string, number> = {}
    Object.keys(headerAliases).forEach((key) => {
      const aliases = headerAliases[key]
      for (let i = 0; i < headerCells.length; i += 1) {
        const header = headerCells[i]
        if (!header) continue
        if (aliases.some((alias) => header.includes(normalizeHeader(alias)))) {
          headerMap[key] = i
          break
        }
      }
    })

    const dataRows = rows.slice(headerRowIndex + 1)
      .map((tr) => $(tr).find('td').toArray().map((td) => cleanCellText($(td).text())))
      .filter((cells) => cells.length)

    return { headerMap, dataRows }
  }
  return null
}

export function extractAgedAccounts(html: string): ReportParseResult<AgedAccountsRow> {
  const warnings: string[] = []
  const headerAliases = {
    bucket: ['bucket', 'aging bucket', 'agingbucket', 'age bucket', 'aging'],
    amount: ['amount', 'balance', 'current balance', 'currentbalance', 'ar', 'total balance'],
    total: ['total', 'total balance', 'totalbalance']
  }
  const parsed = parseTableRows(html, headerAliases)

  // Special-case: guardian-level aged accounts (bucket columns per row)
  const $ = cheerio.load(html)
  const tables = $('table').toArray()
  for (const table of tables) {
    const rows = $(table).find('tr').toArray()
    if (rows.length < 2) continue
    const headerRow = rows[0]
    const headerCells = $(headerRow)
      .find('th,td')
      .toArray()
      .map((node) => normalizeHeader(cleanCellText($(node).text())))

    if (!headerCells.length) continue
    const hasGuardian = headerCells.some((h) => h.includes('guardian'))
    const hasCurrent = headerCells.some((h) => h.includes('current'))
    const hasTotal = headerCells.some((h) => h.includes('total'))
    if (!(hasGuardian && (hasCurrent || hasTotal))) continue

    const bucketLabels: Array<{ label: string; idx: number }> = []
    headerCells.forEach((header, idx) => {
      if (!header) return
      if (header.includes('guardian') || header.includes('phone') || header.includes('address') || header.includes('email')) return
      if (header.includes('lastpaymentdate') || header.includes('lastpayment')) return
      if (header.includes('unappliedcredit')) {
        bucketLabels.push({ label: 'Unapplied Credit', idx })
        return
      }
      if (header.includes('current')) {
        bucketLabels.push({ label: 'Current', idx })
        return
      }
      if (header.includes('130')) {
        bucketLabels.push({ label: '1-30', idx })
        return
      }
      if (header.includes('3160')) {
        bucketLabels.push({ label: '31-60', idx })
        return
      }
      if (header.includes('6190')) {
        bucketLabels.push({ label: '61-90', idx })
        return
      }
      if (header.includes('91')) {
        bucketLabels.push({ label: '91+', idx })
        return
      }
      if (header === 'total') {
        bucketLabels.push({ label: 'Total', idx })
        return
      }
    })

    if (!bucketLabels.length) continue
    const totals: Record<string, number> = {}
    let totalFromColumn = 0

    rows.slice(1).forEach((row) => {
      const cells = $(row).find('td').toArray().map((td) => cleanCellText($(td).text()))
      if (!cells.length) return
      const first = cleanCellText(cells[0] || '').toLowerCase()
      if (first.startsWith('totals')) return

      bucketLabels.forEach(({ label, idx }) => {
        if (!(label in totals) && label !== 'Total') totals[label] = 0
        const val = parseMoney(cells[idx] || '')
        if (val === null) return
        totals[label] = (totals[label] || 0) + val
        if (label === 'Total') totalFromColumn += val
      })
    })

    const overall = totalFromColumn || Object.entries(totals).filter(([k]) => k !== 'Total').reduce((sum, [, v]) => sum + v, 0)
    const rowsOut: AgedAccountsRow[] = Object.entries(totals)
      .filter(([label]) => label !== 'Total')
      .map(([label, amount]) => ({ bucket: label, amount, total: overall }))

    if (rowsOut.length) return { rows: rowsOut, warnings }
  }

  if (!parsed) return { rows: [], warnings: ['table_not_found'] }

  const rows: AgedAccountsRow[] = []
  parsed.dataRows.forEach((cells) => {
    const bucketRaw = parsed.headerMap.bucket !== undefined ? cells[parsed.headerMap.bucket] : ''
    const bucket = cleanCellText(bucketRaw || '')
    if (!bucket) return
    if (['total', 'grand total', 'totals'].includes(bucket.toLowerCase())) return
    const amountCell = parsed.headerMap.amount !== undefined ? cells[parsed.headerMap.amount] : ''
    const totalCell = parsed.headerMap.total !== undefined ? cells[parsed.headerMap.total] : ''
    const amount = parseMoney(amountCell || '')
    const total = parseMoney(totalCell || '')
    rows.push({
      bucket,
      amount,
      total: total !== null ? total : amount
    })
  })

  if (!rows.length) warnings.push('no_rows_parsed')
  return { rows, warnings }
}

export function extractDropList(html: string): ReportParseResult<DropListRow> {
  const warnings: string[] = []
  const headerAliases = {
    date: ['drop date'],
    swimmer: ['student', 'swimmer', 'child'],
    reason: ['reason', 'drop reason', 'notes']
  }
  const parsed = parseTableRows(html, headerAliases)
  if (!parsed) return { rows: [], warnings: ['table_not_found'] }

  const rows: DropListRow[] = []
  parsed.dataRows.forEach((cells) => {
    const name = cleanCellText(parsed.headerMap.swimmer !== undefined ? cells[parsed.headerMap.swimmer] : '')
    if (!name) return
    const dateRaw = cleanCellText(parsed.headerMap.date !== undefined ? cells[parsed.headerMap.date] : '')
    const reason = cleanCellText(parsed.headerMap.reason !== undefined ? cells[parsed.headerMap.reason] : '')
    rows.push({
      dropDate: parseUsDate(dateRaw),
      swimmerName: name,
      reason: reason || null
    })
  })

  if (!rows.length) warnings.push('no_rows_parsed')
  return { rows, warnings }
}

export function extractEnrollmentEvents(html: string): ReportParseResult<EnrollmentRow> {
  const warnings: string[] = []
  const headerAliases = {
    date: ['start date', 'enrollment date', 'created date', 'new enrollment'],
    swimmer: ['student', 'swimmer', 'child']
  }
  const parsed = parseTableRows(html, headerAliases)
  if (!parsed) return { rows: [], warnings: ['table_not_found'] }

  const rows: EnrollmentRow[] = []
  parsed.dataRows.forEach((cells) => {
    const name = cleanCellText(parsed.headerMap.swimmer !== undefined ? cells[parsed.headerMap.swimmer] : '')
    if (!name) return
    const dateRaw = cleanCellText(parsed.headerMap.date !== undefined ? cells[parsed.headerMap.date] : '')
    rows.push({
      eventDate: parseUsDate(dateRaw),
      swimmerName: name
    })
  })

  if (!rows.length) warnings.push('no_rows_parsed')
  return { rows, warnings }
}

export function extractAcneLeads(html: string): ReportParseResult<AcneLeadRow> {
  const warnings: string[] = []
  const headerAliases = {
    date: ['account created', 'created', 'lead date', 'date'],
    name: ['guardian', 'guardians', 'account', 'lead', 'name'],
    email: ['email', 'email address'],
    phone: ['primary phone', 'phone', 'phone number', 'mobile']
  }
  const parsed = parseTableRows(html, headerAliases)
  if (!parsed) return { rows: [], warnings: ['table_not_found'] }

  const rows: AcneLeadRow[] = []
  parsed.dataRows.forEach((cells) => {
    const name = cleanCellText(parsed.headerMap.name !== undefined ? cells[parsed.headerMap.name] : '')
    if (!name) return
    const dateRaw = cleanCellText(parsed.headerMap.date !== undefined ? cells[parsed.headerMap.date] : '')
    const email = cleanCellText(parsed.headerMap.email !== undefined ? cells[parsed.headerMap.email] : '')
    const phone = cleanCellText(parsed.headerMap.phone !== undefined ? cells[parsed.headerMap.phone] : '')
    rows.push({
      leadDate: parseUsDate(dateRaw),
      fullName: name,
      email: email || null,
      phone: phone || null
    })
  })

  if (!rows.length) warnings.push('no_rows_parsed')
  return { rows, warnings }
}
