const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Build the Mod Control Panel embed
 * @param {import('discord.js').Guild} guild - The Discord guild
 * @returns {EmbedBuilder}
 */
function buildPanelEmbed(guild) {
    const embed = new EmbedBuilder()
        .setTitle('✨ Kitsch Mod Panel')
        .setDescription(
            '> Your all-in-one control center for managing the server.\n' +
            '> Use the buttons below to access any tool instantly.\n\n' +
            '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n' +
            '📝 **Content**  —  Create embeds, use templates, post to forums\n' +
            '📋 **Management**  —  Schedules, hubs, tickets, FAQ\n' +
            '🛠️ **Tools**  —  Server pulse, webhooks, help guide\n\n' +
            '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**'
        )
        .setColor(0xFF69B4) // Kitsch Pink
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setFooter({
            text: `${guild.name}  •  Kitsch Bot Panel`,
            iconURL: guild.iconURL({ dynamic: true, size: 64 }),
        })
        .setTimestamp();

    return embed;
}

/**
 * Build the panel action buttons (3 rows)
 * @returns {ActionRowBuilder[]}
 */
function buildPanelButtons() {
    // ── Row 1: Content ──
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('panel_create_embed')
            .setLabel('Create Embed')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId('panel_templates')
            .setLabel('Templates')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId('panel_forum_post')
            .setLabel('Forum Post')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📢'),
    );

    // ── Row 2: Management ──
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('panel_schedules')
            .setLabel('Schedules')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗓️'),
        new ButtonBuilder()
            .setCustomId('panel_hubs')
            .setLabel('Hubs')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏠'),
        new ButtonBuilder()
            .setCustomId('panel_tickets')
            .setLabel('Tickets')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎫'),
        new ButtonBuilder()
            .setCustomId('panel_faq')
            .setLabel('FAQ')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❓'),
    );

    // ── Row 3: Tools ──
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('panel_pulse')
            .setLabel('Pulse')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💓'),
        new ButtonBuilder()
            .setCustomId('panel_webhooks')
            .setLabel('Webhooks')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔗'),
        new ButtonBuilder()
            .setCustomId('panel_help')
            .setLabel('Help')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📖'),
        new ButtonBuilder()
            .setCustomId('panel_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄'),
    );

    return [row1, row2, row3];
}

/**
 * Build the complete panel message payload
 * @param {import('discord.js').Guild} guild
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildPanelMessage(guild) {
    return {
        embeds: [buildPanelEmbed(guild)],
        components: buildPanelButtons(),
    };
}

module.exports = {
    buildPanelEmbed,
    buildPanelButtons,
    buildPanelMessage,
};
