export async function gmailListMessages(accessToken: string, query: string, maxResults = 25) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) })
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error('gmail_list_failed')
  return res.json() as Promise<{ messages?: { id: string; threadId: string }[] }>
}

export async function gmailGetMessage(accessToken: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error('gmail_get_failed')
  return res.json() as Promise<any>
}

export function getHeader(headers: any[], name: string) {
  const h = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

export function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    return decodeBase64(payload.body.data)
  }
  const parts = payload.parts || []
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64(part.body.data)
    }
  }
  for (const part of parts) {
    if (part.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ''
}

function decodeBase64(data: string) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  const buff = Buffer.from(normalized, 'base64')
  return buff.toString('utf8')
}
