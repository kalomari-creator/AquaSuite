import crypto from "crypto"

export function getGmailAuthUrl() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const redirectUri = process.env.GMAIL_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('gmail_oauth_not_configured')

  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly'
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  })

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state }
}

export async function exchangeGmailCode(code: string) {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const redirectUri = process.env.GMAIL_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('gmail_oauth_not_configured')

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!res.ok) throw new Error('gmail_token_exchange_failed')
  return res.json() as Promise<any>
}

export async function refreshGmailToken(refreshToken: string) {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('gmail_oauth_not_configured')

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!res.ok) throw new Error('gmail_token_refresh_failed')
  return res.json() as Promise<any>
}
