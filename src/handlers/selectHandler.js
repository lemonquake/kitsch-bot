const { buildSessions } = require('../commands/embed');
const { showButtonsStep } = require('./modalHandler');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');

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
    } else if (customId === 'faq_category_select') {
        await handleFAQCategorySelect(interaction);
    } else if (customId === 'faq_question_select') {
        await handleFAQQuestionSelect(interaction);
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

/**
 * Handle FAQ category selection
 */
async function handleFAQCategorySelect(interaction) {
    const category = interaction.values[0];
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
 * Handle FAQ question selection
 */
async function handleFAQQuestionSelect(interaction) {
    const faqId = parseInt(interaction.values[0]);
    const faq = db.getFAQById(faqId);

    if (!faq) return interaction.update({ content: '❌ FAQ no longer exists.', components: [] });

    const embed = new EmbedBuilder()
        .setTitle(`❓ ${faq.question}`)
        .setDescription(faq.answer)
        .setColor('#FF69B4')
        .setFooter({ text: `Category: ${faq.category}` });

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`faq_back_to_questions_${faq.category}`)
            .setLabel('Back to Questions')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️'),
        new ButtonBuilder()
            .setCustomId('faq_back_to_categories')
            .setLabel('Back to Categories')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
        embeds: [embed],
        components: [backRow]
    });
}

module.exports = {
    handleSelectMenu,
};
