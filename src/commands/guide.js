const { SlashCommandBuilder } = require('discord.js');
const { getHelpOverview } = require('../handlers/helpHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('View the official Kitsch Bot guide and command list'),

    async execute(interaction) {
        const overview = getHelpOverview();

        // Guide is public by default as per original code, but interactive help is often better ephemeral.
        // The original code was public. Let's keep it public for /guide.
        await interaction.reply({
            embeds: overview.embeds,
            components: overview.components
        });
    },
};
