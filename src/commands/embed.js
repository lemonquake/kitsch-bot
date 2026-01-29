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
                        .setRequired(false)
                        .addChoices(
                            { name: 'Post Now', value: 'now' },
                            { name: 'Schedule for Later', value: 'schedule' }
                        )
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
        }
    },
};

/**
 * Handle embed creation
 */
async function handleCreate(interaction) {
    const channel = interaction.options.getChannel('channel');
    const scheduleOption = interaction.options.getString('schedule') || 'now';

    // Initialize session
    const sessionId = interaction.user.id;
    buildSessions.set(sessionId, {
        channelId: channel.id,
        guildId: interaction.guild.id,
        scheduleOption: scheduleOption,
        config: {},
        buttons: [],
        step: 'content',
    });

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
        .setRequired(false);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter embed description... (supports markdown)')
        .setMaxLength(4000)
        .setRequired(false);

    const authorInput = new TextInputBuilder()
        .setCustomId('author')
        .setLabel('Author Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter author name...')
        .setMaxLength(256)
        .setRequired(false);

    const footerInput = new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter footer text...')
        .setMaxLength(2048)
        .setRequired(false);

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
        buttons: db.getEmbedButtons(embedData.id),
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

// Export session management for handlers
module.exports.buildSessions = buildSessions;
