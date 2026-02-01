import * as cheerio from "cheerio"

export type ParsedClass = {
  className: string
  scheduleText?: string
  classDate?: string
  startTime?: string
  endTime?: string
  scheduledInstructor?: string
  actualInstructor?: string
  isSub: boolean
}

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/
const DATE_MMDD_RE = /(\d{1,2})\/(\d{1,2})/

export function parseIclassproRollsheet(html: string): { classes: ParsedClass[] } {
  const $ = cheerio.load(html)
  const classes: ParsedClass[] = []

  const blocks = $(".condensed-mode > div").toArray()
  const classBlocks = blocks.length ? blocks : $(".condensed-mode").children().toArray()

  const reportYear = extractReportYear(html)

  for (const el of classBlocks) {
    const block = $(el)

    const headerText = block.find(".full-width-header span").first().text().trim()
    const headerDateText = block.find(".full-width-header .no-wrap span").last().text().trim()

    const className = extractClassName(headerText)
    if (!className) continue

    const scheduleText = extractScheduleText(block, headerText)
    const { startTime, endTime } = parseScheduleTimes(scheduleText, headerText)

    const classDate = extractClassDate(block, headerDateText, reportYear)

    const instructors = extractInstructors(block)
    const { scheduledInstructor, actualInstructor, isSub } = resolveInstructors(
      instructors,
      extractHeaderInstructor(headerText)
    )

    classes.push({
      className,
      scheduleText,
      classDate,
      startTime,
      endTime,
      scheduledInstructor,
      actualInstructor,
      isSub
    })
  }

  return { classes: dedupeClasses(classes) }
}

function extractClassName(headerText: string): string {
  const trimmed = headerText.trim()
  if (!trimmed) return ""

  const onMatch = trimmed.match(/^(.+?)\s+on\s+\w+\s*:/i)
  if (onMatch) return onMatch[1].trim()

  const withMatch = trimmed.match(/^(.+?)\s+with\s+/i)
  if (withMatch) return withMatch[1].trim()

  return trimmed
}

function extractHeaderInstructor(headerText: string): string | undefined {
  const match = headerText.match(/\s+with\s+([^]+)$/i)
  if (!match) return undefined
  return normalizeInstructorName(match[1]) || undefined
}

function extractScheduleText(block: cheerio.Cheerio<cheerio.Element>, headerText: string): string | undefined {
  const schedCell = block.find('th:contains("Schedule:")').first().next()
  if (schedCell.length) {
    const text = schedCell.text().replace(/\s+/g, " ").trim()
    if (text) return text
  }

  const scheduleDetails = block.find("table.schedule-details").text().replace(/\s+/g, " ").trim()
  if (scheduleDetails) return scheduleDetails

  return headerText
}

function extractClassDate(
  block: cheerio.Cheerio<cheerio.Element>,
  headerDateText: string,
  reportYear?: number
): string | undefined {
  const dateFromHeader = parseDateText(headerDateText, reportYear)
  if (dateFromHeader) return dateFromHeader

  const classDateText = block.find(".class-date").first().text().trim()
  const fromClassDate = parseDateText(classDateText, reportYear)
  if (fromClassDate) return fromClassDate

  return undefined
}

function extractInstructors(block: cheerio.Cheerio<cheerio.Element>): string[] {
  const list: string[] = []
  const container = block.find('th:contains("Instructors:")').first().next()
  if (container.length) {
    container.find("li").each((_, li) => {
      const raw = cheerio.load(li).text().trim()
      if (raw) list.push(raw)
    })
  }

  if (list.length) return list

  const fallbackLis = block.find("ul li").toArray().slice(0, 5)
  for (const li of fallbackLis) {
    const raw = cheerio.load(li).text().trim()
    if (raw && raw.includes(",")) list.push(raw)
  }

  return list
}

function resolveInstructors(instructors: string[], headerInstructor?: string): {
  scheduledInstructor?: string
  actualInstructor?: string
  isSub: boolean
} {
  const cleaned = instructors
    .map((raw) => ({ raw, normalized: normalizeInstructorName(raw) }))
    .filter((item) => item.normalized)

  const sub = cleaned.find((item) => hasSubMarker(item.raw))
  if (sub) {
    const actual = sub.normalized
    const scheduled = cleaned.find((item) => !hasSubMarker(item.raw))?.normalized
    return {
      scheduledInstructor: scheduled || undefined,
      actualInstructor: actual || undefined,
      isSub: !!(scheduled && actual && scheduled !== actual)
    }
  }

  if (cleaned.length) {
    const name = cleaned[0].normalized
    return {
      scheduledInstructor: name,
      actualInstructor: name,
      isSub: false
    }
  }

  if (headerInstructor) {
    return {
      scheduledInstructor: headerInstructor,
      actualInstructor: headerInstructor,
      isSub: false
    }
  }

  return { isSub: false }
}

function hasSubMarker(name: string): boolean {
  const raw = name.toLowerCase()
  return raw.includes("(sub)") || /\*\s*$/.test(raw)
}

function normalizeInstructorName(name: string): string {
  const cleaned = name.replace(/\(sub\)/gi, "").replace(/\*/g, "").trim()
  if (!cleaned) return ""
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",")
    const last = parts[0]?.trim()
    const first = parts.slice(1).join(",").trim()
    return `${first} ${last}`.replace(/\s+/g, " ").trim()
  }
  return cleaned.replace(/\s+/g, " ").trim()
}

function parseScheduleTimes(scheduleText?: string, headerText?: string): { startTime?: string; endTime?: string } {
  const source = scheduleText || headerText || ""

  const range = source.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!range) return {}

  const start = normalizeTime(`${range[1]}:${range[2] || "00"} ${range[3] || ""}`)
  const end = normalizeTime(`${range[4]}:${range[5] || "00"} ${range[6] || range[3] || ""}`)

  return { startTime: start, endTime: end }
}

function normalizeTime(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase()
  const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (!match) return undefined
  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2] || "0", 10)
  const ampm = match[3]
  if (ampm) {
    if (ampm === "pm" && hour !== 12) hour += 12
    if (ampm === "am" && hour === 12) hour = 0
  }
  const hh = String(hour).padStart(2, "0")
  const mm = String(minute).padStart(2, "0")
  return `${hh}:${mm}:00`
}

function parseDateText(text: string, reportYear?: number): string | undefined {
  const full = text.match(DATE_RE)
  if (full) {
    const mm = full[1].padStart(2, "0")
    const dd = full[2].padStart(2, "0")
    return `${full[3]}-${mm}-${dd}`
  }

  const partial = text.match(DATE_MMDD_RE)
  if (partial && reportYear) {
    const mm = partial[1].padStart(2, "0")
    const dd = partial[2].padStart(2, "0")
    return `${reportYear}-${mm}-${dd}`
  }

  return undefined
}

function extractReportYear(html: string): number | undefined {
  const match = html.match(/\"startDate\"\s*:\s*\"(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return undefined
  return Number(match[1])
}

function dedupeClasses(classes: ParsedClass[]): ParsedClass[] {
  const seen = new Set<string>()
  const output: ParsedClass[] = []
  for (const c of classes) {
    const key = `${c.className}__${c.classDate || ""}__${c.startTime || ""}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(c)
  }
  return output
}
