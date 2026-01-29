-- Kitsch Bot Database Schema

-- Store embed configurations
CREATE TABLE IF NOT EXISTS embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON string of embed configuration
  scheduled_time TEXT,   -- ISO timestamp for scheduled posts
  is_sent INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Store button configurations
CREATE TABLE IF NOT EXISTS buttons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embed_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  style TEXT NOT NULL,  -- PRIMARY, SECONDARY, SUCCESS, DANGER, LINK
  custom_id TEXT,       -- For non-link buttons
  url TEXT,             -- For link buttons
  row_index INTEGER DEFAULT 0,  -- Button row (0-4)
  position INTEGER DEFAULT 0,    -- Position within row (0-4)
  FOREIGN KEY (embed_id) REFERENCES embeds(id) ON DELETE CASCADE
);

-- Store scheduled jobs for persistence
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embed_id INTEGER NOT NULL,
  cron_expression TEXT,
  scheduled_time TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed, cancelled
  FOREIGN KEY (embed_id) REFERENCES embeds(id) ON DELETE CASCADE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_embeds_message_id ON embeds(message_id);
CREATE INDEX IF NOT EXISTS idx_embeds_guild_id ON embeds(guild_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);
