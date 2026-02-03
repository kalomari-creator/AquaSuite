-- migrate:up

-- TOTP secrets (encrypted at rest)
CREATE TABLE user_totp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,
    secret_iv TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Backup codes (hashed, one-time use)
CREATE TABLE user_backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_backup_codes_user ON user_backup_codes(user_id);

-- Auth audit log
CREATE TABLE auth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_log(user_id);
CREATE INDEX idx_auth_audit_event ON auth_audit_log(event_type);
CREATE INDEX idx_auth_audit_created ON auth_audit_log(created_at DESC);

-- Rate limiting for auth failures
CREATE TABLE auth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    attempts INTEGER DEFAULT 1,
    locked_until TIMESTAMPTZ,
    first_attempt_at TIMESTAMPTZ DEFAULT now(),
    last_attempt_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(identifier)
);

-- TOTP replay prevention (store used tokens)
CREATE TABLE totp_used_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_totp_used_user ON totp_used_tokens(user_id);
CREATE INDEX idx_totp_used_at ON totp_used_tokens(used_at);

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default feature flags
INSERT INTO feature_flags (key, enabled, description) VALUES
    ('require_2fa', false, 'Require 2FA for all users'),
    ('totp_enabled', true, 'Enable TOTP enrollment option')
ON CONFLICT (key) DO NOTHING;

-- migrate:down

DROP TABLE IF EXISTS totp_used_tokens;
DROP TABLE IF EXISTS auth_rate_limits;
DROP TABLE IF EXISTS auth_audit_log;
DROP TABLE IF EXISTS user_backup_codes;
DROP TABLE IF EXISTS user_totp;
DROP TABLE IF EXISTS feature_flags;
