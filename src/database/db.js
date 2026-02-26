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

        // Check for new columns in embeds
        const embedsInfo = db.exec("PRAGMA table_info(embeds)")[0].values;
        const embedsColumns = embedsInfo.map(c => c[1]);

        if (!embedsColumns.includes('content')) {
            console.log('Migrating: Adding content column to embeds');
            db.run("ALTER TABLE embeds ADD COLUMN content TEXT");
        }
        if (!embedsColumns.includes('message_type')) {
            console.log('Migrating: Adding message_type column to embeds');
            db.run("ALTER TABLE embeds ADD COLUMN message_type TEXT DEFAULT 'embed'");
        }

        // Check for new columns in embed_templates
        const templatesInfo = db.exec("PRAGMA table_info(embed_templates)")[0].values;
        const templatesColumns = templatesInfo.map(c => c[1]);

        if (!templatesColumns.includes('content')) {
            console.log('Migrating: Adding content column to embed_templates');
            db.run("ALTER TABLE embed_templates ADD COLUMN content TEXT");
        }
        if (!templatesColumns.includes('message_type')) {
            console.log('Migrating: Adding message_type column to embed_templates');
            db.run("ALTER TABLE embed_templates ADD COLUMN message_type TEXT DEFAULT 'embed'");
        }
        if (!templatesColumns.includes('recurrence')) {
            console.log('Migrating: Adding recurrence column to embed_templates');
            db.run("ALTER TABLE embed_templates ADD COLUMN recurrence TEXT");
        }
        if (!templatesColumns.includes('target_channels')) {
            console.log('Migrating: Adding target_channels column to embed_templates');
            db.run("ALTER TABLE embed_templates ADD COLUMN target_channels TEXT");
        }

        // Check for new columns in tickets
        const ticketsInfo = db.exec("PRAGMA table_info(tickets)")[0].values;
        const ticketsColumns = ticketsInfo.map(c => c[1]);

        if (!ticketsColumns.includes('custom_id')) {
            console.log('Migrating: Adding custom_id column to tickets');
            db.run("ALTER TABLE tickets ADD COLUMN custom_id TEXT");
        }

        // Check for new columns in hubs
        const hubsInfo = db.exec("PRAGMA table_info(hubs)")[0].values;
        const hubsColumns = hubsInfo.map(c => c[1]);

        if (!hubsColumns.includes('thumbnail')) {
            console.log('Migrating: Adding thumbnail column to hubs');
            db.run("ALTER TABLE hubs ADD COLUMN thumbnail TEXT");
        }
        if (!hubsColumns.includes('footer')) {
            console.log('Migrating: Adding footer column to hubs');
            db.run("ALTER TABLE hubs ADD COLUMN footer TEXT");
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
function createEmbed({ channelId, guildId, config: embedConfig, scheduledTime, createdBy, content, messageType }) {
    const stmt = db.prepare(`
    INSERT INTO embeds (channel_id, guild_id, config, scheduled_time, created_by, content, message_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    stmt.run([channelId, guildId, JSON.stringify(embedConfig), scheduledTime || null, createdBy, content || null, messageType || 'embed']);
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
        if (row.config) row.config = JSON.parse(row.config);
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
        if (row.config) row.config = JSON.parse(row.config);
        result = row;
    }
    stmt.free();
    return result;
}

/**
 * Update embed configuration
 */
function updateEmbedConfig(embedId, embedConfig, content, messageType) {
    const stmt = db.prepare(`
    UPDATE embeds 
    SET config = ?, content = ?, message_type = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
    stmt.run([JSON.stringify(embedConfig), content || null, messageType || 'embed', embedId]);
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
        if (row.config) row.config = JSON.parse(row.config);
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
function createTemplate(guildId, name, category, config, createdBy, content, messageType, recurrence, targetChannels) {
    const stmt = db.prepare(`
        INSERT INTO embed_templates (guild_id, name, category, config, created_by, content, message_type, recurrence, target_channels)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
        guildId,
        name,
        category,
        JSON.stringify(config),
        createdBy,
        content || null,
        messageType || 'embed',
        recurrence ? JSON.stringify(recurrence) : null,
        targetChannels ? JSON.stringify(targetChannels) : null
    ]);
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
        if (row.config) row.config = JSON.parse(row.config);
        if (row.recurrence) row.recurrence = JSON.parse(row.recurrence);
        if (row.target_channels) row.target_channels = JSON.parse(row.target_channels);
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
        if (row.config) row.config = JSON.parse(row.config);
        if (row.recurrence) row.recurrence = JSON.parse(row.recurrence);
        if (row.target_channels) row.target_channels = JSON.parse(row.target_channels);
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
        if (row.config) row.config = JSON.parse(row.config);
        if (row.recurrence) row.recurrence = JSON.parse(row.recurrence);
        if (row.target_channels) row.target_channels = JSON.parse(row.target_channels);
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
    // Server Pulse operations
    createServerPulse,
    getServerPulses,
    getPulseByChannel,
    updatePulseMessageId,
    updatePulseLastRun,
    deletePulse,
    // Hub operations
    createHub,
    getHubs,
    getAllHubs,
    getHubById,
    updateHubMessageId,
    updateHub,
    deleteHub,
    // Hub Page operations
    createHubPage,
    getHubPages,
    getHubPageById,
    updateHubPage,
    deleteHubPage,
    // Ticket operations
    createTicket,
    getTicketByChannel,
    closeTicket,
    updateTicketCustomId,
    getTicketByIdOrCustomId,
    // Ticket Chat Logs
    logTicketMessage,
    getTicketMessages,
    getUserTickets,
    getTicketById,
};

// ============================================
// Ticket Chat Log Operations
// ============================================

/**
 * Log a message sent in a ticket channel
 */
function logTicketMessage(ticketId, message) {
    const stmt = db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_id, sender_name, content, attachment_url)
        VALUES (?, ?, ?, ?, ?)
    `);

    const attachmentUrl = message.attachments.first() ? message.attachments.first().url : null;

    stmt.run([
        ticketId,
        message.author.id,
        message.author.username,
        message.content,
        attachmentUrl
    ]);
    stmt.free();
    // No saveDatabase() needed for high-frequency inserts if we rely on WAL or periodic saves, 
    // but for now, let's save to be safe.
    saveDatabase();
}

/**
 * Get all messages for a ticket
 */
function getTicketMessages(ticketId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC');
    stmt.bind([ticketId]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get all tickets for a user (open and closed)
 */
function getUserTickets(userId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC');
    stmt.bind([userId]);

    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get a ticket by its ID
 */
function getTicketById(ticketId) {
    const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
    stmt.bind([ticketId]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

/**
 * Create a new server pulse configuration
 */
function createServerPulse({ guildId, channelId, intervalMinutes, config }) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO server_pulses (guild_id, channel_id, interval_minutes, config)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run([guildId, channelId, intervalMinutes || 120, config ? JSON.stringify(config) : null]);
    stmt.free();
    saveDatabase();
}

/**
 * Get all active server pulses
 */
function getServerPulses() {
    const results = [];
    const stmt = db.prepare('SELECT * FROM server_pulses WHERE is_active = 1');

    while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.config) row.config = JSON.parse(row.config);
        results.push(row);
    }
    stmt.free();
    return results;
}

/**
 * Get pulse by channel ID
 */
function getPulseByChannel(channelId) {
    const stmt = db.prepare('SELECT * FROM server_pulses WHERE channel_id = ?');
    stmt.bind([channelId]);

    let result = null;
    if (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.config) row.config = JSON.parse(row.config);
        result = row;
    }
    stmt.free();
    return result;
}

/**
 * Update the last message ID for a pulse
 */
function updatePulseMessageId(id, messageId) {
    const stmt = db.prepare('UPDATE server_pulses SET last_message_id = ? WHERE id = ?');
    stmt.run([messageId, id]);
    stmt.free();
    saveDatabase();
}

/**
 * Update the last run timestamp for a pulse
 */
function updatePulseLastRun(id) {
    const stmt = db.prepare("UPDATE server_pulses SET last_run = datetime('now') WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    saveDatabase();
}

/**
 * Delete a pulse configuration
 */
function deletePulse(channelId) {
    const stmt = db.prepare('DELETE FROM server_pulses WHERE channel_id = ?');
    stmt.run([channelId]);
    stmt.free();
    saveDatabase();
}

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

// ============================================
// Hub Operations
// ============================================

function createHub({ guildId, channelId, title, description, image, color }) {
    const stmt = db.prepare(`
        INSERT INTO hubs (guild_id, channel_id, title, description, image, color)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run([guildId, channelId, title, description, image || null, color || null]);
    stmt.free();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    return id;
}

function getHubs(guildId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM hubs WHERE guild_id = ?');
    stmt.bind([guildId]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

function getAllHubs() {
    const results = [];
    const stmt = db.prepare('SELECT * FROM hubs');
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

function getHubById(id) {
    const stmt = db.prepare('SELECT * FROM hubs WHERE id = ?');
    stmt.bind([id]);
    let result = null;
    if (stmt.step()) result = stmt.getAsObject();
    stmt.free();
    return result;
}

function updateHubMessageId(id, messageId) {
    const stmt = db.prepare('UPDATE hubs SET message_id = ? WHERE id = ?');
    stmt.run([messageId, id]);
    stmt.free();
    saveDatabase();
}

function deleteHub(id) {
    const stmt = db.prepare('DELETE FROM hubs WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
}

function updateHub({ id, title, description, image, color, thumbnail, footer }) {
    const stmt = db.prepare(`
        UPDATE hubs
        SET title = ?, description = ?, image = ?, color = ?, thumbnail = ?, footer = ?
        WHERE id = ?
    `);
    stmt.run([title || null, description || null, image || null, color || null, thumbnail || null, footer || null, id]);
    stmt.free();
    saveDatabase();
}

function getHubPageById(id) {
    const stmt = db.prepare('SELECT * FROM hub_pages WHERE id = ?');
    stmt.bind([id]);
    let result = null;
    if (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.content_embed) row.content_embed = JSON.parse(row.content_embed);
        result = row;
    }
    stmt.free();
    return result;
}

function updateHubPage({ id, label, emoji, style, contentEmbed, ticketCategoryId }) {
    const stmt = db.prepare(`
        UPDATE hub_pages
        SET label = ?, emoji = ?, style = ?, content_embed = ?, ticket_category_id = ?
        WHERE id = ?
    `);
    stmt.run([
        label,
        emoji || null,
        style || 'SECONDARY',
        contentEmbed ? JSON.stringify(contentEmbed) : null,
        ticketCategoryId || null,
        id
    ]);
    stmt.free();
    saveDatabase();
}

// ============================================
// Hub Page Operations
// ============================================

function createHubPage({ hubId, label, emoji, style, type, contentEmbed, ticketCategoryId, rowIndex, position }) {
    const stmt = db.prepare(`
        INSERT INTO hub_pages (hub_id, label, emoji, style, type, content_embed, ticket_category_id, row_index, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
        hubId, label, emoji || null, style || 'SECONDARY', type || 'page',
        contentEmbed ? JSON.stringify(contentEmbed) : null,
        ticketCategoryId || null, rowIndex || 0, position || 0
    ]);
    stmt.free();
    saveDatabase();
}

function getHubPages(hubId) {
    const results = [];
    const stmt = db.prepare('SELECT * FROM hub_pages WHERE hub_id = ? ORDER BY row_index, position');
    stmt.bind([hubId]);
    while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.content_embed) row.content_embed = JSON.parse(row.content_embed);
        results.push(row);
    }
    stmt.free();
    return results;
}

function deleteHubPage(id) {
    const stmt = db.prepare('DELETE FROM hub_pages WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    saveDatabase();
}

// ============================================
// Ticket Operations
// ============================================

function createTicket({ guildId, channelId, userId, type }) {
    const stmt = db.prepare(`
        INSERT INTO tickets (guild_id, channel_id, user_id, type)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run([guildId, channelId, userId, type || 'support']);
    stmt.free();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];

    saveDatabase();
    return id;
}

function getTicketByChannel(channelId) {
    const stmt = db.prepare('SELECT * FROM tickets WHERE channel_id = ?');
    stmt.bind([channelId]);
    let result = null;
    if (stmt.step()) result = stmt.getAsObject();
    stmt.free();
    return result;
}

function getTicketById(id) {
    const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
    stmt.bind([id]);
    let result = null;
    if (stmt.step()) result = stmt.getAsObject();
    stmt.free();
    return result;
}

function closeTicket(channelId) {
    const stmt = db.prepare("UPDATE tickets SET status = 'closed' WHERE channel_id = ?");
    stmt.run([channelId]);
    stmt.free();
    saveDatabase();
}

/**
 * Update ticket custom ID
 */
function updateTicketCustomId(ticketId, customId) {
    const stmt = db.prepare("UPDATE tickets SET custom_id = ? WHERE id = ?");
    stmt.run([customId, ticketId]);
    stmt.free();
    saveDatabase();
}

/**
 * Get ticket by ID or Custom ID
 */
function getTicketByIdOrCustomId(idOrRef) {
    // Try by ID first if it looks like an integer
    if (/^\d+$/.test(idOrRef)) {
        const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
        stmt.bind([parseInt(idOrRef, 10)]);
        if (stmt.step()) {
            const result = stmt.getAsObject();
            stmt.free();
            return result;
        }
        stmt.free();
    }

    // Try by custom_id
    const stmt = db.prepare('SELECT * FROM tickets WHERE lower(custom_id) = lower(?)');
    stmt.bind([idOrRef]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

