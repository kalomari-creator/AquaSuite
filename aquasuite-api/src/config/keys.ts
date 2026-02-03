export type LocationKey = "CA" | "NV" | "NY" | "TX"

const LOCATION_KEYS: LocationKey[] = ["CA", "NV", "NY", "TX"]
const LOCATION_KEY_MAP: Record<string, LocationKey> = {
  CA: "CA",
  CALIFORNIA: "CA",
  NV: "NV",
  NEVADA: "NV",
  NY: "NY",
  NEWYORK: "NY",
  TX: "TX",
  TEXAS: "TX"
}

function envValue(name: string) {
  return String(process.env[name] || "").trim()
}

export function normalizeLocation(input: string) {
  const token = String(input || "").trim().toUpperCase().replace(/[^A-Z]/g, "")
  const key = LOCATION_KEY_MAP[token]
  if (!key) throw new Error(`Unknown location key: ${input}`)
  return key
}

export function getLocationUuid(key: LocationKey) {
  const envKey = `LOCATION_UUID_${key}`
  const value = envValue(envKey)
  if (!value) throw new Error(`Missing required env: ${envKey}`)
  return value
}

export function listLocationUuids() {
  return LOCATION_KEYS.map((key) => ({ key, uuid: getLocationUuid(key) }))
}

export function maskUuid(uuid: string) {
  const raw = String(uuid || "")
  return raw ? `${raw.slice(0, 8)}...` : ""
}

export function hasIntegration(name: "homebase" | "hubspot") {
  if (name === "homebase") return Boolean(envValue("HOMEBASE_API_KEY"))
  if (name === "hubspot") return Boolean(envValue("HUBSPOT_ACCESS_TOKEN"))
  return false
}

export function validateEnv() {
  const missing: string[] = []
  for (const key of LOCATION_KEYS) {
    const envKey = `LOCATION_UUID_${key}`
    if (!envValue(envKey)) missing.push(envKey)
  }
  const defaultKey = envValue("DEFAULT_LOCATION_KEY")
  if (defaultKey) {
    const normalized = normalizeLocation(defaultKey)
    if (!LOCATION_KEYS.includes(normalized)) {
      throw new Error("Invalid DEFAULT_LOCATION_KEY")
    }
  }
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`)
  }
}

export function getDefaultLocationKey() {
  const raw = envValue("DEFAULT_LOCATION_KEY")
  if (!raw) return null
  return normalizeLocation(raw)
}
