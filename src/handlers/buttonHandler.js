const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { buildSessions } = require('../commands/embed');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const { showButtonsStep, showImagesStep } = require('./modalHandler');
const { createScheduledPost, getRelativeTime } = require('../utils/scheduler');
const { handleHubButtonInteraction } = require('../utils/hubManager');
const db = require('../database/db');

/**
 * Handle button interactions
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleButton(interaction) {
    const customId = interaction.customId;

    // Hub control panel buttons
    if (customId.startsWith('hub_ctrl_')) {
        await handleHubButtonInteraction(interaction);
        // Embed builder flow buttons
    } else if (customId.startsWith('embed_skip_color_')) {
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
    } else if (customId.startsWith('hub_edit_')) {
        const { handleHubEditorButton } = require('../utils/hubEditor');
        await handleHubEditorButton(interaction);
    } else if (customId.startsWith('embed_webhook_')) {
        await handleWebhookPickButton(interaction);
    } else if (customId === 'help_back_home') {
        const { handleHelpBack } = require('./helpHandler');
        await handleHelpBack(interaction);
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

    // Quick Mention Select Menu
    const mentionSelect = new StringSelectMenuBuilder()
        .setCustomId(`embed_quick_mention_${sessionId}`)
        .setPlaceholder('🔔 Quick Mention (Optional)')
        .addOptions([
            { label: 'None', value: 'none', description: 'Clear mentions' },
            { label: '@everyone', value: '@everyone', description: 'Notify everyone' },
            { label: '@here', value: '@here', description: 'Notify online members' }
        ]);

    // Add role options if possible, but keep it simple for now or fetch roles?
    // fetching roles might be too heavy for this sync flow. Keep it simple.

    const selectRow = new ActionRowBuilder().addComponents(mentionSelect);

    // Check if there are any saved webhooks for this guild
    const savedWebhooks = db.getWebhooks(session.guildId);
    const hasWebhooks = savedWebhooks.length > 0;

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_post_now_${sessionId}`)
            .setLabel('Post Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
        new ButtonBuilder()
            .setCustomId(`embed_webhook_pick_${sessionId}`)
            .setLabel('Post as Webhook')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔗')
            .setDisabled(!hasWebhooks),
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

    const components = [...buttonComponents.slice(0, 3), selectRow, controlRow];

    const contentPreview = session.content ? `**Message Content:**\n${session.content}\n\n` : '';
    const webhookHint = !hasWebhooks ? '\n> 💡 Tip: Use `/webhook create` to add a webhook for the "Post as Webhook" option.' : '';

    await interaction.update({
        content: `${contentPreview}**Ready to Post!**\n\n📍 Channel: <#${session.channelId}>${webhookHint}`,
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
        db.updateEmbedConfig(session.embedId, session.config, session.content);

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

        const payload = {
            embeds: [updatedEmbed],
            components: buttonComponents,
        };

        if (session.content !== undefined) {
            payload.content = session.content;
        }

        await message.edit(payload);

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
        const payload = {
            embeds: [embed],
            components,
        };

        if (session.content) {
            payload.content = session.content;
        }

        const message = await channel.send(payload);

        // Save to database
        const embedId = db.createEmbed({
            channelId: session.channelId,
            guildId: session.guildId,
            config: session.config,
            content: session.content,
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

/**
 * Handle Quick Mention selection
 */
async function handleQuickMentionSelect(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    const selection = interaction.values[0];

    if (selection === 'none') {
        session.content = '';
    } else {
        session.content = `${selection} ${session.content || ''}`.trim();
    }

    buildSessions.set(sessionId, session);

    // Refresh the view
    await handleFinish(interaction);
}

module.exports = {
    handleButton,
    handleEditButtonSelect,
    handleQuickMentionSelect,
    handleWebhookPickButton,
    handlePanelButton,
    handlePanelSelect,
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

// ─────────────────────────────────────────────────────────────────────────────
// Webhook pick → show select menu of saved webhooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when user clicks "Post as Webhook" in the embed builder finish step.
 * Shows a select menu to choose which saved webhook to use.
 */
async function handleWebhookPickButton(interaction) {
    const customId = interaction.customId;
    const sessionId = customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({ content: '❌ Session expired. Please start again.', ephemeral: true });
    }

    // embed_webhook_confirm_{webhookDbId}_{sessionId}
    if (customId.startsWith('embed_webhook_confirm_')) {
        return handleWebhookSelectAndPost(interaction, sessionId, session);
    }

    // embed_webhook_pick_{sessionId} — show picker
    const webhooks = db.getWebhooks(session.guildId);
    if (webhooks.length === 0) {
        return interaction.reply({
            content: '❌ No webhooks saved for this server. Use `/webhook create` to add one.',
            ephemeral: true,
        });
    }

    const webhookSelect = new StringSelectMenuBuilder()
        .setCustomId(`embed_webhook_select_${sessionId}`)
        .setPlaceholder('🔗 Choose a webhook to post as...')
        .addOptions(
            webhooks.slice(0, 25).map(w => ({
                label: w.name,
                description: `Channel: ID ${w.channel_id}`,
                value: w.id.toString(),
                emoji: '🔗',
            }))
        );

    const row = new ActionRowBuilder().addComponents(webhookSelect);

    await interaction.reply({
        content: '🔗 **Post as Webhook**\n\nSelect a webhook to use:',
        components: [row],
        ephemeral: true,
    });
}

/**
 * Called from selectHandler when the user picks a webhook from the picker.
 * Sends a confirm button with an optional name/avatar override modal path.
 */
async function handleWebhookSelectAndPost(interaction, sessionId, session) {
    // Comes from confirm button: embed_webhook_confirm_{dbId}_{sessionId}
    const parts = interaction.customId.split('_');
    // embed_webhook_confirm_{dbId}_{sessionId}
    const webhookDbId = parseInt(parts[3]);

    const wh = db.getWebhookById(webhookDbId);
    if (!wh) {
        return interaction.reply({ content: '❌ Webhook not found.', ephemeral: true });
    }

    await interaction.deferUpdate();

    try {
        const { postViaWebhook } = require('../utils/webhookManager');
        const { buildEmbed } = require('../utils/embedBuilder');
        const { buildButtons } = require('../utils/buttonBuilder');

        const embed = buildEmbed(session.config);
        const components = buildButtons(session.buttons);

        const msg = await postViaWebhook(wh, {
            embed,
            components: components.length > 0 ? components : undefined,
            content: session.content || undefined,
        });

        // Save embed to database for tracking
        const embedId = db.createEmbed({
            channelId: wh.channel_id,
            guildId: wh.guild_id,
            config: session.config,
            content: session.content,
            createdBy: interaction.user.id,
        });
        // Use msg.id if available, else skip (webhooks return partial message)
        if (msg && msg.id) db.updateEmbedMessageId(embedId, msg.id);
        if (session.buttons.length > 0) db.createButtons(embedId, session.buttons);

        buildSessions.delete(sessionId);

        await interaction.editReply({
            content: `✅ **Posted via webhook "${wh.name}"!**\n<#${wh.channel_id}>`,
            embeds: [],
            components: [],
        });
    } catch (err) {
        console.error('[embed webhook post]', err);
        await interaction.editReply({
            content: `❌ Failed to post: ${err.message}`,
            embeds: [],
            components: [],
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mod Panel Button Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle panel button interactions
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handlePanelButton(interaction) {
    const { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const id = interaction.customId;

    // ── Refresh Panel ──
    if (id === 'panel_refresh') {
        await handlePanelRefresh(interaction);
        return;
    }

    try {
        if (id === 'panel_create_embed') {
            const select = new ChannelSelectMenuBuilder()
                .setCustomId('panel_select_embed_channel')
                .setPlaceholder('Select target channel for the embed')
                .setMaxValues(1)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

            await interaction.reply({
                content: 'Select the channel where you want to post the embed:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true
            });
        }

        else if (id === 'panel_templates') {
            const templates = db.getTemplates(interaction.guild.id);
            if (templates.length === 0) {
                return interaction.reply({ content: '❌ No templates saved yet.\nCreate one with `/template save`.', ephemeral: true });
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('panel_select_template')
                .setPlaceholder('Select a template to use...')
                .addOptions(templates.slice(0, 25).map(t => ({
                    label: t.name,
                    description: t.category || 'General',
                    value: t.name
                })));

            await interaction.reply({
                content: 'Choose a template to start building an embed:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true
            });
        }

        else if (id === 'panel_forum_post') {
            const sessionId = interaction.user.id;
            const modal = new ModalBuilder()
                .setCustomId(`forum_post_${sessionId}`)
                .setTitle('📝 Create Forum Post');

            const titleInput = new TextInputBuilder()
                .setCustomId('forum_title')
                .setLabel('Thread Title')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the title for your thread...')
                .setMaxLength(100)
                .setRequired(true);

            const contentInput = new TextInputBuilder()
                .setCustomId('forum_content')
                .setLabel('Message Content')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the message content for your thread...')
                .setMaxLength(2000)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(contentInput)
            );

            await interaction.showModal(modal);
        }

        else if (id === 'panel_schedules') {
            const { handleCreate } = require('./scheduleHandler');
            await handleCreate(interaction);
        }

        else if (id === 'panel_hubs') {
            const hubs = db.getHubs(interaction.guild.id);
            if (hubs.length === 0) {
                return interaction.reply({ content: '❌ No hubs found in this server. Create one with `/hub create`.', ephemeral: true });
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('panel_select_hub')
                .setPlaceholder('Select a hub to edit...')
                .addOptions(hubs.map(h => ({
                    label: h.title,
                    description: `ID: ${h.id} | Channel ID: ${h.channel_id}`,
                    value: h.id.toString()
                })));

            await interaction.reply({
                content: 'Select a Hub to open in the editor:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true
            });
        }

        else if (id === 'panel_tickets') {
            const tickets = db.getUserTickets(interaction.user.id);
            if (tickets.length === 0) {
                return interaction.reply({ content: '📭 You have no past tickets.', ephemeral: true });
            }
            const recentTickets = tickets.slice(0, 25);
            const embed = new EmbedBuilder()
                .setTitle('📂 Your Ticket History')
                .setColor('#5865F2')
                .setDescription(recentTickets.map(t =>
                    `**#${t.id}** ${t.custom_id ? `(${t.custom_id}) ` : ''}- <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R> - ${t.status.toUpperCase()}`
                ).join('\n'))
                .setFooter({ text: tickets.length > 25 ? `Showing 25 of ${tickets.length} tickets` : `${tickets.length} tickets found` });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (id === 'panel_faq') {
            const categories = db.getCategories(interaction.guild.id);
            if (categories.length === 0) {
                return interaction.reply({ content: '❌ No FAQs found. Add some first with `/faq add`.', ephemeral: true });
            }
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

            await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
        }

        else if (id === 'panel_pulse') {
            const pulses = db.getServerPulses().filter(p => p.guild_id === interaction.guild.id);
            const embed = new EmbedBuilder()
                .setTitle('💓 Server Pulse')
                .setColor(0xFF69B4);

            if (pulses.length === 0) {
                embed.setDescription('No active pulses.\nSetup with `/pulse setup channel:<#channel>`.');
            } else {
                const list = pulses.map(p =>
                    `📍 <#${p.channel_id}> — Every **${p.interval_minutes}m** (Last: ${p.last_run || 'Never'})`
                ).join('\n');
                embed.setDescription(list + '\n\n> `/pulse force` · `/pulse status` · `/pulse stop`');
            }
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (id === 'panel_webhooks') {
            const webhooks = db.getWebhooks(interaction.guild.id);
            const embed = new EmbedBuilder()
                .setTitle('🔗 Webhooks')
                .setColor(0xFF69B4);

            if (webhooks.length === 0) {
                embed.setDescription('No webhooks saved.\nCreate one with `/webhook create`.');
            } else {
                const list = webhooks.slice(0, 15).map(w =>
                    `🔗 **${w.name}** — <#${w.channel_id}>`
                ).join('\n');
                embed.setDescription(list + `\n\n> **${webhooks.length}** webhook(s) saved.\n> \`/webhook post\` · \`/webhook list\` · \`/webhook delete\``);
            }
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (id === 'panel_help') {
            await interaction.deferReply({ ephemeral: true });
            const { getHelpOverview } = require('./helpHandler');
            const overview = getHelpOverview();
            await interaction.editReply({
                embeds: overview.embeds,
                components: overview.components,
            });
        }
        else {
            await interaction.reply({ content: '❓ Unknown panel action.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling panel button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
        }
    }
}

/**
 * Handle the panel refresh button
 */
async function handlePanelRefresh(interaction) {
    const { buildPanelMessage } = require('../utils/panelBuilder');
    const channelId = interaction.channel.id;
    const panel = db.getStickyPanelByChannel(channelId);

    if (!panel) {
        return interaction.reply({ content: '❌ No panel is active in this channel.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Delete old panel message
        if (panel.last_message_id) {
            try {
                const msg = await interaction.channel.messages.fetch(panel.last_message_id);
                if (msg) await msg.delete();
            } catch (err) {
                if (err.code !== 10008) console.error('Failed to delete old panel:', err);
            }
        }

        // Re-post fresh panel
        const payload = buildPanelMessage(interaction.guild);
        const newMsg = await interaction.channel.send(payload);
        db.updateStickyPanelMessageId(channelId, newMsg.id);

        await interaction.editReply({ content: '✅ **Panel refreshed!**' });
    } catch (error) {
        console.error('Error refreshing panel:', error);
        await interaction.editReply({ content: '❌ Failed to refresh the panel.' });
    }
}

/**
 * Handle panel select menu interactions
 * @param {import('discord.js').AnySelectMenuInteraction} interaction
 */
async function handlePanelSelect(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
    const id = interaction.customId;

    if (id === 'panel_select_embed_channel' || id.startsWith('panel_select_tgt_')) {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return interaction.update({ content: '❌ Channel not found.', components: [] });

        let templateName = null;
        if (id.startsWith('panel_select_tgt_')) {
            templateName = id.replace('panel_select_tgt_', '');
        }

        const sessionId = interaction.user.id;
        const { buildSessions } = require('../commands/embed');

        let initialConfig = {};
        let initialButtons = [];

        if (templateName) {
            const template = db.getTemplateByName(interaction.guild.id, templateName);
            if (template) {
                initialConfig = template.config;
                const buttons = db.getTemplateButtons(template.id);
                initialButtons = buttons.map(b => ({
                    label: b.label,
                    style: b.style,
                    url: b.url,
                    customId: b.custom_id,
                    rowIndex: b.row_index,
                    position: b.position
                }));
            }
        }

        buildSessions.set(sessionId, {
            channelId: channel.id,
            guildId: interaction.guild.id,
            scheduleOption: 'now',
            config: initialConfig,
            buttons: initialButtons,
            step: 'content',
        });

        const titleValue = initialConfig.title || '';
        const descriptionValue = initialConfig.description || '';
        const authorValue = initialConfig.author || '';
        const footerValue = initialConfig.footer || '';
        const contentValue = initialConfig.content || '';

        const modal = new ModalBuilder()
            .setCustomId(`embed_content_${sessionId}`)
            .setTitle('✨ Kitsch Embed Builder');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter embed title...')
            .setMaxLength(256)
            .setRequired(false)
            .setValue(titleValue);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Message Content (Mentions go here)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Message text outside the embed')
            .setMaxLength(2000)
            .setRequired(false)
            .setValue(contentValue);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter embed description...')
            .setMaxLength(4000)
            .setRequired(false)
            .setValue(descriptionValue);

        const authorInput = new TextInputBuilder()
            .setCustomId('author')
            .setLabel('Author Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter author name...')
            .setMaxLength(256)
            .setRequired(false)
            .setValue(authorValue);

        const footerInput = new TextInputBuilder()
            .setCustomId('footer')
            .setLabel('Footer Text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter footer text...')
            .setMaxLength(2048)
            .setRequired(false)
            .setValue(footerValue);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(authorInput),
            new ActionRowBuilder().addComponents(footerInput)
        );

        await interaction.showModal(modal);

        try { await interaction.message.delete(); } catch (e) { }
    }

    else if (id === 'panel_select_template') {
        const templateName = interaction.values[0];
        const select = new ChannelSelectMenuBuilder()
            .setCustomId(`panel_select_tgt_${templateName}`)
            .setPlaceholder('Select target channel for the embed')
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

        await interaction.update({
            content: `Template **${templateName}** selected. Now pick a channel:`,
            components: [new ActionRowBuilder().addComponents(select)]
        });
    }

    else if (id === 'panel_select_hub') {
        const hubId = interaction.values[0];
        const hub = db.getHubById(hubId);
        if (!hub) return interaction.update({ content: '❌ Hub not found.', components: [] });

        const { renderHubEditor } = require('../utils/hubEditor');
        await interaction.update({ content: 'Loading editor...', components: [] });
        await renderHubEditor(interaction, hubId);
    }
}
