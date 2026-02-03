import crypto from 'crypto'
import { TOTP, generateSecret, generateURI } from 'otplib'
import * as QRCode from 'qrcode'
import pg from 'pg'

const TOTP_ISSUER = 'AquaSuite'
const ENCRYPTION_ALGORITHM = 'aes-256-cbc'
const BACKUP_CODE_COUNT = 10
const RATE_LIMIT_ATTEMPTS = 5
const RATE_LIMIT_LOCKOUT_MINUTES = 15
const TOKEN_REPLAY_WINDOW_SECONDS = 60

// Create TOTP instance with 30-second window and 2 step drift tolerance (±60 seconds)
// This accounts for device clock drift that commonly occurs on mobile devices
const totpInstance = new TOTP({
  step: 30,
  window: 2  // Allow ±2 steps (±60 seconds) for clock drift tolerance
})

export interface TotpService {
  pool: pg.Pool
  encryptionKey: string
}

function getEncryptionKey(keyHex: string): Buffer {
  if (keyHex.length === 64) {
    return Buffer.from(keyHex, 'hex')
  }
  return crypto.createHash('sha256').update(keyHex).digest()
}

function encrypt(text: string, keyHex: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey(keyHex)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return { encrypted, iv: iv.toString('hex') }
}

function decrypt(encrypted: string, iv: string, keyHex: string): string {
  const key = getEncryptionKey(keyHex)
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(iv, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateBackupCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

export async function generateTotpSecret(
  svc: TotpService,
  userId: string,
  userEmail: string
): Promise<{ secret: string; qrCodeDataUrl: string; manualKey: string }> {
  const { pool, encryptionKey } = svc

  const secret = generateSecret()
  const { encrypted, iv } = encrypt(secret, encryptionKey)

  await pool.query(
    'DELETE FROM user_totp WHERE user_id = $1 AND is_enabled = false',
    [userId]
  )

  await pool.query(
    `INSERT INTO user_totp (user_id, secret_encrypted, secret_iv, is_enabled)
     VALUES ($1, $2, $3, false)
     ON CONFLICT (user_id) DO UPDATE SET
       secret_encrypted = EXCLUDED.secret_encrypted,
       secret_iv = EXCLUDED.secret_iv,
       is_enabled = false,
       verified_at = NULL,
       updated_at = now()`,
    [userId, encrypted, iv]
  )

  const otpauth = generateURI({
    issuer: TOTP_ISSUER,
    label: userEmail,
    secret: secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  })
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth)
  const manualKey = secret.match(/.{1,4}/g)?.join(' ') || secret

  return { secret, qrCodeDataUrl, manualKey }
}

export async function verifyAndEnableTotp(
  svc: TotpService,
  userId: string,
  token: string
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
  const { pool, encryptionKey } = svc

  const rateLimited = await isRateLimited(pool, userId)
  if (rateLimited) {
    return { success: false, error: 'rate_limited' }
  }

  const totpRes = await pool.query(
    'SELECT secret_encrypted, secret_iv, is_enabled FROM user_totp WHERE user_id = $1',
    [userId]
  )

  if (totpRes.rowCount === 0) {
    return { success: false, error: 'no_totp_pending' }
  }

  const totpRow = totpRes.rows[0]
  if (totpRow.is_enabled) {
    return { success: false, error: 'already_enabled' }
  }

  const secret = decrypt(totpRow.secret_encrypted, totpRow.secret_iv, encryptionKey)
  const isValid = totpInstance.verify({ token, secret })

  if (!isValid) {
    await recordFailedAttempt(pool, userId)
    await auditLog(pool, userId, 'totp_verify_failed', null, null, { reason: 'invalid_token' })
    return { success: false, error: 'invalid_token' }
  }

  await pool.query(
    'UPDATE user_totp SET is_enabled = true, verified_at = now(), updated_at = now() WHERE user_id = $1',
    [userId]
  )

  const backupCodes: string[] = []
  await pool.query('DELETE FROM user_backup_codes WHERE user_id = $1', [userId])

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCode()
    backupCodes.push(code)
    await pool.query(
      'INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)',
      [userId, hashCode(code)]
    )
  }

  await clearRateLimit(pool, userId)
  await auditLog(pool, userId, 'totp_enabled', null, null, {})

  return { success: true, backupCodes }
}

export async function verifyTotp(
  svc: TotpService,
  userId: string,
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  const { pool, encryptionKey } = svc

  const rateLimited = await isRateLimited(pool, userId)
  if (rateLimited) {
    await auditLog(pool, userId, 'totp_verify_rate_limited', ipAddress, userAgent, {})
    return { success: false, error: 'rate_limited' }
  }

  const totpRes = await pool.query(
    'SELECT secret_encrypted, secret_iv, is_enabled FROM user_totp WHERE user_id = $1',
    [userId]
  )

  if (totpRes.rowCount === 0 || !totpRes.rows[0].is_enabled) {
    return { success: false, error: 'totp_not_enabled' }
  }

  const totpRow = totpRes.rows[0]
  const secret = decrypt(totpRow.secret_encrypted, totpRow.secret_iv, encryptionKey)

  const tokenHash = hashCode(token)
  const replayCheck = await pool.query(
    `SELECT 1 FROM totp_used_tokens
     WHERE user_id = $1 AND token_hash = $2
       AND used_at > now() - interval '60 seconds'`,
    [userId, tokenHash]
  )

  if (replayCheck.rowCount && replayCheck.rowCount > 0) {
    await auditLog(pool, userId, 'totp_replay_attempt', ipAddress, userAgent, {})
    return { success: false, error: 'token_already_used' }
  }

  const isValid = totpInstance.verify({ token, secret })

  if (!isValid) {
    await recordFailedAttempt(pool, userId)
    await auditLog(pool, userId, 'totp_verify_failed', ipAddress, userAgent, { reason: 'invalid_token' })
    return { success: false, error: 'invalid_token' }
  }

  await pool.query(
    'INSERT INTO totp_used_tokens (user_id, token_hash) VALUES ($1, $2)',
    [userId, tokenHash]
  )

  await pool.query(
    "DELETE FROM totp_used_tokens WHERE used_at < now() - interval '2 minutes'"
  )

  await clearRateLimit(pool, userId)
  await auditLog(pool, userId, 'totp_verify_success', ipAddress, userAgent, {})

  return { success: true }
}

export async function verifyBackupCode(
  svc: TotpService,
  userId: string,
  code: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  const { pool } = svc

  const rateLimited = await isRateLimited(pool, userId)
  if (rateLimited) {
    return { success: false, error: 'rate_limited' }
  }

  const codeHash = hashCode(code.replace(/\s/g, '').toUpperCase())

  const codeRes = await pool.query(
    'SELECT id FROM user_backup_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL',
    [userId, codeHash]
  )

  if (codeRes.rowCount === 0) {
    await recordFailedAttempt(pool, userId)
    await auditLog(pool, userId, 'backup_code_failed', ipAddress, userAgent, {})
    return { success: false, error: 'invalid_backup_code' }
  }

  await pool.query(
    'UPDATE user_backup_codes SET used_at = now() WHERE id = $1',
    [codeRes.rows[0].id]
  )

  await clearRateLimit(pool, userId)
  await auditLog(pool, userId, 'backup_code_used', ipAddress, userAgent, {})

  return { success: true }
}

export async function disableTotp(
  svc: TotpService,
  userId: string,
  adminId?: string
): Promise<{ success: boolean }> {
  const { pool } = svc

  await pool.query('DELETE FROM user_totp WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM user_backup_codes WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM totp_used_tokens WHERE user_id = $1', [userId])

  const eventType = adminId && adminId !== userId ? 'totp_reset_by_admin' : 'totp_disabled'
  await auditLog(pool, userId, eventType, null, null, { adminId })

  return { success: true }
}

export async function getTotpStatus(
  pool: pg.Pool,
  userId: string
): Promise<{ enabled: boolean; hasBackupCodes: boolean; backupCodesRemaining: number }> {
  const totpRes = await pool.query(
    'SELECT is_enabled FROM user_totp WHERE user_id = $1',
    [userId]
  )

  const backupRes = await pool.query(
    'SELECT COUNT(*) as count FROM user_backup_codes WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  )

  return {
    enabled: totpRes.rowCount ? totpRes.rows[0].is_enabled === true : false,
    hasBackupCodes: Number(backupRes.rows[0].count) > 0,
    backupCodesRemaining: Number(backupRes.rows[0].count)
  }
}

export async function regenerateBackupCodes(
  svc: TotpService,
  userId: string
): Promise<{ success: boolean; backupCodes?: string[] }> {
  const { pool } = svc

  const totpRes = await pool.query(
    'SELECT is_enabled FROM user_totp WHERE user_id = $1',
    [userId]
  )

  if (totpRes.rowCount === 0 || !totpRes.rows[0].is_enabled) {
    return { success: false }
  }

  const backupCodes: string[] = []
  await pool.query('DELETE FROM user_backup_codes WHERE user_id = $1', [userId])

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCode()
    backupCodes.push(code)
    await pool.query(
      'INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)',
      [userId, hashCode(code)]
    )
  }

  await auditLog(pool, userId, 'backup_codes_regenerated', null, null, {})

  return { success: true, backupCodes }
}

async function isRateLimited(pool: pg.Pool, userId: string): Promise<boolean> {
  const res = await pool.query(
    'SELECT locked_until, attempts FROM auth_rate_limits WHERE identifier = $1',
    [userId]
  )

  if (res.rowCount === 0) return false

  const { locked_until } = res.rows[0]
  if (locked_until && new Date(locked_until) > new Date()) {
    return true
  }

  if (locked_until && new Date(locked_until) <= new Date()) {
    await pool.query('DELETE FROM auth_rate_limits WHERE identifier = $1', [userId])
    return false
  }

  return false
}

async function recordFailedAttempt(pool: pg.Pool, userId: string): Promise<void> {
  const res = await pool.query(
    `INSERT INTO auth_rate_limits (identifier, attempts, last_attempt_at)
     VALUES ($1, 1, now())
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = auth_rate_limits.attempts + 1,
       last_attempt_at = now()
     RETURNING attempts`,
    [userId]
  )

  const attempts = res.rows[0].attempts
  if (attempts >= RATE_LIMIT_ATTEMPTS) {
    await pool.query(
      "UPDATE auth_rate_limits SET locked_until = now() + interval '15 minutes' WHERE identifier = $1",
      [userId]
    )
  }
}

async function clearRateLimit(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query('DELETE FROM auth_rate_limits WHERE identifier = $1', [userId])
}

export async function auditLog(
  pool: pg.Pool,
  userId: string | null,
  eventType: string,
  ipAddress?: string | null,
  userAgent?: string | null,
  details?: object
): Promise<void> {
  await pool.query(
    'INSERT INTO auth_audit_log (user_id, event_type, ip_address, user_agent, details) VALUES ($1, $2, $3, $4, $5)',
    [userId, eventType, ipAddress || null, userAgent || null, details ? JSON.stringify(details) : null]
  )
}

export async function isFeatureEnabled(pool: pg.Pool, key: string): Promise<boolean> {
  const res = await pool.query(
    'SELECT enabled FROM feature_flags WHERE key = $1',
    [key]
  )
  return res.rowCount ? res.rows[0].enabled === true : false
}
