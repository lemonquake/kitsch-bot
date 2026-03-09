const { Events } = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const { buildPanelMessage } = require('../utils/panelBuilder');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // Check if this channel has a sticky embed
        const sticky = db.getStickyEmbedByChannel(message.channel.id);

        // Check if this channel has a sticky panel
        const panel = db.getStickyPanelByChannel(message.channel.id);

        // Check if this is a ticket channel and log the message
        const ticket = db.getTicketByChannel(message.channel.id);
        if (ticket) {
            db.logTicketMessage(ticket.id, message);
        }

        // Nothing sticky in this channel
        if (!sticky && !panel) return;

        try {
            // ── Re-post sticky embed first ──
            if (sticky) {
                // Delete the previous sticky message if it exists
                if (sticky.last_message_id) {
                    try {
                        const lastMsg = await message.channel.messages.fetch(sticky.last_message_id);
                        if (lastMsg) await lastMsg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error('Failed to delete old sticky message:', err);
                    }
                }

                // Get buttons for this embed
                const buttons = db.getEmbedButtons(sticky.embed_id);

                // Re-build embed and buttons
                const embed = buildEmbed(sticky.config);
                const actionRows = buildButtons(buttons);

                // Post the new sticky message
                const newMsg = await message.channel.send({
                    embeds: [embed],
                    components: actionRows,
                });

                // Update the database with the new message ID
                db.updateStickyMessageId(message.channel.id, newMsg.id);
            }

            // ── Re-post sticky panel (always below sticky embed) ──
            if (panel) {
                // Delete the previous panel message if it exists
                if (panel.last_message_id) {
                    try {
                        const lastMsg = await message.channel.messages.fetch(panel.last_message_id);
                        if (lastMsg) await lastMsg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error('Failed to delete old panel message:', err);
                    }
                }

                // Re-post the panel
                const payload = buildPanelMessage(message.guild);
                const newPanelMsg = await message.channel.send(payload);

                // Update the database with the new message ID
                db.updateStickyPanelMessageId(message.channel.id, newPanelMsg.id);
            }

        } catch (error) {
            console.error('Error handling sticky content:', error);
        }
    },
};
