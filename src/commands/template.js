const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ChannelType,
} = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');
const { buildEmbed } = require('../utils/embedBuilder');
const { buildButtons } = require('../utils/buttonBuilder');
const db = require('../database/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('template')
        .setDescription('Manage embed templates')
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Save a new template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Unique name for the template')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category (e.g., Announcements, Events)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all templates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('use')
                .setDescription('Use a template to create an embed')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the template to use')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post to')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the template to delete')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview a template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the template to preview')
                        .setRequired(true)
                        .setAutocomplete(true)
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
            case 'save':
                await handleSave(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'use':
                await handleUse(interaction);
                break;
            case 'delete':
                await handleDelete(interaction);
                break;
            case 'preview':
                await handlePreview(interaction);
                break;
        }
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const templates = db.getTemplates(interaction.guild.id);

        const filtered = templates.filter(t =>
            t.name.toLowerCase().includes(focusedValue.toLowerCase())
        );

        await interaction.respond(
            filtered.slice(0, 25).map(t => ({ name: t.name, value: t.name }))
        );
    },
};

/**
 * Handle saving a template
 */
async function handleSave(interaction) {
    const name = interaction.options.getString('name');
    const category = interaction.options.getString('category') || 'General';

    // Check if name already exists
    const existing = db.getTemplateByName(interaction.guild.id, name);
    if (existing) {
        return interaction.reply({
            content: `❌ A template named **${name}** already exists. Please choose a different name.`,
            ephemeral: true,
        });
    }

    // Show modal to define content
    const modal = new ModalBuilder()
        .setCustomId(`template_save_${name}_${category}`)
        .setTitle(`Create Template: ${name}`);

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
        .setPlaceholder('Enter embed description...')
        .setMaxLength(4000)
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Color (Hex or Name)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#FF69B4 or Pink')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(colorInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle listing templates
 */
async function handleList(interaction) {
    const templates = db.getTemplates(interaction.guild.id);

    if (templates.length === 0) {
        return interaction.reply({
            content: '📭 No templates found in this server. Create one with `/template save`.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📂 Embed Templates')
        .setColor('#FF69B4')
        .setDescription(
            templates
                .map(t => `**${t.name}** (${t.category})\n└ *${t.config.title || 'No Title'}*`)
                .join('\n\n')
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle using a template
 */
async function handleUse(interaction) {
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel');

    const template = db.getTemplateByName(interaction.guild.id, name);
    if (!template) {
        return interaction.reply({
            content: `❌ Template **${name}** not found.`,
            ephemeral: true,
        });
    }

    const buttons = db.getTemplateButtons(template.id);
    const embed = buildEmbed(template.config);
    const components = buildButtons(buttons);

    try {
        await channel.send({
            embeds: [embed],
            components: components,
        });

        await interaction.reply({
            content: `✅ Template **${name}** posted to ${channel}!`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error using template:', error);
        await interaction.reply({
            content: '❌ Failed to post template. Check bot permissions.',
            ephemeral: true,
        });
    }
}

/**
 * Handle deleting a template
 */
async function handleDelete(interaction) {
    const name = interaction.options.getString('name');

    const template = db.getTemplateByName(interaction.guild.id, name);
    if (!template) {
        return interaction.reply({
            content: `❌ Template **${name}** not found.`,
            ephemeral: true,
        });
    }

    db.deleteTemplate(template.id);

    await interaction.reply({
        content: `✅ Template **${name}** deleted.`,
        ephemeral: true,
    });
}

/**
 * Handle previewing a template
 */
async function handlePreview(interaction) {
    const name = interaction.options.getString('name');

    const template = db.getTemplateByName(interaction.guild.id, name);
    if (!template) {
        return interaction.reply({
            content: `❌ Template **${name}** not found.`,
            ephemeral: true,
        });
    }

    const buttons = db.getTemplateButtons(template.id);
    const embed = buildEmbed(template.config);
    const components = buildButtons(buttons);

    await interaction.reply({
        content: `👁️ **Preview: ${template.name}**`,
        embeds: [embed],
        components: components,
        ephemeral: true,
    });
}
