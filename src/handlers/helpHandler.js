const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

/**
 * Get the main help overview embed and components
 * @returns {Object} { embeds: [EmbedBuilder], components: [ActionRowBuilder] }
 */
function getHelpOverview() {
    const embed = new EmbedBuilder()
        .setTitle('✨ Kitsch Bot: The ultimate Guide')
        .setDescription('Welcome to the official **Kitsch Bot**, your super-powered assistant designed for high-end aesthetics and premium server management.\n\nSelect a category below to explore the full suite of features and commands.')
        .setColor(config.colors.kitsch)
        .addFields(
            { name: '🚀 Getting Started', value: 'Basic commands and core features', inline: true },
            { name: '🎨 Embed Builder', value: 'Create stunning interactive announcements', inline: true },
            { name: '📅 Scheduling', value: 'Automate your server updates', inline: true },
            { name: '🔗 Webhooks', value: 'Post with custom names and avatars', inline: true },
            { name: '🎫 Support & FAQ', value: 'Tickets and Knowledge Base setup', inline: true }
        )
        .setFooter({ text: 'Kitsch Bot • Select a category to proceed' })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Explore Kitsch Bot Features...')
        .addOptions([
            {
                label: 'Getting Started',
                description: 'Core commands and basic usage',
                value: 'getting_started',
                emoji: '🚀'
            },
            {
                label: 'Embed Builder',
                description: 'How to create and edit premium embeds',
                value: 'embed_builder',
                emoji: '🎨'
            },
            {
                label: 'Scheduling & Templates',
                description: 'Managing future posts and reusable designs',
                value: 'scheduling',
                emoji: '📅'
            },
            {
                label: 'Webhooks',
                description: 'Using custom identities for your posts',
                value: 'webhooks',
                emoji: '🔗'
            },
            {
                label: 'Tickets & FAQ',
                description: 'Support systems and knowledge base',
                value: 'support',
                emoji: '🎫'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return { embeds: [embed], components: [row] };
}

/**
 * Handle category selection in the help menu
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleHelpSelect(interaction) {
    const category = interaction.values[0];
    let embed = new EmbedBuilder().setColor(config.colors.kitsch);

    switch (category) {
        case 'getting_started':
            embed.setTitle('🚀 Getting Started')
                .setDescription('Kitsch Bot uses slash commands for all interactions. Here are the core commands to get you moving:')
                .addFields(
                    { name: '`/embed create`', value: 'Start the interactive builder to post or schedule an embed.' },
                    { name: '`/help` or `/guide`', value: 'You\'re looking at it! View the comprehensive guide.' },
                    { name: '`/forum post`', value: 'Create high-end threads in your server forum channels.' },
                    { name: '💓 Server Pulse', value: 'Setup automated server status updates with `/pulse setup`.' }
                );
            break;

        case 'embed_builder':
            embed.setTitle('🎨 The Ultimate Embed Builder')
                .setDescription('Our multi-step builder allows for unmatched customization:')
                .addFields(
                    { name: 'Step 1: Content', value: 'Enter your Title, body text (Markdown supported), Author, and Footer.' },
                    { name: 'Step 2: Visual Style', value: 'Pick from our curated color palette, including signature **Kitsch Pink**.' },
                    { name: 'Step 3: Media', value: 'Add High-resolution banners and thumbnails via image URLs.' },
                    { name: 'Step 4: Interaction', value: 'Add up to 25 interactive buttons (5 rows of 5) for links or custom triggers.' }
                )
                .setFooter({ text: '💡 Tip: Use the Live Preview button to see your work before posting!' });
            break;

        case 'scheduling':
            embed.setTitle('📅 Scheduling & Templates')
                .setDescription('Efficiency is key to a premium server. Kitsch Bot makes it easy to plan ahead.')
                .addFields(
                    { name: '⏰ Smart Scheduling', value: 'Choose "Schedule for Later" in the builder to pick a precise Date and Time for your post.' },
                    { name: '📂 Template System', value: 'Use `/template save` to store your complex designs and reuse them instantly with `/template use` or via the builder.' },
                    { name: '📌 Sticky Announcements', value: 'Use `/embed sticky` to keep an announcement pinned to the bottom of any channel indefinitely.' }
                );
            break;

        case 'webhooks':
            embed.setTitle('🔗 Webhook Integration')
                .setDescription('Break the limits of standard봇 posting. Send embeds under any name and avatar you choose.')
                .addFields(
                    { name: '1. Register', value: 'Use `/webhook create` to link a channel with a custom name/avatar.' },
                    { name: '2. Post', value: 'Use `/webhook post` for quick messages or click **Post as Webhook** in the Embed Builder final step.' },
                    { name: '🔑 Permissions', value: 'Administrators and those with the "Manage Webhooks" permission can manage these links.' }
                );
            break;

        case 'support':
            embed.setTitle('🎫 Support & Knowledge Base')
                .setDescription('Provide professional tier support for your community members.')
                .addFields(
                    { name: '✨ Knowledge Base', value: 'Setup `/faq add` for your common questions and `/faq deploy` for a sleek interactive menu.' },
                    { name: '🎫 Ticket System', value: 'Create hubs for support tickets. Users can open private requests and admins can manage them through the bot.' },
                    { name: '📜 Transcripts', value: 'View past ticket history and full message logs using `/ticket view id:ID`.' }
                );
            break;
    }

    const backButton = new ButtonBuilder()
        .setCustomId('help_back_home')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏠');

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

/**
 * Handle "Back to Home" button click
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleHelpBack(interaction) {
    const overview = getHelpOverview();
    await interaction.update({
        embeds: overview.embeds,
        components: overview.components
    });
}

module.exports = {
    getHelpOverview,
    handleHelpSelect,
    handleHelpBack
};
