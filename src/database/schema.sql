-- Kitsch Bot Database Schema

-- Store embed configurations
CREATE TABLE IF NOT EXISTS embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  content TEXT,      -- Content outside the embed
  message_type TEXT DEFAULT 'embed', -- 'embed' or 'normal'
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
  recurrence TEXT,                -- JSON string e.g. ["MON", "WED"]
  target_channels TEXT,           -- JSON string e.g. ["123", "456"]
  name TEXT,                      -- Friendly name
  status TEXT DEFAULT 'pending',  -- pending, completed, cancelled
  FOREIGN KEY (embed_id) REFERENCES embeds(id) ON DELETE CASCADE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_embeds_message_id ON embeds(message_id);
CREATE INDEX IF NOT EXISTS idx_embeds_guild_id ON embeds(guild_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);

-- Store active sticky embeds per channel
CREATE TABLE IF NOT EXISTS sticky_embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embed_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  last_message_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (embed_id) REFERENCES embeds(id) ON DELETE CASCADE
);

-- Store FAQ entries
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Store embed templates
CREATE TABLE IF NOT EXISTS embed_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  content TEXT,          -- Content outside the embed
  message_type TEXT DEFAULT 'embed',
  config TEXT NOT NULL,  -- JSON string of embed configuration
  recurrence TEXT,       -- JSON string for default recurrence
  target_channels TEXT,  -- JSON string for default channels
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, name)
);

-- Store template buttons
CREATE TABLE IF NOT EXISTS template_buttons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  style TEXT NOT NULL,
  url TEXT,
  row_index INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES embed_templates(id) ON DELETE CASCADE
);

-- Store server pulse configurations (Real-time status updates)
CREATE TABLE IF NOT EXISTS server_pulses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  interval_minutes INTEGER DEFAULT 120,
  last_message_id TEXT,
  config TEXT, -- Optional styling overrides
  last_run TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Hub Configuration (One central message with navigation)
CREATE TABLE IF NOT EXISTS hubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  title TEXT DEFAULT 'Server Hub',
  description TEXT,
  image TEXT,
  color TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Pages within a Hub
CREATE TABLE IF NOT EXISTS hub_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id INTEGER NOT NULL,
  label TEXT NOT NULL,      -- Button Label (e.g. "Rules")
  emoji TEXT,               -- Button Emoji
  style TEXT DEFAULT 'SECONDARY', -- Button Style
  type TEXT DEFAULT 'page', -- 'page' (static content) or 'ticket' (action)
  content_embed TEXT,       -- JSON for the page content
  ticket_category_id TEXT,  -- If type='ticket', the category to open it in
  row_index INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
);

-- Active Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- open, closed
  type TEXT, -- 'support', 'report', etc.
  custom_id TEXT, -- User-defined ID (e.g. 'TICKET-123')
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Chat Logs
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  content TEXT,
  attachment_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
