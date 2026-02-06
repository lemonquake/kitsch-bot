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
    } else if (customId.startsWith('embed_save_template_')) {
        await handleSaveTemplate(interaction);
    } else if (customId.startsWith('embed_post_now_')) {
        await handlePostNow(interaction);
    } else if (customId.startsWith('embed_schedule_')) {
        await handleSchedule(interaction);
    } else if (customId.startsWith('embed_cancel_')) {
        await handleCancel(interaction);
    } else if (customId.startsWith('embed_live_preview_')) {
        await handleLivePreview(interaction);
    } else if (customId.startsWith('kitsch_btn_')) {
        // Custom button clicks on posted embeds
        await handleCustomButton(interaction);
    } else if (customId === 'faq_back_to_categories') {
        await handleFAQBackToCategories(interaction);
    } else if (customId.startsWith('faq_back_to_questions_')) {
        await handleFAQBackToQuestions(interaction);
    } else if (customId.startsWith('sched_btn_')) {
        const { handleScheduleInteraction } = require('./scheduleHandler');
        await handleScheduleInteraction(interaction);
    } else if (customId.startsWith('embed_edit_action_')) {
        await handleEditButtonAction(interaction);
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
            .setCustomId(`embed_save_template_${sessionId}`)
            .setLabel('Save as Template')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💾'),
        new ButtonBuilder()
            .setCustomId(`embed_schedule_${sessionId}`)
            .setLabel('Schedule')
            .setStyle(ButtonStyle.Secondary)
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

/**
 * Handle live preview button
 */
async function handleLivePreview(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const previewEmbed = buildEmbed(session.config);
    const buttonComponents = buildButtons(session.buttons);

    await interaction.reply({
        content: '👁️ **Live Preview**\nThis is how your embed will appear:',
        embeds: [previewEmbed],
        components: buttonComponents,
        ephemeral: true,
    });
}

/**
 * Handle save as template button - show modal to name the template
 */
async function handleSaveTemplate(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`embed_template_save_${sessionId}`)
        .setTitle('💾 Save as Template');

    const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Template Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('My Awesome Template')
        .setMaxLength(50)
        .setRequired(true);

    const categoryInput = new TextInputBuilder()
        .setCustomId('category')
        .setLabel('Category (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('General')
        .setMaxLength(30)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(categoryInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle FAQ back to categories button
 */
async function handleFAQBackToCategories(interaction) {
    const { EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
    const categories = db.getCategories(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setTitle('✨ Knowledge Base')
        .setDescription('Select a category below to browse our Frequently Asked Questions.')
        .setColor('#FF69B4')
        .setThumbnail(interaction.guild.iconURL());

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('faq_category_select')
        .setPlaceholder('Select a category...')
        .addOptions(categories.map(cat => ({
            label: cat,
            value: cat,
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

/**
 * Handle FAQ back to questions button
 */
async function handleFAQBackToQuestions(interaction) {
    const { EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
    const category = interaction.customId.replace('faq_back_to_questions_', '');
    const faqs = db.getFAQsByCategory(interaction.guild.id, category);

    const embed = new EmbedBuilder()
        .setTitle(`✨ Knowledge Base: ${category}`)
        .setDescription('Select a question below to see the answer.')
        .setColor('#FF69B4');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('faq_question_select')
        .setPlaceholder('Select a question...')
        .addOptions(faqs.map(f => ({
            label: f.question.length > 100 ? f.question.substring(0, 97) + '...' : f.question,
            value: f.id.toString(),
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('faq_back_to_categories')
            .setLabel('Back to Categories')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    await interaction.update({
        embeds: [embed],
        components: [row, backRow]
    });
}

module.exports = {
    handleButton,
    handleEditButtonSelect,
};

/**
 * Handle button selection for edit/remove
 */
async function handleEditButtonSelect(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);
    const selectedIndex = parseInt(interaction.values[0]);

    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    // Store selected button index
    session.editingButtonIndex = selectedIndex;
    buildSessions.set(sessionId, session);

    // Ask user what to do with the button
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_edit_action_edit_${sessionId}`)
            .setLabel('Edit Button')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`embed_edit_action_remove_${sessionId}`)
            .setLabel('Remove Button')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId(`embed_edit_action_cancel_${sessionId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content: `What would you like to do with button **#${selectedIndex + 1}**?`,
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle edit action (Edit vs Remove)
 */
async function handleEditButtonAction(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[3]; // edit, remove, cancel
    const sessionId = parts[4];
    const session = buildSessions.get(sessionId);

    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    // If we're cancelling, just delete the ephemeral message or update it
    if (action === 'cancel') {
        return interaction.update({ content: 'Cancelled.', components: [] });
    }

    const index = session.editingButtonIndex;
    if (index === undefined || index < 0 || index >= session.buttons.length) {
        return interaction.update({ content: '❌ Invalid button selection.', components: [] });
    }

    if (action === 'remove') {
        session.buttons.splice(index, 1);
        delete session.editingButtonIndex;
        // Re-render main view
        // Since we are in a new ephemeral message, we can't edit the MAIN one easily without sending a new one.
        // But showButtonsStep uses editReply if deferred/replied.
        // We can try to just send a fresh "Step 3" message.
        await interaction.update({ content: '✅ Button removed.', components: [] });
        await showButtonsStep(interaction, sessionId);
    }
    else if (action === 'edit') {
        const btn = session.buttons[index];
        // Show modal pre-filled
        const modal = new ModalBuilder()
            .setCustomId(`embed_button_edit_${sessionId}`) // Distinct ID to handle edit save
            .setTitle('✏️ Edit Button');

        const labelInput = new TextInputBuilder()
            .setCustomId('label')
            .setLabel('Button Label')
            .setStyle(TextInputStyle.Short)
            .setValue(btn.label)
            .setMaxLength(80)
            .setRequired(true);

        const urlInput = new TextInputBuilder()
            .setCustomId('url')
            .setLabel('URL (leave empty for interactive)')
            .setStyle(TextInputStyle.Short)
            .setValue(btn.url || '')
            .setPlaceholder('https://example.com')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(labelInput),
            new ActionRowBuilder().addComponents(urlInput)
        );

        await interaction.showModal(modal);
    }
}
