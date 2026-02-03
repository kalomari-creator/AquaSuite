import * as cheerio from "cheerio"

export type ParsedRosterEntry = {
  classDate?: string
  startTime?: string
  className?: string
  swimmerName: string
  ageText?: string
  program?: string
  level?: string
  instructorName?: string
  instructorNameRaw?: string
  instructorNameNorm?: string
  scheduledInstructor?: string
  actualInstructor?: string
  isSub: boolean
  zone?: number | null
  attendance?: 0 | 1 | null
  attendanceAutoAbsent: boolean
  flagFirstTime: boolean
  flagMakeup: boolean
  flagPolicy: boolean
  flagOwes: boolean
  flagTrial: boolean
  balanceAmount?: number | null
}

const iconMap: Record<string, keyof Pick<ParsedRosterEntry, "flagFirstTime" | "flagMakeup" | "flagPolicy" | "flagOwes" | "flagTrial">> = {
  "1st-ever.png": "flagFirstTime",
  "balance.png": "flagOwes",
  "birthday.png": "flagMakeup",
  "makeup.png": "flagMakeup",
  "policy.png": "flagPolicy",
  "trial.png": "flagTrial"
}

export function parseIclassproRosterEntries(html: string): { entries: ParsedRosterEntry[] } {
  const $ = cheerio.load(html)
  const entries: ParsedRosterEntry[] = []
  const reportYear = extractReportYear(html)

  const sections = $("div[style*='page-break-inside']").toArray()
  for (const section of sections) {
    const $section = $(section)

    const headerText = $section.find(".full-width-header").text().replace(/\s+/g, " ").trim()
    const className = extractClassName(headerText)

    const scheduleText = $section.find('th:contains("Schedule:")').first().next().text()
    const startTime = extractStartTime(scheduleText)
    if (!startTime) continue

    const headerDateText = $section.find(".full-width-header .no-wrap span").last().text().trim()
    const headerDate = parseDateText(headerDateText, reportYear)

    const instructorMeta = extractInstructorMeta($section)

    let programText: string | null = null
    const programSpan = $section.find('th:contains("Program:")').next().find('span').first().text().trim()
    if (programSpan) {
      const upProg = programSpan.toUpperCase()
      if (upProg === "GROUP") {
        const fullText = $section.text()
        const levelMatch = fullText.match(/GROUP:\s*(Beginner|Intermediate|Advanced|Swimmer)\s*(\d+)/i)
        if (levelMatch) {
          const levelName = levelMatch[1].charAt(0).toUpperCase() + levelMatch[1].slice(1).toLowerCase()
          programText = `GROUP: ${levelName} ${levelMatch[2]}`
        } else {
          programText = "GROUP"
        }
      } else {
        programText = normalizeProgramNonGroup(programSpan)
      }
    }

    let zone: number | null = null
    const zoneText = $section.find('th:contains("Zone:")').next().find('span').text().trim()
    const zoneMatch = zoneText.match(/Zone\s*(\d+)/i)
    if (zoneMatch) zone = parseInt(zoneMatch[1], 10)

    const $table = $section.find("table.table-roll-sheet").first()
    const sectionText = $section.text()
    const dateRange = parseDateRangeFromSectionText(sectionText)
    const dateColumns = $table.length ? parseRosterDateColumns($, $table, dateRange, startTime) : []

    const instructorColumnIndex = $table.length
      ? (() => {
        let idx = -1
        $table.find("thead th").each((colIndex, th) => {
          const label = $(th).text().replace(/\s+/g, " ").trim()
          if (label && /Instructor/i.test(label)) {
            idx = colIndex
            return false
          }
          return true
        })
        return idx
      })()
      : -1

    $section.find("table.table-roll-sheet tbody tr").each((_, row) => {
      const $row = $(row)
      const nameEl = $row.find(".student-name strong")
      if (nameEl.length === 0) return

      const swimmerName = lastFirstToFirstLast(nameEl.text().trim())
      const ageText = normalizeAgeText($row.find(".student-info").text().trim())

      const rowInstructorCell = instructorColumnIndex >= 0 ? $row.find("td").eq(instructorColumnIndex) : null
      const rowInstructorMeta = rowInstructorCell ? extractInstructorMetaFromText(rowInstructorCell.text()) : null

      const resolvedInstructor = rowInstructorMeta?.instructorName || instructorMeta.instructorName
      const resolvedSub = rowInstructorMeta?.substituteInstructor || instructorMeta.substituteInstructor
      const resolvedRaw = rowInstructorMeta?.raw || instructorMeta.raw
      const isSub = !!resolvedSub
      const scheduledInstructor = resolvedInstructor || undefined
      const actualInstructor = resolvedSub || resolvedInstructor || undefined

      const flags = {
        flagFirstTime: false,
        flagMakeup: false,
        flagPolicy: false,
        flagOwes: false,
        flagTrial: false
      }

      $row.find(".icons img").each((_, img) => {
        const src = $(img).attr("src") || ""
        const filename = src.split("/").pop() || ""
        const flagName = iconMap[filename]
        if (flagName) flags[flagName] = true
      })

      let balanceAmount: number | null = null
      const detailsText = $row.find("td").eq(3).text()
      const balanceMatch = detailsText.match(/Balance:\s*\$?([-\d,.]+)/i)
      if (balanceMatch) {
        const balanceStr = balanceMatch[1].replace(/,/g, "")
        const parsed = parseFloat(balanceStr)
        if (!Number.isNaN(parsed)) {
          balanceAmount = parsed
          if (parsed !== 0) flags.flagOwes = true
        }
      }

      const { program, level } = splitProgramLevel(programText || "")

      if (dateColumns.length > 0) {
        const rowCells = $row.find("td")
        dateColumns.forEach((col) => {
          const cell = rowCells.eq(col.index)
          const autoAbsent = hasAutoAbsentIndicator(cell, $)
          const attendance = isAbsentAttendanceCell(cell, $) ? 0 : null

          entries.push({
            classDate: col.date || headerDate || undefined,
            startTime: col.start_time || startTime,
            className,
            swimmerName,
            ageText,
            program,
            level,
            instructorName: actualInstructor,
            instructorNameRaw: resolvedRaw || actualInstructor,
            instructorNameNorm: resolvedRaw ? normalizeForRoster(resolvedRaw) : actualInstructor ? normalizeForRoster(actualInstructor) : undefined,
            scheduledInstructor,
            actualInstructor,
            isSub,
            zone,
            attendance,
            attendanceAutoAbsent: autoAbsent,
            balanceAmount,
            ...flags
          })
        })
      } else {
        const attendanceCell = $row.find("td.date-time, td.cell-bordered")
        const autoAbsent = hasAutoAbsentIndicator(attendanceCell, $)
        const attendance = isAbsentAttendanceCell(attendanceCell, $) ? 0 : null

        entries.push({
          classDate: headerDate || undefined,
          startTime,
          className,
          swimmerName,
          ageText,
          program,
          level,
          instructorName: actualInstructor,
          instructorNameRaw: resolvedRaw || actualInstructor,
          instructorNameNorm: resolvedRaw ? normalizeForRoster(resolvedRaw) : actualInstructor ? normalizeForRoster(actualInstructor) : undefined,
          scheduledInstructor,
          actualInstructor,
          isSub,
          zone,
          attendance,
          attendanceAutoAbsent: autoAbsent,
          balanceAmount,
          ...flags
        })
      }
    })
  }

  return { entries }
}

function extractClassName(headerText: string): string | undefined {
  const trimmed = String(headerText || "").trim()
  if (!trimmed) return undefined
  const onMatch = trimmed.match(/^(.+?)\s+on\s+\w+\s*:/i)
  if (onMatch) return onMatch[1].trim()
  const withMatch = trimmed.match(/^(.+?)\s+with\s+/i)
  if (withMatch) return withMatch[1].trim()
  return trimmed
}

function extractStartTime(scheduleText: string): string | undefined {
  const match = scheduleText.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i)
  if (!match) return undefined
  return normalizeTimeTo24h(match[0])
}

function extractReportYear(html: string): number | undefined {
  const match = html.match(/\"startDate\"\s*:\s*\"(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return undefined
  return Number(match[1])
}

function parseDateText(text: string, reportYear?: number): string | undefined {
  const full = String(text || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (full) {
    return `${full[3]}-${full[1].padStart(2, "0")}-${full[2].padStart(2, "0")}`
  }
  const partial = String(text || "").match(/(\d{1,2})\/(\d{1,2})/)
  if (partial && reportYear) {
    return `${reportYear}-${partial[1].padStart(2, "0")}-${partial[2].padStart(2, "0")}`
  }
  return undefined
}

function normalizeTimeTo24h(raw: string): string | undefined {
  const m = String(raw || "").trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/)
  if (!m) return undefined
  let hh = parseInt(m[1], 10)
  const mm = parseInt(m[2] || "0", 10)
  const ap = m[3]
  if (ap === "pm" && hh !== 12) hh += 12
  if (ap === "am" && hh === 12) hh = 0
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`
}

function lastFirstToFirstLast(s: string): string {
  const t = String(s || "").replace(/\s+/g, " ").trim()
  const parts = t.split(",")
  if (parts.length >= 2) {
    const last = parts[0].trim()
    const first = parts.slice(1).join(",").trim()
    return `${first} ${last}`.replace(/\s+/g, " ").trim()
  }
  return t
}

function normalizeProgramNonGroup(raw: string): string {
  const t = String(raw || "").replace(/\s+/g, " ").trim()
  return t
}

function normalizeAgeText(raw: string): string | undefined {
  const text = String(raw || "").replace(/\s+/g, " ").trim()
  if (!text) return undefined
  const match = text.match(/\d+\s*y\s*\d+\s*m|\d+\s*y|\d+\s*m/i)
  if (match) return match[0]
  return text
}

function extractInstructorMeta(section: cheerio.Cheerio<cheerio.Element>): { instructorName?: string; substituteInstructor?: string; raw?: string } {
  let instructorName: string | undefined
  let substituteInstructor: string | undefined
  let raw: string | undefined

  const headerText = section.find(".full-width-header").text().replace(/\s+/g, " ").trim()
  if (headerText) {
    const headerMatch = headerText.match(/with\s+(.+?)(?:\s{2,}|Zone:|Program:|Schedule:|Capacity:|Ages:|$)/i)
    if (headerMatch) {
      const headerInstructor = headerMatch[1].trim()
      const headerIsSub = /\*|\(sub\)/i.test(headerInstructor)
      const cleanedHeader = headerInstructor.replace(/\(sub\)/gi, "").replace(/\*/g, "").trim()
      if (cleanedHeader) {
        raw = headerInstructor
        if (headerIsSub) {
          substituteInstructor = lastFirstToFirstLast(cleanedHeader)
        } else {
          instructorName = lastFirstToFirstLast(cleanedHeader)
        }
      }
    }
  }

  const instructorHeader = section
    .find("th")
    .filter((_, th) => /Instructors?:/i.test(cheerio.load(th).text().replace(/\s+/g, " ").trim()))
    .first()
  const instructorCell = instructorHeader.length ? instructorHeader.next() : null

  if (instructorCell && instructorCell.length) {
    const instructorItems = instructorCell.find("li")
    if (instructorItems.length > 0) {
      const lines: string[] = []
      instructorItems.each((_, item) => {
        const text = cheerio.load(item).text().trim()
        if (text) lines.push(text)
      })
      const meta = extractInstructorMetaFromText(lines.join("\n"))
      if (!instructorName && meta?.instructorName) instructorName = meta.instructorName
      if (!substituteInstructor && meta?.substituteInstructor) substituteInstructor = meta.substituteInstructor
      if (!raw && meta?.raw) raw = meta.raw
    } else {
      const meta = extractInstructorMetaFromText(instructorCell.text())
      if (!instructorName && meta?.instructorName) instructorName = meta.instructorName
      if (!substituteInstructor && meta?.substituteInstructor) substituteInstructor = meta.substituteInstructor
      if (!raw && meta?.raw) raw = meta.raw
    }
  }

  if (!instructorName && substituteInstructor) {
    instructorName = substituteInstructor
    substituteInstructor = undefined
  }

  return { instructorName, substituteInstructor, raw }
}

function extractInstructorMetaFromText(raw: string): { instructorName?: string; substituteInstructor?: string; raw?: string } {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  let instructorName: string | undefined
  let substituteInstructor: string | undefined

  const processName = (name: string) => {
    const cleaned = name.replace(/^Instructors?:/i, "").trim()
    if (!cleaned) return
    const isSub = /\*|\(sub\)/i.test(cleaned)
    const normalized = cleaned.replace(/\(sub\)/gi, "").replace(/\*/g, "").trim()
    if (!normalized) return
    if (!raw) raw = cleaned
    if (isSub) {
      substituteInstructor = lastFirstToFirstLast(normalized)
    } else if (!instructorName) {
      instructorName = lastFirstToFirstLast(normalized)
    }
  }

  if (lines.length > 0) {
    lines.forEach(processName)
  } else if (raw) {
    processName(String(raw).replace(/\s+/g, " ").trim())
  }

  if (!instructorName && substituteInstructor) {
    instructorName = substituteInstructor
    substituteInstructor = undefined
  }

  return { instructorName, substituteInstructor, raw }
}

function parseDateRangeFromSectionText(text: string) {
  const t = String(text || "")
  const rangeMatch = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:→|->|–|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!rangeMatch) return null

  const startMonth = String(rangeMatch[1]).padStart(2, "0")
  const startDay = String(rangeMatch[2]).padStart(2, "0")
  const startYear = rangeMatch[3]
  const endMonth = String(rangeMatch[4]).padStart(2, "0")
  const endDay = String(rangeMatch[5]).padStart(2, "0")
  const endYear = rangeMatch[6]

  return {
    start: `${startYear}-${startMonth}-${startDay}`,
    end: `${endYear}-${endMonth}-${endDay}`,
    startYear: Number(startYear),
    endYear: Number(endYear),
    startMonth: Number(startMonth),
    startDay: Number(startDay)
  }
}

function inferYearFromRange(month: string, day: string, range: any) {
  const mm = Number(month)
  const dd = Number(day)
  if (!range || !range.startYear || !range.endYear) return new Date().getFullYear()
  if (range.startYear === range.endYear) return range.startYear

  if (mm > range.startMonth || (mm === range.startMonth && dd >= range.startDay)) {
    return range.startYear
  }
  return range.endYear
}

function extractDateTimeFromHeader(text: string, range: any, fallbackTime: string) {
  const t = String(text || "").replace(/\s+/g, " ").trim()
  const dateMatch = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/)
  if (!dateMatch) return null

  const month = String(dateMatch[1]).padStart(2, "0")
  const day = String(dateMatch[2]).padStart(2, "0")
  const year = dateMatch[3] ? Number(dateMatch[3]) : inferYearFromRange(month, day, range)
  const dateISO = `${year}-${month}-${day}`

  const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  let startTime = fallbackTime || null
  if (timeMatch) {
    const timeRaw = `${timeMatch[1]}:${timeMatch[2] || "00"} ${timeMatch[3]}`
    startTime = normalizeTimeTo24h(timeRaw) || startTime
  }

  return { dateISO, startTime }
}

function parseRosterDateColumns($: cheerio.CheerioAPI, $table: cheerio.Cheerio<cheerio.Element>, range: any, fallbackTime: string) {
  const headerRows = $table.find("thead tr")
  const rowsToScan = headerRows.length ? headerRows.toArray() : $table.find("tr").slice(0, 2).toArray()

  for (const row of rowsToScan) {
    const $row = $(row)
    const columns: any[] = []
    let colIndex = 0

    $row.find("th, td").each((_, cell) => {
      const $cell = $(cell)
      const colSpan = parseInt($cell.attr("colspan") || "1", 10)
      const info = extractDateTimeFromHeader($cell.text(), range, fallbackTime)

      for (let i = 0; i < colSpan; i += 1) {
        if (info && i === 0) {
          columns.push({
            index: colIndex,
            date: info.dateISO,
            start_time: info.startTime || fallbackTime || null
          })
        }
        colIndex += 1
      }
    })

    if (columns.length > 0) return columns
  }

  return []
}

function hasAutoAbsentIndicator($cell: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): boolean {
  if (!$cell || !$cell.length) return false
  const text = $cell.text().toLowerCase()
  if (text.includes("ø") || text.includes("⌀") || text.includes("⊘")) return true

  let hasCancel = false
  $cell.find("img").each((_, img) => {
    const src = String($(img).attr("src") || "").toLowerCase()
    const alt = String($(img).attr("alt") || "").toLowerCase()
    const title = String($(img).attr("title") || "").toLowerCase()
    const filename = src.split("/").pop() || ""
    const blob = `${src} ${alt} ${title} ${filename}`
    if (blob.includes("cancel")) hasCancel = true
  })
  return hasCancel
}

function isAbsentAttendanceCell($cell: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): boolean {
  if (!$cell || !$cell.length) return false

  const text = $cell.text().toLowerCase()
  if (text.includes("absent") || text.includes("no show") || text.includes("noshow")) return true
  if (text.includes("ø") || text.includes("⌀") || text.includes("⊘")) return true

  const styleStrike = $cell.find('[style*="line-through"]').length > 0
  if (styleStrike) return true

  const classStrike = $cell.find('[class*="absent"], [class*="no-show"], [class*="noshow"], [class*="strike"]').length > 0
  if (classStrike) return true

  if (hasAutoAbsentIndicator($cell, $)) return true

  let isAbsent = false
  $cell.find("img").each((_, img) => {
    const src = String($(img).attr("src") || "").toLowerCase()
    const alt = String($(img).attr("alt") || "").toLowerCase()
    const title = String($(img).attr("title") || "").toLowerCase()
    const blob = `${src} ${alt} ${title}`
    if (
      blob.includes("x-modifier") ||
      blob.includes("absent") ||
      blob.includes("no-show") ||
      blob.includes("noshow") ||
      (blob.includes("circle") && (blob.includes("slash") || blob.includes("strike")))
    ) {
      isAbsent = true
    }
  })

  return isAbsent
}

function splitProgramLevel(programText: string): { program?: string; level?: string } {
  const text = String(programText || "").trim()
  if (!text) return {}
  if (text.toUpperCase().startsWith("GROUP:")) {
    const rest = text.split(":")[1]?.trim()
    return { program: "GROUP", level: rest || undefined }
  }
  const parts = text.split(":")
  if (parts.length >= 2) {
    return { program: parts[0].trim(), level: parts.slice(1).join(":").trim() }
  }
  return { program: text }
}

function normalizeForRoster(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\\([^)]*\\)/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}
