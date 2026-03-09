const { SlashCommandBuilder } = require('discord.js');
const { getHelpOverview } = require('../handlers/helpHandler');
const { checkPermissions } = require('../middleware/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show Kitsch Bot comprehensive guide and commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the guide for yourself (ephemeral)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deploy')
                .setDescription('Post the interactive guide publicly to the current channel')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand(false) || 'view';

        if (subcommand === 'deploy') {
            // Permission check for deployment
            const { allowed, message } = checkPermissions(interaction);
            if (!allowed) {
                return interaction.reply({ content: message, ephemeral: true });
            }

            const overview = getHelpOverview();
            // Deploy publicly
            await interaction.reply({
                content: '✨ **Bot Guide Deployed**',
                embeds: overview.embeds,
                components: overview.components,
                ephemeral: false
            });
        } else {
            // Default: View ephemeral
            const overview = getHelpOverview();
            await interaction.reply({
                embeds: overview.embeds,
                components: overview.components,
                ephemeral: true
            });
        }
    },
};
