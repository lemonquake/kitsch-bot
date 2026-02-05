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

    // Run migrations
    migrateDatabase();

    // Save to file
    saveDatabase();

    console.log('✅ Database initialized');
    return db;
}

/**
 * Migrate database to latest schema
 */
function migrateDatabase() {
    try {
        // Check for new columns in scheduled_jobs
        const tableInfo = db.exec("PRAGMA table_info(scheduled_jobs)")[0].values;
        const columns = tableInfo.map(c => c[1]);

        if (!columns.includes('recurrence')) {
            console.log('Migrating: Adding recurrence column to scheduled_jobs');
            db.run("ALTER TABLE scheduled_jobs ADD COLUMN recurrence TEXT");
        }
        if (!columns.includes('target_channels')) {
            console.log('Migrating: Adding target_channels column to scheduled_jobs');
            db.run("ALTER TABLE scheduled_jobs ADD COLUMN target_channels TEXT");
        }
        if (!columns.includes('name')) {
            console.log('Migrating: Adding name column to scheduled_jobs');
            db.run("ALTER TABLE scheduled_jobs ADD COLUMN name TEXT");
        }

    } catch (error) {
        console.error('Error migrating database:', error);
    }
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
function createScheduledJob(embedId, scheduledTime, recurrence = null, targetChannels = null, name = null) {
    const stmt = db.prepare(`
    INSERT INTO scheduled_jobs (embed_id, scheduled_time, recurrence, target_channels, name)
    VALUES (?, ?, ?, ?, ?)
  `);
    stmt.run([
        embedId,
        scheduledTime,
        recurrence ? JSON.stringify(recurrence) : null,
        targetChannels ? JSON.stringify(targetChannels) : null,
        name
    ]);
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
        if (row.recurrence) row.recurrence = JSON.parse(row.recurrence);
        if (row.target_channels) row.target_channels = JSON.parse(row.target_channels);
        results.push(row);
    }
    stmt.free();
    return results;
}

/**
 * Update scheduled job details
 */
function updateScheduledJob(jobId, scheduledTime, recurrence, targetChannels, name) {
    const stmt = db.prepare(`
    UPDATE scheduled_jobs 
    SET scheduled_time = ?, recurrence = ?, target_channels = ?, name = ?
    WHERE id = ?
  `);
    stmt.run([
        scheduledTime,
        recurrence ? JSON.stringify(recurrence) : null,
        targetChannels ? JSON.stringify(targetChannels) : null,
        name,
        jobId
    ]);
    stmt.free();
    saveDatabase();
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

// ============================================
// Template CRUD Operations
// ============================================

/**
 * Create a new embed template
 */
function createTemplate(guildId, name, category, config, createdBy) {
    const stmt = db.prepare(`
        INSERT INTO embed_templates (guild_id, name, category, config, created_by)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([guildId, name, category, JSON.stringify(config), createdBy]);
    stmt.free();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const templateId = result[0].values[0][0];

    saveDatabase();
    return templateId;
}

/**
 * Create buttons for a template
 */
function createTemplateButtons(templateId, buttons) {
    const stmt = db.prepare(`
        INSERT INTO template_buttons (template_id, label, style, url, row_index, position)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const btn of buttons) {
        stmt.run([
            templateId,
            btn.label,
            btn.style,
            btn.url || null,
            btn.rowIndex || 0,
            btn.position || 0
        ]);
    }
    stmt.free();
    saveDatabase();
}

/**
 * Get all templates for a guild
 */
function getTemplates(guildId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM embed_templates WHERE guild_id = ? ORDER BY category, name');
    stmt.bind([guildId]);

    while (stmt.step()) {
        const row = stmt.getAsObject();
        row.config = JSON.parse(row.config);
        results.push(row);
    }
    stmt.free();
    return results;
}

/**
 * Get template by name and guild
 */
function getTemplateByName(guildId, name) {
    const stmt = db.prepare('SELECT * FROM embed_templates WHERE guild_id = ? AND lower(name) = lower(?)');
    stmt.bind([guildId, name]);

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
 * Get template by ID
 */
function getTemplateById(id) {
    const stmt = db.prepare('SELECT * FROM embed_templates WHERE id = ?');
    stmt.bind([id]);

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
 * Get buttons for a template
 */
function getTemplateButtons(templateId) {
    const results = [];
    const stmt = db.prepare(`
        SELECT * FROM template_buttons 
        WHERE template_id = ?
        ORDER BY row_index, position
    `);
    stmt.bind([templateId]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Delete a template
 */
function deleteTemplate(id) {
    const stmt = db.prepare('DELETE FROM embed_templates WHERE id = ?');
    stmt.run([id]);
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
    updateScheduledJob, // Add this
    cancelScheduledJob,
    // Sticky embed operations
    createStickyEmbed,
    getStickyEmbedByChannel,
    updateStickyMessageId,
    removeStickyEmbed,
    getAllStickyEmbeds,
    // FAQ operations
    addFAQ,
    getFAQs,
    getFAQById,
    deleteFAQ,
    getCategories,
    getFAQsByCategory,
    // Template operations
    createTemplate,
    createTemplateButtons,
    getTemplates,
    getTemplateByName,
    getTemplateById,
    getTemplateButtons,
    deleteTemplate,
};

/**
 * Add a new FAQ entry
 */
function addFAQ(guildId, category, question, answer) {
    const stmt = db.prepare(`
        INSERT INTO faqs (guild_id, category, question, answer)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run([guildId, category, question, answer]);
    stmt.free();
    saveDatabase();
}

/**
 * Get all FAQs for a guild
 */
function getFAQs(guildId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM faqs WHERE guild_id = ? ORDER BY category, question');
    stmt.bind([guildId]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get a specific FAQ by ID
 */
function getFAQById(id) {
    const stmt = db.prepare('SELECT * FROM faqs WHERE id = ?');
    stmt.bind([id]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

/**
 * Delete an FAQ by ID
 */
function deleteFAQ(id) {
    const stmt = db.prepare('DELETE FROM faqs WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
}

/**
 * Get unique categories for a guild
 */
function getCategories(guildId) {
    const results = [];
    const stmt = db.prepare('SELECT DISTINCT category FROM faqs WHERE guild_id = ? ORDER BY category');
    stmt.bind([guildId]);

    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row.category);
    }
    stmt.free();
    return results;
}

/**
 * Get FAQs by category
 */
function getFAQsByCategory(guildId, category) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM faqs WHERE guild_id = ? AND category = ? ORDER BY question');
    stmt.bind([guildId, category]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Create or update a sticky embed for a channel
 */
function createStickyEmbed(embedId, channelId, guildId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO sticky_embeds (embed_id, channel_id, guild_id)
        VALUES (?, ?, ?)
    `);
    stmt.run([embedId, channelId, guildId]);
    stmt.free();
    saveDatabase();
}

/**
 * Get sticky embed info for a channel
 */
function getStickyEmbedByChannel(channelId) {
    const stmt = db.prepare(`
        SELECT se.*, e.config
        FROM sticky_embeds se
        JOIN embeds e ON se.embed_id = e.id
        WHERE se.channel_id = ?
    `);
    stmt.bind([channelId]);

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
 * Update the last message ID for a sticky embed
 */
function updateStickyMessageId(channelId, messageId) {
    const stmt = db.prepare(`
        UPDATE sticky_embeds 
        SET last_message_id = ?
        WHERE channel_id = ?
    `);
    stmt.run([messageId, channelId]);
    stmt.free();
    saveDatabase();
}

/**
 * Remove sticky embed from a channel
 */
function removeStickyEmbed(channelId) {
    const stmt = db.prepare('DELETE FROM sticky_embeds WHERE channel_id = ?');
    stmt.run([channelId]);
    stmt.free();
    saveDatabase();
}

/**
 * Get all active sticky embeds across all servers
 */
function getAllStickyEmbeds() {
    const results = [];
    const stmt = db.prepare('SELECT * FROM sticky_embeds');

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}
