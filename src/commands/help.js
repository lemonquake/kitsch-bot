const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show Kitsch Bot commands and information'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('✨ Kitsch Bot Help')
            .setDescription('A high-end embed builder and scheduler for Discord.')
            .setColor(config.colors.kitsch)
            .addFields(
                {
                    name: '📝 Create Embed',
                    value: '`/embed create #channel` - Create a new customizable embed',
                    inline: false,
                },
                {
                    name: '✏️ Edit Embed',
                    value: '`/embed edit <message_id>` - Edit an existing embed by its message ID',
                    inline: false,
                },
                {
                    name: '📋 List Embeds',
                    value: '`/embed list` - View all embeds created in this server',
                    inline: false,
                },
                {
                    name: '🔐 Required Roles',
                    value: config.allowedRoles.map(r => `• ${r}`).join('\n'),
                    inline: true,
                },
                {
                    name: '🎨 Features',
                    value: '• Custom colors\n• Images & thumbnails\n• Interactive buttons\n• Scheduled posts',
                    inline: true,
                }
            )
            .setFooter({ text: 'Kitsch Bot • Made with 💖' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
