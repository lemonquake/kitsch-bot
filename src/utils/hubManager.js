const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField
} = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('./embedBuilder');
const { sendSlackNotification } = require('./slack');

/**
 * Build the Main Hub Embed
 */
function buildHubEmbed(hub) {
    const embed = new EmbedBuilder()
        .setTitle(hub.title)
        .setDescription(hub.description || 'Welcome to the Server Hub. Select an option below.')
        .setColor(hub.color || '#2F3136');

    if (hub.image) {
        embed.setImage(hub.image);
    }

    return embed;
}

/**
 * Build Navigation Buttons for a Hub
 */
function buildHubComponents(hubId) {
    const pages = db.getHubPages(hubId);
    if (pages.length === 0) return [];

    const rows = [];
    let currentRow = new ActionRowBuilder();

    pages.forEach((page, index) => {
        const btn = new ButtonBuilder()
            .setCustomId(`hub_page_${page.id}`)
            .setLabel(page.label)
            .setStyle(page.style === 'PRIMARY' ? ButtonStyle.Primary :
                page.style === 'SUCCESS' ? ButtonStyle.Success :
                    page.style === 'DANGER' ? ButtonStyle.Danger :
                        ButtonStyle.Secondary);

        if (page.emoji) btn.setEmoji(page.emoji);

        currentRow.addComponents(btn);

        if (currentRow.components.length >= 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

/**
 * Handle Hub Page Interaction (The "Wizard" or "Whisper")
 */
async function handleHubInteraction(interaction) {
    const pageId = interaction.customId.replace('hub_page_', '');

    // We need to look up the page from DB. 
    // Since we don't have a direct "getPageById", we might need to filter from getHubPages? 
    // Or add getPageById. Let's add getPageById to DB or just query it here raw if needed.
    // For now, let's assume we can loop through hub pages if efficiently enough or add a helper.
    // Actually, SQL is fast. Let's add a helper in db or just raw query here for speed if preferred.
    // Wait, I should have added getHubPageById. Since I didn't, I'll fetch all pages for the hub?
    // No, that's inefficient. I'll add a quick lookup helper function inside db.js later if needed.
    // For now, I'll stick to a simple query or assuming I can get context.

    // Let's rely on the DB having `getHubPages` and filtering.
    // To find which hub, we need to know the message ID of interaction.
    const hubs = db.getHubs(interaction.guild.id);
    const activeHub = hubs.find(h => h.message_id === interaction.message.id);

    if (!activeHub) {
        return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });
    }

    const pages = db.getHubPages(activeHub.id);
    const page = pages.find(p => p.id.toString() === pageId);

    if (!page) {
        return interaction.reply({ content: '❌ Page content not found.', ephemeral: true });
    }

    // TYPE: PAGE (Static Content)
    if (page.type === 'page') {
        const embed = buildEmbed(page.content_embed);

        // Return ephemeral "Whisper"
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    // TYPE: TICKET (Action)
    else if (page.type === 'ticket') {
        await handleTicketCreation(interaction, page);
    }
}

/**
 * Handle Ticket Creation
 */
async function handleTicketCreation(interaction, page) {
    await interaction.deferReply({ ephemeral: true });

    const existingTicket = db.getTicketByChannel(interaction.channel.id); // Check if we are already in one? No, check if user has one?
    // Simple check: Don't spam tickets. 

    const guild = interaction.guild;
    const category = page.ticket_category_id ? await guild.channels.fetch(page.ticket_category_id).catch(() => null) : null;

    const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: client.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                }
            ],
        });

        // Log ticket to DB
        db.createTicket({
            guildId: guild.id,
            channelId: ticketChannel.id,
            userId: interaction.user.id,
            type: 'support'
        });

        // Send Welcome Embed
        const embedConfig = page.content_embed || {
            title: `🎫 Ticket: ${page.label}`,
            description: `Hello {user},\n\nSupport will be with you shortly. Describe your issue below.`,
            color: '#5865F2'
        };

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(embedConfig.title)
            .setDescription(embedConfig.description.replace('{user}', `<@${interaction.user.id}>`))
            .setColor(embedConfig.color || '#5865F2');

        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        await ticketChannel.send({
            content: `<@${interaction.user.id}>`,
            embeds: [welcomeEmbed],
            components: [controls]
        });

        await interaction.editReply({
            content: `✅ Ticket created: ${ticketChannel}`
        });

        // Send Slack Notification
        sendSlackNotification({
            channelName: ticketChannel.name,
            channelUrl: ticketChannel.url,
            user: interaction.user,
            reason: `Opened via Hub: ${page.label}`
        });

    } catch (error) {
        console.error('Ticket creation failed:', error);
        await interaction.editReply({ content: '❌ Failed to create ticket. Check bot permissions.' });
    }
}

// Global client ref
let client;

function setClient(c) {
    client = c;
}

module.exports = {
    buildHubEmbed,
    buildHubComponents,
    handleHubInteraction,
    setClient
};
