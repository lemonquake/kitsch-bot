const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
const dbPath = path.resolve(config.dbPath);

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Initialize the database
 */
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Initialize schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Save to file
    saveDatabase();

    console.log('✅ Database initialized');
    return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

/**
 * Get the database instance
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

// ============================================
// Embed CRUD Operations
// ============================================

/**
 * Create a new embed configuration
 */
function createEmbed({ channelId, guildId, config: embedConfig, scheduledTime, createdBy }) {
    const stmt = db.prepare(`
    INSERT INTO embeds (channel_id, guild_id, config, scheduled_time, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);

    stmt.run([channelId, guildId, JSON.stringify(embedConfig), scheduledTime || null, createdBy]);
    stmt.free();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const embedId = result[0].values[0][0];

    saveDatabase();
    return embedId;
}

/**
 * Update embed with message ID after posting
 */
function updateEmbedMessageId(embedId, messageId) {
    const stmt = db.prepare(`
    UPDATE embeds 
    SET message_id = ?, is_sent = 1, updated_at = datetime('now')
    WHERE id = ?
  `);
    stmt.run([messageId, embedId]);
    stmt.free();
    saveDatabase();
}

/**
 * Get embed by message ID
 */
function getEmbedByMessageId(messageId) {
    const stmt = db.prepare('SELECT * FROM embeds WHERE message_id = ?');
    stmt.bind([messageId]);

    let result = null;
    if (stmt.step()) {
        const row = stmt.getAsObject();
        row.config = JSON.parse(row.config);
        result = row;
    }
    stmt.free();
    return result;
}

/**
 * Get embed by ID
 */
function getEmbedById(embedId) {
    const stmt = db.prepare('SELECT * FROM embeds WHERE id = ?');
    stmt.bind([embedId]);

    let result = null;
    if (stmt.step()) {
        const row = stmt.getAsObject();
        row.config = JSON.parse(row.config);
        result = row;
    }
    stmt.free();
    return result;
}

/**
 * Update embed configuration
 */
function updateEmbedConfig(embedId, embedConfig) {
    const stmt = db.prepare(`
    UPDATE embeds 
    SET config = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
    stmt.run([JSON.stringify(embedConfig), embedId]);
    stmt.free();
    saveDatabase();
}

/**
 * Get all embeds for a guild
 */
function getGuildEmbeds(guildId, limit = 25) {
    const results = [];
    const stmt = db.prepare(`
    SELECT * FROM embeds 
    WHERE guild_id = ? AND is_sent = 1
    ORDER BY created_at DESC
    LIMIT ?
  `);
    stmt.bind([guildId, limit]);

    while (stmt.step()) {
        const row = stmt.getAsObject();
        row.config = JSON.parse(row.config);
        results.push(row);
    }
    stmt.free();
    return results;
}

/**
 * Delete embed by ID
 */
function deleteEmbed(embedId) {
    const stmt = db.prepare('DELETE FROM embeds WHERE id = ?');
    stmt.run([embedId]);
    stmt.free();
    saveDatabase();
}

// ============================================
// Button CRUD Operations
// ============================================

/**
 * Create buttons for an embed
 */
function createButtons(embedId, buttons) {
    const stmt = db.prepare(`
    INSERT INTO buttons (embed_id, label, style, custom_id, url, row_index, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    for (const btn of buttons) {
        stmt.run([
            embedId,
            btn.label,
            btn.style,
            btn.customId || null,
            btn.url || null,
            btn.rowIndex || 0,
            btn.position || 0
        ]);
    }
    stmt.free();
    saveDatabase();
}

/**
 * Get buttons for an embed
 */
function getEmbedButtons(embedId) {
    const results = [];
    const stmt = db.prepare(`
    SELECT * FROM buttons 
    WHERE embed_id = ?
    ORDER BY row_index, position
  `);
    stmt.bind([embedId]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Delete all buttons for an embed
 */
function deleteEmbedButtons(embedId) {
    const stmt = db.prepare('DELETE FROM buttons WHERE embed_id = ?');
    stmt.run([embedId]);
    stmt.free();
    saveDatabase();
}

// ============================================
// Scheduled Jobs Operations
// ============================================

/**
 * Create a scheduled job
 */
function createScheduledJob(embedId, scheduledTime) {
    const stmt = db.prepare(`
    INSERT INTO scheduled_jobs (embed_id, scheduled_time)
    VALUES (?, ?)
  `);
    stmt.run([embedId, scheduledTime]);
    stmt.free();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const jobId = result[0].values[0][0];

    saveDatabase();
    return jobId;
}

/**
 * Get pending scheduled jobs
 */
function getPendingJobs() {
    const results = [];
    const stmt = db.prepare(`
    SELECT sj.*, e.channel_id, e.guild_id, e.config
    FROM scheduled_jobs sj
    JOIN embeds e ON sj.embed_id = e.id
    WHERE sj.status = 'pending'
    ORDER BY sj.scheduled_time ASC
  `);

    while (stmt.step()) {
        const row = stmt.getAsObject();
        row.config = JSON.parse(row.config);
        results.push(row);
    }
    stmt.free();
    return results;
}

/**
 * Update job status
 */
function updateJobStatus(jobId, status) {
    const stmt = db.prepare(`
    UPDATE scheduled_jobs 
    SET status = ?
    WHERE id = ?
  `);
    stmt.run([status, jobId]);
    stmt.free();
    saveDatabase();
}

/**
 * Cancel scheduled job
 */
function cancelScheduledJob(embedId) {
    const stmt = db.prepare(`
    UPDATE scheduled_jobs 
    SET status = 'cancelled'
    WHERE embed_id = ? AND status = 'pending'
  `);
    stmt.run([embedId]);
    stmt.free();
    saveDatabase();
}

module.exports = {
    initDatabase,
    getDb,
    saveDatabase,
    // Embed operations
    createEmbed,
    updateEmbedMessageId,
    getEmbedByMessageId,
    getEmbedById,
    updateEmbedConfig,
    getGuildEmbeds,
    deleteEmbed,
    // Button operations
    createButtons,
    getEmbedButtons,
    deleteEmbedButtons,
    // Scheduled job operations
    createScheduledJob,
    getPendingJobs,
    updateJobStatus,
    cancelScheduledJob,
};
