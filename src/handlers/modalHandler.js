const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const db = require('../database/db');
const { buildSessions } = require('../commands/embed');

/**
 * Handle modal submissions
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('embed_content_')) {
        await handleContentModal(interaction);
    } else if (customId.startsWith('embed_images_')) {
        await handleImagesModal(interaction);
    } else if (customId.startsWith('embed_button_')) {
        // Distinguish between add (embed_button_sessionId) and edit (embed_button_edit_sessionId)
        if (customId.includes('_edit_')) {
            await handleButtonEditModal(interaction);
        } else {
            await handleButtonModal(interaction);
        }
    } else if (customId.startsWith('forum_post_')) {
        await handleForumPostModal(interaction);
    } else if (customId.startsWith('faq_add_')) {
        await handleFAQAddModal(interaction);
    } else if (customId.startsWith('embed_template_save_')) {
        await handleEmbedTemplateSaveModal(interaction);
    } else if (customId.startsWith('template_save_')) {
        await handleTemplateSaveModal(interaction);
    } else if (customId.startsWith('sched_modal_')) {
        const { handleScheduleModal } = require('./scheduleHandler');
        await handleScheduleModal(interaction);
    } else if (customId.startsWith('ticket_')) {
        const { handleTicketInteraction } = require('./ticketHandler');
        await handleTicketInteraction(interaction);
    }
}

/**
 * Handle template save modal submission
 */
async function handleTemplateSaveModal(interaction) {
    const parts = interaction.customId.split('_');
    const name = parts[2];
    const category = parts[3];

    // Extract values
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const color = interaction.fields.getTextInputValue('color');

    const config = {
        title: title || undefined,
        description: description || undefined,
        color: color || '#FFFFFF',
    };

    // Create template in database
    db.createTemplate(
        interaction.guild.id,
        name,
        category,
        config,
        interaction.user.id
    );

    await interaction.reply({
        content: `✅ Template **${name}** saved in category **${category}**!`,
        ephemeral: true,
    });
}

/**
 * Handle embed builder template save modal submission
 * This saves the full embed config and buttons from the embed builder session
 */
async function handleEmbedTemplateSaveModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again with `/embed create`.',
            ephemeral: true,
        });
    }

    const name = interaction.fields.getTextInputValue('name');
    const category = interaction.fields.getTextInputValue('category') || 'General';

    // Check if template name already exists
    const existing = db.getTemplateByName(interaction.guild.id, name);
    if (existing) {
        return interaction.reply({
            content: `❌ A template named **${name}** already exists. Please choose a different name.`,
            ephemeral: true,
        });
    }

    try {
        // Create template with full config (includes images, author, footer, etc.)
        const templateId = db.createTemplate(
            interaction.guild.id,
            name,
            category,
            session.config,
            interaction.user.id,
            null, // content (embed builder doesn't use this)
            'embed', // messageType
            null, // recurrence
            null // targetChannels
        );

        // Save buttons
        if (session.buttons && session.buttons.length > 0) {
            db.createTemplateButtons(templateId, session.buttons);
        }

        await interaction.reply({
            content: `✅ Template **${name}** saved with ${session.buttons?.length || 0} button(s)!\n\nUse \`/embed create template:${name}\` or \`/template use name:${name}\` to use it.`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error saving template:', error);
        await interaction.reply({
            content: `❌ Failed to save template: ${error.message}`,
            ephemeral: true,
        });
    }
}

module.exports = {
    handleModalSubmit,
    showColorStep,
    showImagesStep,
    showButtonsStep,
    handleFAQAddModal,
    handleTemplateSaveModal,
};
async function handleForumPostModal(interaction) {
    const { FORUM_CHANNEL_ID } = require('../commands/forum');

    // Extract values from modal
    const title = interaction.fields.getTextInputValue('forum_title');
    const content = interaction.fields.getTextInputValue('forum_content');

    await interaction.deferReply({ ephemeral: true });

    try {
        const forumChannel = await interaction.guild.channels.fetch(FORUM_CHANNEL_ID);

        if (!forumChannel || forumChannel.type !== 15) { // 15 is GUILD_FORUM
            return interaction.editReply({
                content: `❌ Could not find forum channel with ID \`${FORUM_CHANNEL_ID}\` or it is not a forum channel.`,
            });
        }

        // Create the thread (post)
        const thread = await forumChannel.threads.create({
            name: title,
            message: {
                content: content,
            },
        });

        await interaction.editReply({
            content: `✅ **Forum Post Created!**\n\nYour post has been created: ${thread.url}`,
        });

    } catch (error) {
        console.error('❌ Error creating forum post:', error);
        await interaction.editReply({
            content: `❌ Failed to create forum post: ${error.message}`,
        });
    }
}

/**
 * Handle content modal submission
 */
async function handleContentModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again with `/embed create`.',
            ephemeral: true,
        });
    }

    // Extract values from modal
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const author = interaction.fields.getTextInputValue('author');
    const footer = interaction.fields.getTextInputValue('footer');

    // Update session config
    if (title) session.config.title = title;
    if (description) session.config.description = description;
    if (author) session.config.author = author;
    if (footer) session.config.footer = footer;

    // Set default white color if not already set
    if (!session.config.color) {
        session.config.color = '#FFFFFF';
    }

    session.step = 'color';
    buildSessions.set(sessionId, session);

    // Show color selection dropdown
    await showColorStep(interaction, sessionId);
}

/**
 * Show color selection step
 */
async function showColorStep(interaction, sessionId) {
    const session = buildSessions.get(sessionId);
    const { getColorOptions } = require('../utils/embedBuilder');

    const colorOptions = getColorOptions().map(opt => ({
        label: opt.label,
        value: opt.value,
        emoji: opt.emoji,
        default: opt.value === session.config.color,
    }));

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId(`embed_color_select_${sessionId}`)
        .setPlaceholder('🎨 Choose embed color')
        .addOptions(colorOptions);

    const colorRow = new ActionRowBuilder().addComponents(colorSelect);
    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_skip_color_${sessionId}`)
            .setLabel('Continue')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
    );

    const previewEmbed = buildEmbed(session.config);

    await interaction.reply({
        content: '**Step 2: Choose Color**\n\nSelect a color for your embed, or click **Continue** to keep the current color.',
        embeds: [previewEmbed],
        components: [colorRow, controlRow],
        ephemeral: true,
    });
}

/**
 * Show images configuration step
 */
async function showImagesStep(interaction, sessionId) {
    const session = buildSessions.get(sessionId);
    session.step = 'images';
    buildSessions.set(sessionId, session);

    const previewEmbed = buildEmbed(session.config);

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_add_images_${sessionId}`)
            .setLabel('Add Images')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🖼️'),
        new ButtonBuilder()
            .setCustomId(`embed_skip_images_${sessionId}`)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
    );

    const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    await interaction[method]({
        content: '**Step 3: Add Images** (optional)\n\nAdd a thumbnail or a banner image to your embed.',
        embeds: [previewEmbed],
        components: [controlRow],
        ephemeral: true,
    });
}

/**
 * Handle images modal submission
 */
async function handleImagesModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const thumbnail = interaction.fields.getTextInputValue('thumbnail');
    const image = interaction.fields.getTextInputValue('image');

    if (thumbnail) session.config.thumbnail = thumbnail;
    if (image) session.config.image = image;

    buildSessions.set(sessionId, session);

    // Move to buttons step
    await showButtonsStep(interaction, sessionId);
}

/**
 * Handle button configuration modal
 */
async function handleButtonModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const label = interaction.fields.getTextInputValue('label');
    const url = interaction.fields.getTextInputValue('url');
    const { isValidUrl } = require('../utils/buttonBuilder');

    if (url && !isValidUrl(url)) {
        return interaction.reply({
            content: '❌ Invalid URL provided. Please enter a valid HTTP/HTTPS URL (e.g., `https://google.com`).',
            ephemeral: true,
        });
    }

    const style = url ? 'LINK' : (session.pendingButtonStyle || 'PRIMARY');

    // Add button to session
    session.buttons.push({
        label,
        style,
        url: url || null,
        customId: url ? null : `kitsch_btn_${Date.now()}`,
        rowIndex: Math.floor(session.buttons.length / 5),
        position: session.buttons.length % 5,
    });

    delete session.pendingButtonStyle;
    buildSessions.set(sessionId, session);

    // Show updated buttons step
    await showButtonsStep(interaction, sessionId);
}

/**
 * Handle button edit modal
 */
async function handleButtonEditModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session || session.editingButtonIndex === undefined) {
        return interaction.reply({ content: 'Session expired or invalid state.', ephemeral: true });
    }

    const index = session.editingButtonIndex;
    const label = interaction.fields.getTextInputValue('label');
    const url = interaction.fields.getTextInputValue('url');
    const { isValidUrl } = require('../utils/buttonBuilder');

    if (url && !isValidUrl(url)) {
        return interaction.reply({
            content: '❌ Invalid URL provided. Please enter a valid HTTP/HTTPS URL (e.g., `https://google.com`).',
            ephemeral: true,
        });
    }

    const style = url ? 'LINK' : 'PRIMARY'; // Default reset to PRIMARY if URL removed

    // Update button properties
    session.buttons[index].label = label;
    session.buttons[index].url = url || null;
    session.buttons[index].style = style;
    // Maintain row/position

    // Clear editing state
    delete session.editingButtonIndex;
    buildSessions.set(sessionId, session);

    await showButtonsStep(interaction, sessionId);
}

/**
 * Handle schedule modal submission
 */
async function handleScheduleModal(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const date = interaction.fields.getTextInputValue('date');
    const time = interaction.fields.getTextInputValue('time');

    const { parseDateTime, getRelativeTime, createScheduledPost } = require('../utils/scheduler');
    const scheduledTime = parseDateTime(date, time);

    if (!scheduledTime) {
        return interaction.reply({
            content: '❌ Invalid date/time format. Please use:\n• Date: `YYYY-MM-DD` (e.g., 2024-01-15)\n• Time: `HH:MM AM/PM` (e.g., 10:30 PM)',
            ephemeral: true,
        });
    }

    if (scheduledTime <= new Date()) {
        return interaction.reply({
            content: '❌ Scheduled time must be in the future.',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    // Create embed in database
    const embedId = db.createEmbed({
        channelId: session.channelId,
        guildId: session.guildId,
        config: session.config,
        scheduledTime: scheduledTime.toISOString(),
        createdBy: interaction.user.id,
    });

    // Save buttons
    if (session.buttons.length > 0) {
        db.createButtons(embedId, session.buttons);
    }

    // Schedule the post
    createScheduledPost({
        embedId,
        channelId: session.channelId,
        guildId: session.guildId,
        config: session.config,
        scheduledTime: scheduledTime.toISOString(),
    });

    // Cleanup session
    buildSessions.delete(sessionId);

    const previewEmbed = buildEmbed(session.config);
    const relativeTime = getRelativeTime(scheduledTime);

    await interaction.editReply({
        content: `✅ **Embed Scheduled!**\n\nYour embed will be posted to <#${session.channelId}> ${relativeTime}\n📅 ${scheduledTime.toLocaleString()}`,
        embeds: [previewEmbed],
        components: [],
    });
}

/**
 * Show buttons configuration step
 */
async function showButtonsStep(interaction, sessionId) {
    const session = buildSessions.get(sessionId);
    session.step = 'buttons';
    buildSessions.set(sessionId, session);

    const previewEmbed = buildEmbed(session.config);
    const buttonComponents = buildButtons(session.buttons);

    const buttonCount = session.buttons.length;
    const canAddMore = buttonCount < 25; // Max 25 buttons (5 rows × 5 buttons)

    // Create select menu to edit/remove buttons if there are any
    const selectRow = new ActionRowBuilder();
    if (buttonCount > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`embed_edit_button_select_${sessionId}`)
            .setPlaceholder('✏️ Select a button to Edit or Remove')
            .addOptions(session.buttons.map((btn, index) => ({
                label: `${index + 1}. ${btn.label.substring(0, 50)}`,
                description: btn.url ? `Link: ${btn.url.substring(0, 50)}` : `Style: ${btn.style}`,
                value: index.toString(),
                emoji: '🔘'
            })));
        selectRow.addComponents(selectMenu);
    }

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_add_button_${sessionId}`)
            .setLabel(`Add Button (${buttonCount}/25)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕')
            .setDisabled(!canAddMore),
        new ButtonBuilder()
            .setCustomId(`embed_finish_${sessionId}`)
            .setLabel(session.isEdit ? 'Save Changes' : 'Continue')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );

    const components = [...buttonComponents]; // Show buttons preview
    if (buttonCount > 0) components.push(selectRow); // Add select menu
    components.push(controlRow); // Add controls

    // We can only show 5 rows max. Discord limits.
    // If buttons take up 5 rows, we can't show controls.
    // buttonComponents returns rows.
    // We should limit preview if needed or rely on user knowing limits.
    // Since we limit to 5 rows in buttonBuilder, we might go over limit if we add control rows.
    // Safe bet: slice buttonComponents to 3 rows max for preview to allow 2 rows for controls.
    const previewComponents = [...buttonComponents.slice(0, 3), ...components.slice(buttonComponents.length)];
    // Actually simpler:
    const finalComponents = [];
    finalComponents.push(...buttonComponents.slice(0, 3)); // Max 3 rows of preview
    if (buttonCount > 0) finalComponents.push(selectRow);
    finalComponents.push(controlRow);

    const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    await interaction[method]({
        content: `**Step 3: Add Buttons** (optional)\n\nCurrent buttons: ${buttonCount}\n*Use the select menu below to Edit or Remove buttons.*`,
        embeds: [previewEmbed],
        components: finalComponents,
        ephemeral: true,
    });
}

/**
 * Handle FAQ Add modal submission
 */
async function handleFAQAddModal(interaction) {
    const parts = interaction.customId.split('_');
    const category = parts[2];
    const question = parts.slice(3).join('_');
    const answer = interaction.fields.getTextInputValue('answer');

    db.addFAQ(interaction.guild.id, category, question, answer);

    await interaction.reply({
        content: `✅ FAQ Added!\n\n**Category:** ${category}\n**Question:** ${question}`,
        ephemeral: true,
    });
}

module.exports = {
    handleModalSubmit,
    showColorStep,
    showImagesStep,
    showButtonsStep,
    handleFAQAddModal,
};
