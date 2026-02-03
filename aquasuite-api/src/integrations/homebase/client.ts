const HOMEBASE_BASE = (process.env.HOMEBASE_API_BASE || "https://api.joinhomebase.com").replace(/\/$/, "")
const HOMEBASE_ACCEPT = "application/vnd.homebase-v1+json"

function getKey() {
  return String(process.env.HOMEBASE_API_KEY || "").trim()
}

function headers() {
  const key = getKey()
  return {
    Authorization: `Bearer ${key}`,
    Accept: HOMEBASE_ACCEPT
  }
}

function buildUrl(pathOrUrl: string, params?: Record<string, string | number | undefined>) {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${HOMEBASE_BASE}/${pathOrUrl.replace(/^\//, "")}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function normalizeNextUrl(nextUrl: string) {
  try {
    const base = new URL(HOMEBASE_BASE)
    const parsed = new URL(nextUrl)
    if (parsed.pathname.startsWith("/api/public/")) {
      parsed.pathname = parsed.pathname.replace("/api/public", "")
    }
    if (parsed.host === base.host) return parsed.toString()
    return new URL(parsed.pathname + parsed.search, HOMEBASE_BASE).toString()
  } catch {
    return nextUrl
  }
}

function parseNextLink(linkHeader: string | null) {
  if (!linkHeader) return null
  const parts = linkHeader.split(",")
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match?.[1]) return normalizeNextUrl(match[1])
  }
  return null
}

function extractArray(payload: any, keys: string[]) {
  if (Array.isArray(payload)) return payload
  if (!payload) return []
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  return []
}

async function request(pathOrUrl: string, params?: Record<string, string | number | undefined>) {
  const res = await fetch(buildUrl(pathOrUrl, params), { headers: headers() })
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const err = typeof data === "string" ? data : JSON.stringify(data || {})
    const error = new Error(`homebase_error:${res.status}:${err}`)
    ;(error as any).status = res.status
    throw error
  }
  return { data, link: res.headers.get("link") }
}

async function fetchAll(path: string, params: Record<string, string | number | undefined>, keys: string[]) {
  let nextUrl: string | null = null
  const results: any[] = []
  for (let i = 0; i < 50; i += 1) {
    const { data, link } = await request(nextUrl || path, nextUrl ? undefined : params)
    const items = extractArray(data, keys)
    if (items.length) results.push(...items)
    const next = parseNextLink(link)
    if (next) {
      nextUrl = next
      continue
    }
    break
  }
  return { results }
}

export async function fetchHomebaseLocations() {
  return fetchAll("locations", { per_page: 100 }, ["locations", "results"])
}

export async function fetchHomebaseEmployees(locationId: string) {
  return fetchAll(`locations/${locationId}/employees`, { per_page: 100 }, ["employees", "results"])
}

export async function fetchHomebaseShifts(locationId: string, startDate: string, endDate: string) {
  return fetchAll(
    `locations/${locationId}/shifts`,
    { start_date: startDate, end_date: endDate, per_page: 100 },
    ["shifts", "results"]
  )
}
