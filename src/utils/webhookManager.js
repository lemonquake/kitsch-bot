const { WebhookClient } = require('discord.js');
const db = require('../database/db');

// ============================================================
// Webhook Manager
// Central utility for creating, posting through, and deleting
// Discord webhooks.
// ============================================================

/**
 * Create a Discord webhook in a channel and save it to the DB.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} name        - Display name for the webhook
 * @param {string|null} avatarUrl
 * @param {string} guildId
 * @param {string} createdBy   - Discord user ID
 * @returns {Promise<Object>}  - DB record of the saved webhook
 */
async function createChannelWebhook(channel, name, avatarUrl, guildId, createdBy) {
    const options = { name, reason: `Created by Kitsch Bot for ${createdBy}` };
    if (avatarUrl) options.avatar = avatarUrl;

    const discordWebhook = await channel.createWebhook(options);

    const dbId = db.createWebhook({
        guildId,
        channelId: channel.id,
        name,
        webhookId: discordWebhook.id,
        webhookToken: discordWebhook.token,
        avatarUrl: avatarUrl || null,
        createdBy,
    });

    return db.getWebhookById(dbId);
}

/**
 * Post an embed (or plain content) through a saved webhook.
 * @param {Object}      webhookRecord  - Row from DB (webhook_id, webhook_token)
 * @param {Object}      options
 * @param {string}      [options.content]      - Plain text content
 * @param {Object}      [options.embed]        - EmbedBuilder instance
 * @param {Array}       [options.components]   - ActionRows
 * @param {string}      [options.username]     - Override username
 * @param {string}      [options.avatarURL]    - Override avatar
 * @returns {Promise<import('discord.js').Message>}
 */
async function postViaWebhook(webhookRecord, options = {}) {
    const client = new WebhookClient({
        id: webhookRecord.webhook_id,
        token: webhookRecord.webhook_token,
    });

    const payload = {};
    if (options.content) payload.content = options.content;
    if (options.embed) payload.embeds = [options.embed];
    if (options.embeds) payload.embeds = options.embeds;
    if (options.components) payload.components = options.components;
    if (options.username) payload.username = options.username;
    if (options.avatarURL) payload.avatarURL = options.avatarURL;

    // Fallback to webhook's default name/avatar if not overridden
    if (!payload.username) payload.username = webhookRecord.name;
    if (!payload.avatarURL && webhookRecord.avatar_url) {
        payload.avatarURL = webhookRecord.avatar_url;
    }

    const msg = await client.send(payload);
    client.destroy();
    return msg;
}

/**
 * Delete a saved webhook — revokes it from Discord and removes the DB record.
 * @param {Object} webhookRecord - Row from DB
 * @returns {Promise<void>}
 */
async function deleteChannelWebhook(webhookRecord) {
    try {
        const client = new WebhookClient({
            id: webhookRecord.webhook_id,
            token: webhookRecord.webhook_token,
        });
        await client.delete(`Deleted via Kitsch Bot`);
        client.destroy();
    } catch (err) {
        // Webhook may already be gone — still clean up DB
        console.warn(`[WebhookManager] Could not delete Discord webhook ${webhookRecord.webhook_id}:`, err.message);
    }
    db.deleteWebhook(webhookRecord.id);
}

module.exports = {
    createChannelWebhook,
    postViaWebhook,
    deleteChannelWebhook,
};
