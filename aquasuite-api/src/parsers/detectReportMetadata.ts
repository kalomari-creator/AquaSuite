import * as cheerio from "cheerio"
import { parseUsDate } from "../utils/reportParsing.js"

export type ReportMetadata = {
  reportType: string
  detectedLocationName: string | null
  detectedLocationIds: string[]
  dateRanges: { start?: string; end?: string; raw?: string }[]
  warnings: string[]
}

const REPORT_TYPES: { key: string; patterns: RegExp[] }[] = [
  { key: "instructor_retention", patterns: [/Instructor Retention/i] },
  { key: "aged_accounts", patterns: [/Aged Accounts/i] },
  { key: "drop_list", patterns: [/Drop List/i] },
  { key: "new_enrollments", patterns: [/New Enrollments/i, /New Enrollment/i, /Enrollment List/i] },
  { key: "acne", patterns: [/ACNE/i, /Accounts Created Not Enrolled/i, /Phonebook Report/i, /Family Phonebook/i] },
  { key: "roll_sheets", patterns: [/Roll Sheets/i, /Rollsheet/i, /Roster History/i] },
  { key: "roster", patterns: [/Roster/i] }
]

function normalizeText(input: string) {
  return String(input || "").replace(/\s+/g, " ").trim()
}

function detectReportType(html: string): string {
  for (const t of REPORT_TYPES) {
    if (t.patterns.some((p) => p.test(html))) return t.key
  }
  return "unknown"
}

function detectLocationFromLabel($: cheerio.CheerioAPI): string | null {
  const label = $("th:contains('Location')").first()
  if (label.length) {
    const value = label.next().text()
    const norm = normalizeText(value)
    if (norm) return norm
  }
  const text = normalizeText($("body").text())
  const match = text.match(/Location:\s*([^|\n\r]+)/i)
  return match ? normalizeText(match[1]) : null
}

function parseLocationsFromScripts(html: string): string[] {
  const matches: string[] = []
  const arrayMatch = html.match(/locations\s*:\s*\[(.*?)\]/is)
  if (arrayMatch) {
    const raw = arrayMatch[1]
    raw.split(",").forEach((chunk) => {
      const name = chunk.replace(/[\[\]\"']/g, "").trim()
      if (name) matches.push(name)
    })
  }
  const assignMatch = html.match(/filters\.locations\s*=\s*\[(.*?)\]/is)
  if (assignMatch) {
    const raw = assignMatch[1]
    raw.split(",").forEach((chunk) => {
      const name = chunk.replace(/[\[\]\"']/g, "").trim()
      if (name) matches.push(name)
    })
  }
  return Array.from(new Set(matches.map((m) => normalizeText(m)).filter(Boolean)))
}

function findDateRanges(text: string): { start?: string; end?: string; raw?: string }[] {
  const dates = Array.from(text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)).map((m) => m[0])
  const ranges: { start?: string; end?: string; raw?: string }[] = []
  if (dates.length >= 2) {
    ranges.push({ start: dates[0], end: dates[1], raw: `${dates[0]} - ${dates[1]}` })
  } else if (dates.length === 1) {
    ranges.push({ start: dates[0], raw: dates[0] })
  }
  return ranges
}

export function detectReportMetadata(html: string): Omit<ReportMetadata, "detectedLocationIds"> {
  const reportType = detectReportType(html)
  const $ = cheerio.load(html)
  const detectedLocationName = detectLocationFromLabel($)
  const locationCandidates = parseLocationsFromScripts(html)
  const warnings: string[] = []

  if (!detectedLocationName && !locationCandidates.length) {
    warnings.push("location_not_detected")
  }

  const headerText = normalizeText($("body").text())
  const dateRanges = findDateRanges(headerText).map((range) => {
    const startIso = parseUsDate(range.start || range.raw || null)
    const endIso = parseUsDate(range.end || null)
    if (startIso && endIso && endIso < startIso) {
      return { ...range, start: range.end, end: range.start }
    }
    return range
  })
  if (!dateRanges.length) warnings.push("date_range_not_detected")

  return {
    reportType,
    detectedLocationName: detectedLocationName || (locationCandidates[0] || null),
    dateRanges,
    warnings
  }
}

export function detectLocationCandidates(html: string): string[] {
  const $ = cheerio.load(html)
  const detected = detectLocationFromLabel($)
  const scriptLocations = parseLocationsFromScripts(html)
  const out = [] as string[]
  if (detected) out.push(detected)
  out.push(...scriptLocations)
  return Array.from(new Set(out.map((d) => normalizeText(d)).filter(Boolean)))
}
