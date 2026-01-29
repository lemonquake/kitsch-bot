const { buildSessions } = require('../commands/embed');
const { showButtonsStep } = require('./modalHandler');

/**
 * Handle select menu interactions
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('embed_color_select_')) {
        await handleColorSelect(interaction);
    } else if (customId.startsWith('embed_button_style_')) {
        await handleButtonStyleSelect(interaction);
    }
}

/**
 * Handle color selection
 */
async function handleColorSelect(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const selectedColor = interaction.values[0];
    session.config.color = selectedColor;
    buildSessions.set(sessionId, session);

    const { showImagesStep } = require('./modalHandler');
    await showImagesStep(interaction, sessionId);
}

/**
 * Handle button style selection
 */
async function handleButtonStyleSelect(interaction) {
    const sessionId = interaction.customId.split('_').pop();
    const session = buildSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true,
        });
    }

    const selectedStyle = interaction.values[0];
    session.pendingButtonStyle = selectedStyle;
    buildSessions.set(sessionId, session);

    await interaction.update({
        content: `Selected style: **${selectedStyle}**`,
        components: [],
    });
}

module.exports = {
    handleSelectMenu,
};
