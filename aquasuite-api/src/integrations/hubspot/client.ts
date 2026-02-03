const HUBSPOT_BASE = 'https://api.hubapi.com'

function getToken() {
  return String(process.env.HUBSPOT_ACCESS_TOKEN || '').trim()
}

function configured() {
  return Boolean(getToken())
}

function headers() {
  const token = getToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  })
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
    const err = typeof data === 'string' ? data : JSON.stringify(data || {})
    throw new Error(`hubspot_error:${res.status}:${err}`)
  }
  return data
}

async function searchContactBy(property: 'email' | 'phone', value: string) {
  if (!value) return null
  const data = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: property, operator: 'EQ', value }] }
      ],
      properties: ['email', 'phone']
    })
  })
  const results = Array.isArray(data?.results) ? data.results : []
  return results[0] || null
}

export async function fetchHubspotContacts(limit = 100) {
  if (!configured()) return { results: [] }
  return hubspotFetch(`/crm/v3/objects/contacts?limit=${limit}&properties=email,phone,firstname,lastname`)
}

export async function searchHubspotContactByEmail(email: string) {
  if (!configured()) return null
  return searchContactBy('email', email)
}

export function hubspotConfigured() {
  return configured()
}
