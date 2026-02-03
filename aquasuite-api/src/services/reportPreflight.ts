import { detectReportMetadata, detectLocationCandidates } from '../parsers/detectReportMetadata.js'

export type LocationRow = {
  id: string
  name: string
  code: string
}

export type PreflightResult = {
  reportType: string
  detectedLocationName: string | null
  detectedLocationIds: string[]
  dateRanges: { start?: string; end?: string; raw?: string }[]
  warnings: string[]
}

function normalizeLocationName(input: string) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchLocations(candidates: string[], locations: LocationRow[]): string[] {
  const locMap = locations.map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    norm: normalizeLocationName(l.name),
    codeNorm: normalizeLocationName(l.code)
  }))

  const hits = new Set<string>()
  candidates.forEach((cand) => {
    const candNorm = normalizeLocationName(cand)
    locMap.forEach((loc) => {
      if (!candNorm) return
      if (loc.norm === candNorm || loc.norm.includes(candNorm) || candNorm.includes(loc.norm)) {
        hits.add(loc.id)
      } else if (loc.codeNorm && candNorm === loc.codeNorm) {
        hits.add(loc.id)
      }
    })
  })
  return Array.from(hits)
}

export function preflightReport(html: string, locations: LocationRow[]): PreflightResult {
  const base = detectReportMetadata(html)
  const candidates = detectLocationCandidates(html)
  const detectedIds = matchLocations(candidates, locations)

  return {
    reportType: base.reportType,
    detectedLocationName: base.detectedLocationName,
    detectedLocationIds: detectedIds,
    dateRanges: base.dateRanges,
    warnings: base.warnings
  }
}
