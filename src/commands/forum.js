const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');

const FORUM_CHANNEL_ID = '1464315910427771106';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forum')
        .setDescription('Forum related commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Create a new post in the forum')
        ),

    async execute(interaction) {
        // Permission check
        const { allowed, message } = checkPermissions(interaction);
        if (!allowed) {
            return interaction.reply({ content: message, ephemeral: true });
        }

        const sessionId = interaction.user.id;

        // Create the modal
        const modal = new ModalBuilder()
            .setCustomId(`forum_post_${sessionId}`)
            .setTitle('📝 Create Forum Post');

        // Add inputs to the modal
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

        // Action rows
        const firstRow = new ActionRowBuilder().addComponents(titleInput);
        const secondRow = new ActionRowBuilder().addComponents(contentInput);

        // Add rows to modal
        modal.addComponents(firstRow, secondRow);

        // Show the modal to the user
        await interaction.showModal(modal);
    },

    FORUM_CHANNEL_ID: FORUM_CHANNEL_ID
};
