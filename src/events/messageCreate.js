const { Events } = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // Check if this channel has a sticky embed
        const sticky = db.getStickyEmbedByChannel(message.channel.id);
        if (!sticky) return;

        try {
            // Delete the previous sticky message if it exists
            if (sticky.last_message_id) {
                try {
                    const lastMsg = await message.channel.messages.fetch(sticky.last_message_id);
                    if (lastMsg) {
                        await lastMsg.delete();
                    }
                } catch (err) {
                    // Ignore errors if message was already deleted
                    if (err.code !== 10008) {
                        console.error('Failed to delete old sticky message:', err);
                    }
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
                components: actionRows
            });

            // Update the database with the new message ID
            db.updateStickyMessageId(message.channel.id, newMsg.id);

        } catch (error) {
            console.error('Error handling sticky embed:', error);
        }
    },
};
