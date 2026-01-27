-- Volunteers table for form submissions
CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firstName TEXT NOT NULL,
  middleName TEXT,
  lastName TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  egn TEXT NOT NULL,
  country TEXT,
  region TEXT,
  municipality TEXT,
  settlement TEXT,
  cityRegion TEXT,
  pollingStation TEXT,
  travelAbility TEXT NOT NULL,
  gdprConsent INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers(email);
CREATE INDEX IF NOT EXISTS idx_volunteers_createdAt ON volunteers(createdAt);
CREATE INDEX IF NOT EXISTS idx_volunteers_role ON volunteers(role);

-- Rate limits table for preventing spam/abuse
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  turnstile_token TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  window_start INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_window ON rate_limits(ip_address, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_token_window ON rate_limits(turnstile_token, window_start);

-- Cleanup old rate limit entries (older than 24 hours)
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
