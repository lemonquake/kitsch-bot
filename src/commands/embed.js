const {
    SlashCommandBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');
const { buildEmbed, getColorOptions } = require('../utils/embedBuilder');
const { buildButtons, getButtonStyleOptions } = require('../utils/buttonBuilder');
const { createScheduledPost, parseDateTime, getRelativeTime } = require('../utils/scheduler');
const db = require('../database/db');

// Temporary storage for embed building sessions
const buildSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create, edit, and schedule customizable embeds')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new embed message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the embed')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
                .addStringOption(option =>
                    option
                        .setName('schedule')
                        .setDescription('When to post the embed')
                        .addChoices(
                            { name: 'Post Now', value: 'now' },
                            { name: 'Schedule for Later', value: 'schedule' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('template')
                        .setDescription('Start from a saved template')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing embed message')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID of the embed to edit')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all embeds in this server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('sticky')
                .setDescription('Manage sticky embeds in this channel')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Set Sticky', value: 'set' },
                            { name: 'Remove Sticky', value: 'remove' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID of the embed to make sticky (only for "set")')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        // Permission check
        const { allowed, message } = checkPermissions(interaction);
        if (!allowed) {
            return interaction.reply({ content: message, ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreate(interaction);
                break;
            case 'edit':
                await handleEdit(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'sticky':
                await handleSticky(interaction);
                break;
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'template') {
            const focusedValue = focusedOption.value;
            const templates = db.getTemplates(interaction.guild.id);

            const filtered = templates.filter(t =>
                t.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            await interaction.respond(
                filtered.slice(0, 25).map(t => ({ name: t.name, value: t.name }))
            );
        }
    },
};

/**
 * Handle embed creation
 */
async function handleCreate(interaction) {
    const channel = interaction.options.getChannel('channel');
    const scheduleOption = interaction.options.getString('schedule') || 'now';
    const templateName = interaction.options.getString('template');

    let initialConfig = {};
    let initialButtons = [];

    // Load template if selected
    if (templateName) {
        const template = db.getTemplateByName(interaction.guild.id, templateName);
        if (template) {
            initialConfig = template.config;
            const buttons = db.getTemplateButtons(template.id);
            // Map buttons to match session format
            initialButtons = buttons.map(b => ({
                label: b.label,
                style: b.style,
                url: b.url,
                customId: b.custom_id,
                rowIndex: b.row_index,
                position: b.position
            }));
        } else {
            return interaction.reply({
                content: `❌ Template **${templateName}** not found.`,
                ephemeral: true,
            });
        }
    }

    // Initialize session
    const sessionId = interaction.user.id;
    buildSessions.set(sessionId, {
        channelId: channel.id,
        guildId: interaction.guild.id,
        scheduleOption: scheduleOption,
        config: initialConfig,
        buttons: initialButtons,
        step: 'content',
    });

    // Validates config values for initial population
    const titleValue = initialConfig.title || '';
    const descriptionValue = initialConfig.description || '';
    const authorValue = initialConfig.author || '';
    const footerValue = initialConfig.footer || '';

    // Show content modal
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

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter embed description... (supports markdown)')
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
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(authorInput),
        new ActionRowBuilder().addComponents(footerInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle embed editing
 */
async function handleEdit(interaction) {
    const messageId = interaction.options.getString('message_id');

    // Look up embed in database
    const embedData = db.getEmbedByMessageId(messageId);

    if (!embedData) {
        return interaction.reply({
            content: '❌ Embed not found. Make sure the message ID is correct and was created with Kitsch Bot.',
            ephemeral: true,
        });
    }

    // Check if embed belongs to this guild
    if (embedData.guild_id !== interaction.guild.id) {
        return interaction.reply({
            content: '❌ This embed belongs to another server.',
            ephemeral: true,
        });
    }

    // Initialize edit session with existing config
    const sessionId = interaction.user.id;
    buildSessions.set(sessionId, {
        channelId: embedData.channel_id,
        guildId: embedData.guild_id,
        messageId: messageId,
        embedId: embedData.id,
        config: embedData.config,
        buttons: db.getEmbedButtons(embedData.id).map(b => ({
            label: b.label,
            style: b.style,
            url: b.url,
            customId: b.custom_id,
            rowIndex: b.row_index,
            position: b.position
        })),
        isEdit: true,
        step: 'content',
    });

    // Show content modal with existing values
    const modal = new ModalBuilder()
        .setCustomId(`embed_content_${sessionId}`)
        .setTitle('✏️ Edit Kitsch Embed');

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter embed title...')
        .setMaxLength(256)
        .setRequired(false)
        .setValue(embedData.config.title || '');

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter embed description...')
        .setMaxLength(4000)
        .setRequired(false)
        .setValue(embedData.config.description || '');

    const authorInput = new TextInputBuilder()
        .setCustomId('author')
        .setLabel('Author Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter author name...')
        .setMaxLength(256)
        .setRequired(false)
        .setValue(embedData.config.author || '');

    const footerInput = new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter footer text...')
        .setMaxLength(2048)
        .setRequired(false)
        .setValue(embedData.config.footer || '');

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(authorInput),
        new ActionRowBuilder().addComponents(footerInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle listing embeds
 */
async function handleList(interaction) {
    const embeds = db.getGuildEmbeds(interaction.guild.id);

    if (embeds.length === 0) {
        return interaction.reply({
            content: '📭 No embeds found in this server.',
            ephemeral: true,
        });
    }

    const embedList = embeds.slice(0, 10).map((embed, index) => {
        const title = embed.config.title || 'Untitled';
        const date = new Date(embed.created_at).toLocaleDateString();
        return `${index + 1}. **${title}** - \`${embed.message_id}\` (${date})`;
    }).join('\n');

    await interaction.reply({
        content: `📋 **Recent Embeds in ${interaction.guild.name}**\n\n${embedList}\n\nUse \`/embed edit <message_id>\` to edit an embed.`,
        ephemeral: true,
    });
}

/**
 * Handle sticky embeds
 */
async function handleSticky(interaction) {
    const action = interaction.options.getString('action');
    const messageId = interaction.options.getString('message_id');

    if (action === 'set') {
        if (!messageId) {
            return interaction.reply({
                content: '❌ Please provide a message ID when setting a sticky embed.',
                ephemeral: true,
            });
        }

        const embedData = db.getEmbedByMessageId(messageId);
        if (!embedData) {
            return interaction.reply({
                content: '❌ Embed not found. Make sure the message ID is correct.',
                ephemeral: true,
            });
        }

        if (embedData.guild_id !== interaction.guild.id) {
            return interaction.reply({
                content: '❌ This embed belongs to another server.',
                ephemeral: true,
            });
        }

        // Create the sticky record
        db.createStickyEmbed(embedData.id, interaction.channel.id, interaction.guild.id);

        await interaction.reply({
            content: `✅ Sticky embed set! This announcement will now stay at the bottom of <#${interaction.channel.id}>.`,
            ephemeral: true,
        });

        // Trigger the first reposition manually by sending a dummy message that will be handled by messageCreate
        // Or better yet, just let the next message do it, or manually call the send logic.
        // For better UX, we'll wait for the next message.
    } else if (action === 'remove') {
        db.removeStickyEmbed(interaction.channel.id);
        await interaction.reply({
            content: '✅ Sticky embed removed from this channel.',
            ephemeral: true,
        });
    }
}

// Export session management for handlers
module.exports.buildSessions = buildSessions;
