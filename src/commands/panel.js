const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { buildPanelMessage } = require('../utils/panelBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Manage the Sticky Mod Control Panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('post')
                .setDescription('Post the Mod Panel to the current channel (sticky)')
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove the Mod Panel from the current channel')
        )
        .addSubcommand(sub =>
            sub.setName('refresh')
                .setDescription('Manually refresh (re-send) the Mod Panel')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'post') {
            await handlePost(interaction);
        } else if (subcommand === 'remove') {
            await handleRemove(interaction);
        } else if (subcommand === 'refresh') {
            await handleRefresh(interaction);
        }
    },
};

/**
 * Post the panel to the current channel
 */
async function handlePost(interaction) {
    const channelId = interaction.channel.id;
    const existing = db.getStickyPanelByChannel(channelId);

    if (existing) {
        return interaction.reply({
            content: '⚠️ A Mod Panel is already active in this channel.\nUse `/panel refresh` to update it, or `/panel remove` to remove it first.',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Send the panel message
        const payload = buildPanelMessage(interaction.guild);
        const msg = await interaction.channel.send(payload);

        // Save to database
        db.createStickyPanel({
            channelId,
            guildId: interaction.guild.id,
            createdBy: interaction.user.id,
        });
        db.updateStickyPanelMessageId(channelId, msg.id);

        await interaction.editReply({
            content: `✅ **Mod Panel deployed!**\n\n📍 The panel is now sticky in <#${channelId}> and will stay at the bottom.\nUse \`/panel remove\` to take it down.`,
        });
    } catch (error) {
        console.error('Error posting panel:', error);
        await interaction.editReply({
            content: '❌ Failed to post the panel. Make sure I have permission to send messages in this channel.',
        });
    }
}

/**
 * Remove the panel from the current channel
 */
async function handleRemove(interaction) {
    const channelId = interaction.channel.id;
    const panel = db.getStickyPanelByChannel(channelId);

    if (!panel) {
        return interaction.reply({
            content: '❌ No Mod Panel found in this channel.',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Try to delete the last panel message
        if (panel.last_message_id) {
            try {
                const msg = await interaction.channel.messages.fetch(panel.last_message_id);
                if (msg) await msg.delete();
            } catch (err) {
                // Ignore if already deleted
                if (err.code !== 10008) console.error('Failed to delete panel message:', err);
            }
        }

        db.removeStickyPanel(channelId);

        await interaction.editReply({
            content: '✅ **Mod Panel removed** from this channel.',
        });
    } catch (error) {
        console.error('Error removing panel:', error);
        await interaction.editReply({
            content: '❌ Failed to remove the panel.',
        });
    }
}

/**
 * Manually refresh the panel
 */
async function handleRefresh(interaction) {
    const channelId = interaction.channel.id;
    const panel = db.getStickyPanelByChannel(channelId);

    if (!panel) {
        return interaction.reply({
            content: '❌ No Mod Panel found in this channel. Use `/panel post` first.',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Delete old panel message
        if (panel.last_message_id) {
            try {
                const msg = await interaction.channel.messages.fetch(panel.last_message_id);
                if (msg) await msg.delete();
            } catch (err) {
                if (err.code !== 10008) console.error('Failed to delete old panel message:', err);
            }
        }

        // Re-send fresh panel
        const payload = buildPanelMessage(interaction.guild);
        const newMsg = await interaction.channel.send(payload);
        db.updateStickyPanelMessageId(channelId, newMsg.id);

        await interaction.editReply({
            content: '✅ **Mod Panel refreshed!**',
        });
    } catch (error) {
        console.error('Error refreshing panel:', error);
        await interaction.editReply({
            content: '❌ Failed to refresh the panel.',
        });
    }
}
