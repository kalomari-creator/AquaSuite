export type LocationFeatures = {
  roster_enabled: boolean
  announcer_enabled: boolean
  reports_enabled: boolean
  observations_enabled: boolean
}

export function normalizeLocationFeatures(location: {
  features?: Record<string, unknown> | null
  announcer_enabled?: boolean | null
}): LocationFeatures {
  const base: LocationFeatures = {
    roster_enabled: true,
    announcer_enabled: false,
    reports_enabled: false,
    observations_enabled: false
  }

  const merged = { ...base, ...(location?.features || {}) } as LocationFeatures
  if (location?.announcer_enabled) merged.announcer_enabled = true
  return merged
}
