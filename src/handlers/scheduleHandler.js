const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ChannelType,
    ChannelSelectMenuBuilder
} = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const { parseDateTime, createScheduledPost } = require('../utils/scheduler');

// Store active scheduling sessions
const scheduleSessions = new Map();

/**
 * Start a new scheduling session
 */
async function handleCreate(interaction) {
    const sessionId = interaction.user.id;

    // Initialize empty session
    scheduleSessions.set(sessionId, {
        guildId: interaction.guild.id,
        channelId: null,
        scheduledTime: null,
        config: {
            title: 'New Scheduled Message',
            description: 'Edit this description...',
            color: '#0099ff'
        },
        config: {
            title: 'New Scheduled Message',
            description: 'Edit this description...',
            color: '#0099ff'
        },
        buttons: [],
        recurrence: [],
        targetChannels: []
    });

    await renderDashboard(interaction, sessionId);
}

/**
 * List scheduled messages
 */
async function handleList(interaction) {
    const jobs = db.getPendingJobs().filter(job => job.guild_id === interaction.guild.id); // Assuming getPendingJobs returns all

    if (jobs.length === 0) {
        return interaction.reply({
            content: '📭 No scheduled messages found.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📅 Scheduled Messages')
        .setColor('#0099ff');

    const fields = jobs.slice(0, 10).map(job => {
        const date = new Date(job.scheduled_time).toLocaleString();
        const channel = interaction.guild.channels.cache.get(job.channel_id);
        const channelName = channel ? channel.name : 'Unknown Channel';
        return {
            name: `ID: ${job.id}`,
            value: `🗓️ ${date}\n📍 #${channelName}\n📝 Embed ID: ${job.embed_id}`
        };
    });

    embed.addFields(fields);

    if (jobs.length > 10) {
        embed.setFooter({ text: `...and ${jobs.length - 10} more` });
    }

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Edit a scheduled message
 */
async function handleEdit(interaction) {
    const jobId = interaction.options.getString('subscription_id');
    // We need to fetch the job and its data
    // Assuming we can get job by ID
    // Since we don't have a direct getJobById, we might need to rely on list or extend DB
    // For now, let's filter from pending jobs
    const jobs = db.getPendingJobs();
    const job = jobs.find(j => j.id.toString() === jobId && j.guild_id === interaction.guild.id);

    if (!job) {
        return interaction.reply({
            content: '❌ Scheduled message not found.',
            ephemeral: true
        });
    }

    // Load into session
    const sessionId = interaction.user.id;

    // We need to fetch the embed config and buttons for this job
    // The job object from getPendingJobs might calculate them or we fetch manually
    // Looking at scheduler.js, job has embed_id.
    const embed = db.getEmbedById(job.embed_id); // Need to verify this method exists or similar
    const buttons = db.getEmbedButtons(job.embed_id);

    if (!embed) {
        return interaction.reply({
            content: '❌ Error loading embed data.',
            ephemeral: true
        });
    }

    scheduleSessions.set(sessionId, {
        jobId: job.id,
        embedId: job.embed_id,
        guildId: interaction.guild.id,
        channelId: job.channel_id,
        scheduledTime: new Date(job.scheduled_time),
        config: JSON.parse(embed.config), // Accessing raw DB row usually returns string for JSON columns
        buttons: buttons.map(b => ({
            label: b.label,
            style: b.style,
            url: b.url,
            // Re-map other button props if needed
        })),
        recurrence: job.recurrence || [],
        targetChannels: job.target_channels || (job.channel_id ? [job.channel_id] : []),
        isEdit: true
    });

    await renderDashboard(interaction, sessionId);
}

/**
 * Delete a scheduled message
 */
async function handleDelete(interaction) {
    const jobId = interaction.options.getString('subscription_id');
    const jobs = db.getPendingJobs();
    const job = jobs.find(j => j.id.toString() === jobId && j.guild_id === interaction.guild.id);

    if (!job) {
        return interaction.reply({
            content: '❌ Scheduled message not found.',
            ephemeral: true
        });
    }

    const { cancelScheduledPost } = require('../utils/scheduler');
    cancelScheduledPost(job.embed_id); // Scheduler uses embedId to cancel?
    // Wait, scheduler.js cancelScheduledPost takes embedId.
    // AND calls db.cancelScheduledJob(embedId).  So we are good.

    await interaction.reply({
        content: `✅ Scheduled message (ID: ${jobId}) has been cancelled.`,
        ephemeral: true
    });
}

/**
 * Render the main dashboard
 */
async function renderDashboard(interaction, sessionId) {
    const session = scheduleSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    // Preview
    const previewEmbed = buildEmbed(session.config);
    const previewButtons = buildButtons(session.buttons); // For visual preview only

    // Dashboard Info
    const statusEmbed = new EmbedBuilder()
        .setTitle(session.isEdit ? '✏️ Edit Scheduled Message' : '🪄 Create Scheduled Message')
        .setDescription('Use the controls below to configure your message.')
        .addFields(
            { name: '📍 Channels', value: session.targetChannels.length > 0 ? `${session.targetChannels.length} channel(s)` : '❌ Not Set', inline: true },
            { name: '🗓️ Time', value: session.scheduledTime ? `<t:${Math.floor(new Date(session.scheduledTime).getTime() / 1000)}:F>` : '❌ Not Set', inline: true },
            { name: '🔁 Recurrence', value: session.recurrence.length > 0 ? session.recurrence.join(', ') : 'One-time', inline: true },
            { name: '🔘 Buttons', value: `${session.buttons.length}`, inline: true }
        )
        .setColor(session.config.color || '#0099ff');

    // Controls
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sched_btn_content').setLabel('Edit Content').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
        new ButtonBuilder().setCustomId('sched_btn_images').setLabel('Images').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
        new ButtonBuilder().setCustomId('sched_btn_color').setLabel('Color').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
        new ButtonBuilder().setCustomId('sched_btn_buttons').setLabel('Buttons').setStyle(ButtonStyle.Secondary).setEmoji('🔘')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sched_btn_channels').setLabel('Set Channels').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
        new ButtonBuilder().setCustomId('sched_btn_time').setLabel('Set Time').setStyle(ButtonStyle.Secondary).setEmoji('🗓️'),
        new ButtonBuilder().setCustomId('sched_btn_recurrence').setLabel('Recurrence').setStyle(ButtonStyle.Secondary).setEmoji('🔁')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sched_btn_template').setLabel('Save as Template').setStyle(ButtonStyle.Primary).setEmoji('💾'),
        new ButtonBuilder().setCustomId('sched_btn_save').setLabel(session.isEdit ? 'Save Changes' : 'Schedule Message').setStyle(ButtonStyle.Success).setEmoji('✅')
    );

    const components = [row1, row2, row3];

    // Response
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content: '**Dashboard**',
            embeds: [statusEmbed, previewEmbed],
            components: components,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: '**Dashboard**',
            embeds: [statusEmbed, previewEmbed],
            components: components,
            ephemeral: true
        });
    }
}

/**
 * Handle Dashboard Interactions
 */
async function handleScheduleInteraction(interaction) {
    const customId = interaction.customId;
    const sessionId = interaction.user.id;
    const session = scheduleSessions.get(sessionId);

    if (!session) {
        return interaction.reply({ content: '❌ Session expired. Please run `/schedule create` again.', ephemeral: true });
    }

    // Modal Triggers
    if (customId === 'sched_btn_content') {
        const modal = new ModalBuilder().setCustomId('sched_modal_content').setTitle('Edit Content');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setValue(session.config.title || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setValue(session.config.description || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setValue(session.config.footer || '').setRequired(false))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_images') {
        const modal = new ModalBuilder().setCustomId('sched_modal_images').setTitle('Edit Images');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail URL').setStyle(TextInputStyle.Short).setValue(session.config.thumbnail || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Image URL').setStyle(TextInputStyle.Short).setValue(session.config.image || '').setRequired(false))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_time') {
        // Show Time Picker (Dropdowns for Hour/Minute)
        const hourSelect = new StringSelectMenuBuilder()
            .setCustomId('sched_select_hour')
            .setPlaceholder('Select Hour')
            .addOptions(Array.from({ length: 24 }, (_, i) => ({ label: i.toString().padStart(2, '0') + ':00', value: i.toString() })));

        const minuteSelect = new StringSelectMenuBuilder()
            .setCustomId('sched_select_minute')
            .setPlaceholder('Select Minute')
            .addOptions(['00', '15', '30', '45'].map(m => ({ label: m, value: m })));

        const dateRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sched_btn_set_date').setLabel('Set Date (Today if empty)').setStyle(ButtonStyle.Secondary).setEmoji('📅')
        );

        await interaction.reply({
            content: 'Select time for the scheduled message:',
            components: [
                new ActionRowBuilder().addComponents(hourSelect),
                new ActionRowBuilder().addComponents(minuteSelect),
                dateRow
            ],
            ephemeral: true
        });
    }
    else if (customId === 'sched_btn_set_date') {
        const modal = new ModalBuilder().setCustomId('sched_modal_date').setTitle('Set Date');
        // Default to tomorrow or today
        const d = session.scheduledTime ? new Date(session.scheduledTime) : new Date();
        const dateVal = d.toISOString().split('T')[0];
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (YYYY-MM-DD)').setStyle(TextInputStyle.Short).setPlaceholder('2024-12-31').setValue(dateVal).setRequired(true))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_recurrence') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const select = new StringSelectMenuBuilder()
            .setCustomId('sched_select_recurrence')
            .setPlaceholder('Select recurring days')
            .setMinValues(0)
            .setMaxValues(7)
            .addOptions(days.map(d => ({ label: d, value: d.toUpperCase().substring(0, 3) }))); // MON, TUE...

        // Pre-select if exists
        // Note: checking values in select menu builder requires exact value match
        // session.recurrence has MON, TUE.

        await interaction.reply({
            content: 'Select days for recurring message (Clear all for one-time):',
            components: [new ActionRowBuilder().addComponents(select)],
            ephemeral: true
        });
    }
    else if (customId === 'sched_btn_channels') {
        const select = new ChannelSelectMenuBuilder()
            .setCustomId('sched_select_channels')
            .setPlaceholder('Select channels')
            .setMinValues(1)
            .setMaxValues(10) // Reasonable limit
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({
            content: 'Select the channel(s) where the message will be posted:',
            components: [row],
            ephemeral: true
        });
    }
    else if (customId === 'sched_btn_template') {
        const modal = new ModalBuilder().setCustomId('sched_modal_template_name').setTitle('Save Template');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Template Name').setStyle(TextInputStyle.Short).setRequired(true))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_buttons') {
        // Show sub-menu for buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sched_btn_add_button').setLabel('Add Button').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId('sched_btn_remove_button').setLabel('Remove Button').setStyle(ButtonStyle.Danger).setEmoji('➖').setDisabled(session.buttons.length === 0),
            new ButtonBuilder().setCustomId('sched_btn_back').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
        );

        await interaction.update({
            content: '**Manage Buttons**',
            components: [row] // Keep embeds? Maybe logic to just show button manager
        });
    }
    else if (customId === 'sched_btn_add_button') {
        if (session.buttons.length >= 25) return interaction.reply({ content: 'Max buttons reached', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('sched_modal_add_button').setTitle('Add Button');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL (Optional)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('style').setLabel('Style (Primary, Secondary, Success, Danger)').setStyle(TextInputStyle.Short).setPlaceholder('Primary').setRequired(false))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_remove_button') {
        const select = new StringSelectMenuBuilder()
            .setCustomId('sched_select_remove_button')
            .setPlaceholder('Select button to remove')
            .addOptions(session.buttons.map((b, i) => ({ label: b.label, value: i.toString() })));

        await interaction.update({ components: [new ActionRowBuilder().addComponents(select)] });
    }
    else if (customId === 'sched_btn_back') {
        await renderDashboard(interaction, sessionId);
    }
    else if (customId === 'sched_btn_color') {
        // Simple color select or modal? Let's use modal for hex or select for presets
        // Existing bot uses select menu for color usually.
        // Let's use a modal for HEX code for maximum freedom, or a select menu with basic colors.
        // Let's reuse the logic from `embedBuilder` if possible, but for now simple Modal for Hex.
        const modal = new ModalBuilder().setCustomId('sched_modal_color').setTitle('Set Color');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Hex Color').setStyle(TextInputStyle.Short).setPlaceholder('#FF0000').setValue(session.config.color || '').setRequired(true))
        );
        await interaction.showModal(modal);
    }
    else if (customId === 'sched_btn_save') {
        // VALIDATION
        if (session.targetChannels.length === 0) return interaction.reply({ content: '❌ At least one channel is required!', ephemeral: true });
        if (!session.scheduledTime) return interaction.reply({ content: '❌ Time is required!', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        // Save logic
        try {
            if (session.isEdit) {
                // Update Existing
                db.updateEmbedConfig(session.embedId, session.config);
                db.deleteEmbedButtons(session.embedId);
                if (session.buttons.length > 0) db.createButtons(session.embedId, session.buttons);

                // Update Scheduled Job
                db.updateScheduledJob(
                    session.jobId,
                    session.scheduledTime.toISOString(),
                    session.recurrence.length > 0 ? session.recurrence : null,
                    session.targetChannels,
                    session.config.title // Use title as name for now, or null
                );

                // Re-schedule in memory
                const { cancelScheduledPost } = require('../utils/scheduler');
                cancelScheduledPost(session.embedId);

                createScheduledPost({
                    embedId: session.embedId,
                    targetChannels: session.targetChannels,
                    guildId: session.guildId,
                    config: session.config,
                    scheduledTime: session.scheduledTime.toISOString(),
                    recurrence: session.recurrence.length > 0 ? session.recurrence : null,
                    name: session.config.title
                });

            } else {
                // Create New
                // For multiple channels, we still create one "Embed" record as the source of truth/config?
                // Yes, db.createEmbed takes a channelId but it's mainly for "where was this created" or "primary channel".
                // With multi-channel, we might just store the first one or leave it null?
                // Schema says channel_id NOT NULL. Let's use first target channel.

                const embedId = db.createEmbed({
                    channelId: session.targetChannels[0],
                    guildId: session.guildId,
                    config: session.config,
                    scheduledTime: session.scheduledTime.toISOString(),
                    createdBy: interaction.user.id
                });

                if (session.buttons.length > 0) {
                    db.createButtons(embedId, session.buttons);
                }

                createScheduledPost({
                    embedId,
                    targetChannels: session.targetChannels,
                    guildId: session.guildId,
                    config: session.config,
                    scheduledTime: session.scheduledTime.toISOString(),
                    recurrence: session.recurrence.length > 0 ? session.recurrence : null,
                    name: session.config.title
                });
            }

            await interaction.editReply({ content: '✅ Scheduled successfully!' });
            scheduleSessions.delete(sessionId);

        } catch (e) {
            console.error(e);
            await interaction.editReply({ content: 'Error saving: ' + e.message });
        }
    }
}

/**
 * Handle Schedule Modals
 */
async function handleScheduleModal(interaction) {
    const customId = interaction.customId;
    const sessionId = interaction.user.id;
    const session = scheduleSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    if (customId === 'sched_modal_content') {
        session.config.title = interaction.fields.getTextInputValue('title');
        session.config.description = interaction.fields.getTextInputValue('description');
        session.config.footer = interaction.fields.getTextInputValue('footer');
    }
    else if (customId === 'sched_modal_images') {
        session.config.thumbnail = interaction.fields.getTextInputValue('thumbnail');
        session.config.image = interaction.fields.getTextInputValue('image');
    }
    else if (customId === 'sched_modal_time') {
        const date = interaction.fields.getTextInputValue('date');
        const time = interaction.fields.getTextInputValue('time');
        const dt = parseDateTime(date, time);
        if (!dt) return interaction.reply({ content: 'Invalid Format', ephemeral: true });
        if (dt <= new Date()) return interaction.reply({ content: 'Time must be in future', ephemeral: true });
        session.scheduledTime = dt;
    }
    else if (customId === 'sched_modal_color') {
        session.config.color = interaction.fields.getTextInputValue('color');
    }
    else if (customId === 'sched_modal_add_button') {
        const label = interaction.fields.getTextInputValue('label');
        const url = interaction.fields.getTextInputValue('url');
        const styleStr = interaction.fields.getTextInputValue('style').toUpperCase(); // validate later

        let style = ButtonStyle.Primary;
        if (url) style = ButtonStyle.Link;
        else if (styleStr === 'SECONDARY') style = ButtonStyle.Secondary;
        else if (styleStr === 'SUCCESS') style = ButtonStyle.Success;
        else if (styleStr === 'DANGER') style = ButtonStyle.Danger;

        session.buttons.push({
            label,
            url: url || null,
            style: style,
            custom_id: url ? null : `btn_${Date.now()}` // placeholder
        });
    }
    else if (customId === 'sched_modal_date') {
        const dateStr = interaction.fields.getTextInputValue('date');
        // We preserve existing time if set
        const current = session.scheduledTime ? new Date(session.scheduledTime) : new Date();
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return interaction.reply({ content: 'Invalid Date', ephemeral: true });

        d.setHours(current.getHours(), current.getMinutes(), 0, 0);
        if (d <= new Date()) return interaction.reply({ content: 'Time must be in future', ephemeral: true });

        session.scheduledTime = d;
    }
    else if (customId === 'sched_modal_template_name') {
        const name = interaction.fields.getTextInputValue('name');
        try {
            const templateId = db.createTemplate(
                session.guildId,
                name,
                'Scheduled Messages',
                session.config,
                interaction.user.id
            );
            if (session.buttons.length > 0) {
                db.createTemplateButtons(templateId, session.buttons);
            }
            await interaction.reply({ content: `✅ Template **${name}** saved!`, ephemeral: true });
            return; // Don't render dashboard because we replied
        } catch (e) {
            await interaction.reply({ content: `❌ Error saving template: ${e.message}`, ephemeral: true });
            return;
        }
    }

    // Refresh Dashboard
    await renderDashboard(interaction, sessionId);
} const dateStr = interaction.fields.getTextInputValue('date');
// We preserve existing time if set
const current = session.scheduledTime ? new Date(session.scheduledTime) : new Date();
// Reset to date 00:00 then add time
// Actually, easier to just parse date and keep time
const d = new Date(dateStr);
if (isNaN(d.getTime())) return interaction.reply({ content: 'Invalid Date', ephemeral: true });

d.setHours(current.getHours(), current.getMinutes(), 0, 0);
if (d <= new Date()) return interaction.reply({ content: 'Time must be in future', ephemeral: true });

session.scheduledTime = d;
await renderDashboard(interaction, sessionId);
    }
    else if (customId === 'sched_modal_template_name') {
    const name = interaction.fields.getTextInputValue('name');
    try {
        // Save as template
        const templateId = db.createTemplate(
            session.guildId,
            name,
            'Scheduled Messages',
            session.config,
            interaction.user.id
        );
        if (session.buttons.length > 0) {
            db.createTemplateButtons(templateId, session.buttons);
        }
        await interaction.reply({ content: `✅ Template **${name}** saved!`, ephemeral: true });
    } catch (e) {
        await interaction.reply({ content: `❌ Error saving template: ${e.message}`, ephemeral: true });
    }
}

/**
 * Handle Schedule Selects
 */
async function handleScheduleSelect(interaction) {
    const customId = interaction.customId;
    const sessionId = interaction.user.id;
    const session = scheduleSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Session expired', ephemeral: true });

    if (customId === 'sched_select_channel') {
        session.channelId = interaction.values[0];
        // Note: component reply interaction handling is tricky if we did `reply` before.
        // We used `reply` for the select menu. So we need to use `update` or `editReply`.
        // Actually, for channel select, we sent a new ephemeral message.
        // We should just confirm and re-render dashboard interaction?
        // But dashboard is on the ORIGINAL interaction message.
        await interaction.update({ content: `Channel set to <#${session.channelId}>`, components: [] });
        // We might want to re-render the dashboard which is in the previous message.
        // Since we can't easily edit the OTHER message (dashboard) from here without its webhook/token if we lost reference (which we have in session?),
        // Actually, we can just say "Channel Set" and user clicks "Dismiss" or we assume user goes back.
        // Better: We stored session. User goes back to dashboard message (buttons) and clicks another button, it will refresh.
        // Or we could try to re-send dashboard here?
        // Let's just create a new dashboard message or try to edit if possible.
        // Simpler: Just tell them to go back.
    }
    else if (customId === 'sched_select_remove_button') {
        const index = parseInt(interaction.values[0]);
        session.buttons.splice(index, 1);
        await renderDashboard(interaction, sessionId);
    }
    else if (customId === 'sched_select_hour') {
        const hour = parseInt(interaction.values[0]);
        if (!session.scheduledTime) session.scheduledTime = new Date();
        session.scheduledTime.setHours(hour);
        if (session.scheduledTime <= new Date()) {
            // If today and passed, might look weird, but let user fix it.
            // Or default to tomorrow?
            // Let's just update.
        }
        await interaction.update({ content: `Hour set to ${hour}`, components: [] });
        // We really should just have a "Back" or auto-refresh if it was a menu
        // Since we replied with a menu, we can just delete it or update it says "Saved"
    }
    else if (customId === 'sched_select_minute') {
        const minute = parseInt(interaction.values[0]);
        if (!session.scheduledTime) session.scheduledTime = new Date();
        session.scheduledTime.setMinutes(minute);
        await interaction.update({ content: `Minute set to ${minute}`, components: [] });
    }
    else if (customId === 'sched_select_recurrence') {
        session.recurrence = interaction.values;
        await interaction.update({ content: `Recurrence set: ${session.recurrence.join(', ')}`, components: [] });
    }
    else if (customId === 'sched_select_channels') {
        session.targetChannels = interaction.values;
        await interaction.update({ content: `Channels set: ${session.targetChannels.length} selected`, components: [] });
    }
}

module.exports = {
    handleCreate,
    handleList,
    handleEdit,
    handleDelete,
    handleScheduleInteraction,
    handleScheduleModal,
    handleScheduleSelect
};
