const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { buildSessions } = require('../commands/embed');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const { showButtonsStep, showImagesStep } = require('./modalHandler');
const { createScheduledPost, getRelativeTime } = require('../utils/scheduler');
const db = require('../database/db');

/**
 * Handle button interactions
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleButton(interaction) {
    const customId = interaction.customId;

    // Embed builder flow buttons
    if (customId.startsWith('embed_skip_color_')) {
        await handleSkipColor(interaction);
    } else if (customId.startsWith('embed_add_images_')) {
        await handleAddImages(interaction);
    } else if (customId.startsWith('embed_skip_images_')) {
        await handleSkipImages(interaction);
    } else if (customId.startsWith('embed_add_button_')) {
        await handleAddButton(interaction);
    } else if (customId.startsWith('embed_finish_')) {
        await handleFinish(interaction);
    } else if (customId.startsWith('embed_post_now_')) {
        await handlePostNow(interaction);
    } else if (customId.startsWith('embed_schedule_')) {
        await handleSchedule(interaction);
    } else if (customId.startsWith('embed_cancel_')) {
        await handleCancel(interaction);
    } else if (customId.startsWith('kitsch_btn_')) {
        // Custom button clicks on posted embeds
        await handleCustomButton(interaction);
    }
}

/**
 * Handle skip color button
 */
async function handleSkipColor(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    await showImagesStep(interaction, sessionId);
}

/**
 * Handle add images button
 */
async function handleAddImages(interaction) {
    const sessionId = interaction.customId.split('_').pop();

    const modal = new ModalBuilder()
        .setCustomId(`embed_images_${sessionId}`)
        .setTitle('🖼️ Add Images');

    const thumbnailInput = new TextInputBuilder()
        .setCustomId('thumbnail')
        .setLabel('Thumbnail URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/thumbnail.png')
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('image')
        .setLabel('Banner Image URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/banner.png')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(thumbnailInput),
        new ActionRowBuilder().addComponents(imageInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle skip images button
 */
async function handleSkipImages(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    await showButtonsStep(interaction, sessionId);
}

/**
 * Handle add button button
 */
async function handleAddButton(interaction) {
    const sessionId = interaction.customId.split('_').pop();

    const modal = new ModalBuilder()
        .setCustomId(`embed_button_${sessionId}`)
        .setTitle('➕ Add Button');

    const labelInput = new TextInputBuilder()
        .setCustomId('label')
        .setLabel('Button Label')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Click Me!')
        .setMaxLength(80)
        .setRequired(true);

    const urlInput = new TextInputBuilder()
        .setCustomId('url')
        .setLabel('URL (leave empty for interactive button)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(urlInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle finish button - show final options
 */
async function handleFinish(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    // If editing, save changes directly
    if (session.isEdit) {
        await saveEditChanges(interaction, session, sessionId);
        return;
    }

    const previewEmbed = buildEmbed(session.config);
    const buttonComponents = buildButtons(session.buttons);

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_post_now_${sessionId}`)
            .setLabel('Post Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
        new ButtonBuilder()
            .setCustomId(`embed_schedule_${sessionId}`)
            .setLabel('Schedule')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📅'),
        new ButtonBuilder()
            .setCustomId(`embed_cancel_${sessionId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    const components = [...buttonComponents.slice(0, 4), controlRow];

    await interaction.update({
        content: `**Ready to Post!**\n\n📍 Channel: <#${session.channelId}>`,
        embeds: [previewEmbed],
        components,
    });
}

/**
 * Save edit changes to existing embed
 */
async function saveEditChanges(interaction, session, sessionId) {
    await interaction.deferUpdate();

    try {
        // Update embed config in database
        db.updateEmbedConfig(session.embedId, session.config);

        // Update buttons
        db.deleteEmbedButtons(session.embedId);
        if (session.buttons.length > 0) {
            db.createButtons(session.embedId, session.buttons);
        }

        // Fetch and update the original message
        const channel = await interaction.client.channels.fetch(session.channelId);
        const message = await channel.messages.fetch(session.messageId);

        const updatedEmbed = buildEmbed(session.config);
        const buttonComponents = buildButtons(session.buttons);

        await message.edit({
            embeds: [updatedEmbed],
            components: buttonComponents,
        });

        // Cleanup
        buildSessions.delete(sessionId);

        await interaction.editReply({
            content: '✅ **Embed Updated!**\n\nYour changes have been saved.',
            embeds: [updatedEmbed],
            components: [],
        });
    } catch (error) {
        console.error('Error saving edit:', error);
        await interaction.editReply({
            content: '❌ Failed to update the embed. Make sure the message still exists.',
            embeds: [],
            components: [],
        });
    }
}

/**
 * Handle post now button
 */
async function handlePostNow(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    await interaction.deferUpdate();

    try {
        // Get the channel
        const channel = await interaction.client.channels.fetch(session.channelId);

        // Build embed and buttons
        const embed = buildEmbed(session.config);
        const components = buildButtons(session.buttons);

        // Send the message
        const message = await channel.send({
            embeds: [embed],
            components,
        });

        // Save to database
        const embedId = db.createEmbed({
            channelId: session.channelId,
            guildId: session.guildId,
            config: session.config,
            createdBy: interaction.user.id,
        });

        db.updateEmbedMessageId(embedId, message.id);

        if (session.buttons.length > 0) {
            db.createButtons(embedId, session.buttons);
        }

        // Cleanup
        buildSessions.delete(sessionId);

        await interaction.editReply({
            content: `✅ **Embed Posted!**\n\n📍 Posted to <#${session.channelId}>\n🔗 [Jump to message](${message.url})`,
            embeds: [],
            components: [],
        });
    } catch (error) {
        console.error('Error posting embed:', error);
        await interaction.editReply({
            content: '❌ Failed to post the embed. Make sure I have permission to send messages in that channel.',
            embeds: [],
            components: [],
        });
    }
}

/**
 * Handle schedule button - show schedule modal
 */
async function handleSchedule(interaction) {
    const sessionId = interaction.customId.split('_').pop();

    const modal = new ModalBuilder()
        .setCustomId(`embed_schedule_${sessionId}`)
        .setTitle('📅 Schedule Post');

    const dateInput = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2024-01-15')
        .setMinLength(10)
        .setMaxLength(10)
        .setRequired(true);

    const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Time (HH:MM AM/PM)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10:30 PM')
        .setMaxLength(8)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(timeInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle cancel button
 */
async function handleCancel(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    buildSessions.delete(sessionId);

    await interaction.update({
        content: '❌ Embed creation cancelled.',
        embeds: [],
        components: [],
    });
}

/**
 * Handle custom button clicks on posted embeds
 */
async function handleCustomButton(interaction) {
    // For now, just acknowledge the click
    // This can be extended to perform custom actions
    await interaction.reply({
        content: '✨ Button clicked!',
        ephemeral: true,
    });
}

module.exports = {
    handleButton,
};
