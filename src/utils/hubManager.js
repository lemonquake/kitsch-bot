const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
    PermissionFlagsBits
} = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('./embedBuilder');
const { sendSlackNotification } = require('./slack');

// ============================================================
// Embed builders
// ============================================================

/**
 * Build the main Hub embed from hub data
 */
function buildHubEmbed(hub) {
    const pages = db.getHubPages(hub.id);
    const pageCount = pages.length;

    const embed = new EmbedBuilder()
        .setTitle(hub.title)
        .setDescription(hub.description || 'Select an option below to navigate.')
        .setColor(hub.color || '#2F3136');

    if (hub.image) embed.setImage(hub.image);
    if (hub.thumbnail) embed.setThumbnail(hub.thumbnail);
    if (hub.footer) embed.setFooter({ text: hub.footer });

    if (pageCount > 0) {
        embed.setFooter({ text: `${pageCount} option${pageCount !== 1 ? 's' : ''} available` });
    }

    return embed;
}

/**
 * Build navigation buttons for a Hub
 */
function buildHubComponents(hubId) {
    const pages = db.getHubPages(hubId);
    if (pages.length === 0) return [];

    const rows = [];
    let currentRow = new ActionRowBuilder();

    pages.forEach((page) => {
        const styleMap = {
            PRIMARY: ButtonStyle.Primary,
            SUCCESS: ButtonStyle.Success,
            DANGER: ButtonStyle.Danger,
            SECONDARY: ButtonStyle.Secondary,
        };

        const btn = new ButtonBuilder()
            .setCustomId(`hub_page_${page.id}`)
            .setLabel(page.label)
            .setStyle(styleMap[page.style] || ButtonStyle.Secondary);

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

// ============================================================
// Control Panel
// ============================================================

/**
 * Build the hub control panel — the interactive editor ephemeral message.
 * Returns { content, embeds, components } ready to be passed to interaction reply/update.
 */
function buildHubControlPanel(hub) {
    const pages = db.getHubPages(hub.id);
    const hubId = hub.id;

    // Live preview embed
    const previewEmbed = buildHubEmbed(hub);

    // Preview of actual hub buttons (limited to 3 rows to leave room for controls)
    const hubButtonRows = buildHubComponents(hubId).slice(0, 3);

    // Action row 1 — primary controls
    const primaryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_edit_${hubId}`)
            .setLabel('Edit Settings')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_addpage_${hubId}`)
            .setLabel('Add Page')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📄'),
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_addticket_${hubId}`)
            .setLabel('Add Ticket')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎫'),
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_post_${hubId}`)
            .setLabel(hub.message_id ? 'Update Hub' : 'Post Hub')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤')
    );

    const components = [...hubButtonRows, primaryRow];

    // If there are pages, add a select menu for editing/removing them
    if (pages.length > 0) {
        const pageSelectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`hub_ctrl_pageselect_${hubId}`)
                .setPlaceholder('✏️ Select a page/button to Edit or Remove')
                .addOptions(pages.map(p => ({
                    label: `${p.emoji ? p.emoji + ' ' : ''}${p.label}`.substring(0, 100),
                    description: `Type: ${p.type} | Style: ${p.style} | ID: ${p.id}`,
                    value: p.id.toString(),
                    emoji: p.type === 'ticket' ? '🎫' : '📄'
                })))
        );

        // Only add if we have room (Discord max 5 rows)
        if (components.length < 5) {
            components.push(pageSelectRow);
        }
    }

    const status = hub.message_id
        ? `✅ **Hub is live** — use "Update Hub" to push changes.\n`
        : `📋 **Hub is not posted yet** — click "Post Hub" when ready.\n`;

    const content = `## ⚙️ Hub Control Panel — *${hub.title}*\n${status}\n` +
        `**ID:** \`${hubId}\` · **Pages:** ${pages.length} · **Channel:** <#${hub.channel_id}>\n` +
        `*The preview below shows how the Hub will appear. Use the buttons to make changes.*`;

    return { content, embeds: [previewEmbed], components };
}

// ============================================================
// Button handlers (hub_ctrl_* and hub_page_*)
// ============================================================

/**
 * Main router for hub control panel button clicks.
 * Called from buttonHandler.js for customId starting with 'hub_ctrl_'
 */
async function handleHubButtonInteraction(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('hub_ctrl_edit_')) {
        await handleCtrlEdit(interaction);
    } else if (customId.startsWith('hub_ctrl_addpage_')) {
        await handleCtrlAddPage(interaction);
    } else if (customId.startsWith('hub_ctrl_addticket_')) {
        await handleCtrlAddTicket(interaction);
    } else if (customId.startsWith('hub_ctrl_post_')) {
        await handleCtrlPost(interaction);
    } else if (customId.startsWith('hub_ctrl_pageaction_')) {
        await handleCtrlPageAction(interaction);
    }
}

/**
 * Handle hub_ctrl_edit_<hubId> — show Edit Settings modal
 */
async function handleCtrlEdit(interaction) {
    const hubId = interaction.customId.replace('hub_ctrl_edit_', '');
    const hub = db.getHubById(hubId);
    if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_edit_${hubId}`)
        .setTitle('✏️ Edit Hub Settings');

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Hub Title')
        .setStyle(TextInputStyle.Short)
        .setValue(hub.title || '')
        .setMaxLength(256)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (shown under the title)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(hub.description || '')
        .setMaxLength(4000)
        .setPlaceholder('Select an option below to navigate.')
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('image')
        .setLabel('Banner Image URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(hub.image || '')
        .setPlaceholder('https://example.com/banner.png')
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Embed Color (hex, e.g. #FF69B4)')
        .setStyle(TextInputStyle.Short)
        .setValue(hub.color || '#2F3136')
        .setMaxLength(7)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(colorInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle hub_ctrl_addpage_<hubId> — show Add Page modal
 */
async function handleCtrlAddPage(interaction) {
    const hubId = interaction.customId.replace('hub_ctrl_addpage_', '');

    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_addpage_${hubId}`)
        .setTitle('📄 Add Info Page');

    const labelInput = new TextInputBuilder()
        .setCustomId('label')
        .setLabel('Button Label (shown on the button)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Rules')
        .setMaxLength(80)
        .setRequired(true);

    const emojiInput = new TextInputBuilder()
        .setCustomId('emoji')
        .setLabel('Button Emoji (optional, e.g. 📜)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('📜')
        .setRequired(false);

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Page Title (shown in the popup)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Server Rules')
        .setMaxLength(256)
        .setRequired(true);

    const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Page Content')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1. Be respectful\n2. No spam\n...')
        .setMaxLength(4000)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(emojiInput),
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle hub_ctrl_addticket_<hubId> — show Add Ticket modal
 */
async function handleCtrlAddTicket(interaction) {
    const hubId = interaction.customId.replace('hub_ctrl_addticket_', '');

    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_addticket_${hubId}`)
        .setTitle('🎫 Add Ticket Button');

    const labelInput = new TextInputBuilder()
        .setCustomId('label')
        .setLabel('Button Label')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Open a Ticket')
        .setMaxLength(80)
        .setRequired(true);

    const emojiInput = new TextInputBuilder()
        .setCustomId('emoji')
        .setLabel('Button Emoji (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('🎫')
        .setRequired(false);

    const welcomeTitleInput = new TextInputBuilder()
        .setCustomId('welcome_title')
        .setLabel('Ticket Welcome Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Support Ticket')
        .setMaxLength(256)
        .setRequired(false);

    const welcomeMsgInput = new TextInputBuilder()
        .setCustomId('welcome_message')
        .setLabel('Ticket Welcome Message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Hello {user},\n\nSupport will be with you shortly. Describe your issue below.')
        .setMaxLength(4000)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(emojiInput),
        new ActionRowBuilder().addComponents(welcomeTitleInput),
        new ActionRowBuilder().addComponents(welcomeMsgInput)
    );

    await interaction.showModal(modal);
}

/**
 * Handle hub_ctrl_post_<hubId> — post or update the hub in the target channel
 */
async function handleCtrlPost(interaction) {
    const hubId = interaction.customId.replace('hub_ctrl_post_', '');
    const hub = db.getHubById(hubId);
    if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

    await interaction.deferUpdate();

    const channel = await interaction.guild.channels.fetch(hub.channel_id).catch(() => null);
    if (!channel) {
        return interaction.editReply({ content: '❌ Target channel not found or inaccessible.', embeds: [], components: [] });
    }

    const embed = buildHubEmbed(hub);
    const components = buildHubComponents(hub.id);

    if (hub.message_id) {
        try {
            const msg = await channel.messages.fetch(hub.message_id);
            await msg.edit({ embeds: [embed], components });
            return refreshControlPanel(interaction, hub.id, '✅ Hub updated in <#' + hub.channel_id + '>!');
        } catch {
            // Message deleted, post new
        }
    }

    const msg = await channel.send({ embeds: [embed], components });
    db.updateHubMessageId(hub.id, msg.id);

    return refreshControlPanel(interaction, hub.id, '✅ Hub posted to <#' + hub.channel_id + '>! [Jump to message](' + msg.url + ')');
}

/**
 * Handle hub_ctrl_pageaction_<action>_<pageId>_<hubId> — edit or remove a page
 */
async function handleCtrlPageAction(interaction) {
    // customId: hub_ctrl_pageaction_edit_<pageId>_<hubId>
    //         or hub_ctrl_pageaction_remove_<pageId>_<hubId>
    const parts = interaction.customId.split('_');
    // hub_ctrl_pageaction_XXXXX = parts[0..3]
    // action = parts[4], pageId = parts[5], hubId = parts[6]
    const action = parts[4];
    const pageId = parts[5];
    const hubId = parts[6];

    if (action === 'remove') {
        db.deleteHubPage(parseInt(pageId));
        await interaction.deferUpdate();
        return refreshControlPanel(interaction, hubId, '🗑️ Page removed.');
    }

    if (action === 'edit') {
        const page = db.getHubPageById(parseInt(pageId));
        if (!page) return interaction.reply({ content: '❌ Page not found.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`hub_modal_editpage_${pageId}_${hubId}`)
            .setTitle('✏️ Edit Page');

        const labelInput = new TextInputBuilder()
            .setCustomId('label')
            .setLabel('Button Label')
            .setStyle(TextInputStyle.Short)
            .setValue(page.label || '')
            .setMaxLength(80)
            .setRequired(true);

        const emojiInput = new TextInputBuilder()
            .setCustomId('emoji')
            .setLabel('Button Emoji (optional)')
            .setStyle(TextInputStyle.Short)
            .setValue(page.emoji || '')
            .setRequired(false);

        if (page.type === 'page') {
            const contentEmbed = page.content_embed || {};
            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Page Title')
                .setStyle(TextInputStyle.Short)
                .setValue(contentEmbed.title || '')
                .setMaxLength(256)
                .setRequired(true);

            const contentInput = new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Page Content')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(contentEmbed.description || '')
                .setMaxLength(4000)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(labelInput),
                new ActionRowBuilder().addComponents(emojiInput),
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(contentInput)
            );
        } else {
            // ticket — edit welcome message
            const contentEmbed = page.content_embed || {};
            const welcomeTitleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Ticket Welcome Title')
                .setStyle(TextInputStyle.Short)
                .setValue(contentEmbed.title || '')
                .setMaxLength(256)
                .setRequired(false);

            const welcomeMsgInput = new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Ticket Welcome Message')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(contentEmbed.description || '')
                .setMaxLength(4000)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(labelInput),
                new ActionRowBuilder().addComponents(emojiInput),
                new ActionRowBuilder().addComponents(welcomeTitleInput),
                new ActionRowBuilder().addComponents(welcomeMsgInput)
            );
        }

        await interaction.showModal(modal);
    }
}

// ============================================================
// Select menu handler for page list
// ============================================================

/**
 * Handle hub_ctrl_pageselect_<hubId> select menu submission
 * Shows Edit / Remove action buttons for the selected page.
 */
async function handleHubPageSelect(interaction) {
    const hubId = interaction.customId.replace('hub_ctrl_pageselect_', '');
    const pageId = interaction.values[0];
    const page = db.getHubPageById(parseInt(pageId));

    if (!page) return interaction.reply({ content: '❌ Page not found.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_pageaction_edit_${pageId}_${hubId}`)
            .setLabel('Edit Page')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`hub_ctrl_pageaction_remove_${pageId}_${hubId}`)
            .setLabel('Remove')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    const typeLabel = page.type === 'ticket' ? '🎫 Ticket Button' : '📄 Info Page';
    await interaction.reply({
        content: `**Selected:** ${page.emoji ? page.emoji + ' ' : ''}**${page.label}** (${typeLabel})\nWhat would you like to do?`,
        components: [row],
        ephemeral: true
    });
}

// ============================================================
// Modal handlers (hub_modal_*)
// ============================================================

/**
 * Route all hub_modal_* modal submissions
 */
async function handleHubModalSubmit(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('hub_modal_edit_')) {
        await handleModalEditHub(interaction);
    } else if (customId.startsWith('hub_modal_addpage_')) {
        await handleModalAddPage(interaction);
    } else if (customId.startsWith('hub_modal_addticket_')) {
        await handleModalAddTicket(interaction);
    } else if (customId.startsWith('hub_modal_editpage_')) {
        await handleModalEditPage(interaction);
    }
}

/**
 * hub_modal_edit_<hubId> — save hub settings changes
 */
async function handleModalEditHub(interaction) {
    const hubId = interaction.customId.replace('hub_modal_edit_', '');
    const hub = db.getHubById(hubId);
    if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const image = interaction.fields.getTextInputValue('image');
    const colorRaw = interaction.fields.getTextInputValue('color');
    const color = /^#[0-9A-F]{6}$/i.test(colorRaw) ? colorRaw : (hub.color || '#2F3136');

    db.updateHub({
        id: hubId,
        title: title || hub.title,
        description: description || hub.description,
        image: image || null,
        color
    });

    await interaction.deferUpdate();
    return refreshControlPanel(interaction, hubId, '✅ Hub settings updated!');
}

/**
 * hub_modal_addpage_<hubId> — add a new static info page
 */
async function handleModalAddPage(interaction) {
    const hubId = interaction.customId.replace('hub_modal_addpage_', '');
    const hub = db.getHubById(hubId);
    if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

    const label = interaction.fields.getTextInputValue('label');
    const emoji = interaction.fields.getTextInputValue('emoji');
    const title = interaction.fields.getTextInputValue('title');
    const content = interaction.fields.getTextInputValue('content');

    db.createHubPage({
        hubId: hub.id,
        label,
        emoji: emoji || null,
        type: 'page',
        style: 'SECONDARY',
        contentEmbed: { title, description: content, color: '#2F3136' }
    });

    await interaction.deferUpdate();
    return refreshControlPanel(interaction, hubId, `✅ Page **${label}** added!`);
}

/**
 * hub_modal_addticket_<hubId> — add a new ticket button
 */
async function handleModalAddTicket(interaction) {
    const hubId = interaction.customId.replace('hub_modal_addticket_', '');
    const hub = db.getHubById(hubId);
    if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

    const label = interaction.fields.getTextInputValue('label');
    const emoji = interaction.fields.getTextInputValue('emoji');
    const welcomeTitle = interaction.fields.getTextInputValue('welcome_title');
    const welcomeMsg = interaction.fields.getTextInputValue('welcome_message');

    db.createHubPage({
        hubId: hub.id,
        label,
        emoji: emoji || null,
        type: 'ticket',
        style: 'SUCCESS',
        contentEmbed: {
            title: welcomeTitle || `🎫 Ticket: ${label}`,
            description: welcomeMsg || `Hello {user},\n\nSupport will be with you shortly. Describe your issue below.`,
            color: '#5865F2'
        }
    });

    await interaction.deferUpdate();
    return refreshControlPanel(interaction, hubId, `✅ Ticket button **${label}** added!`);
}

/**
 * hub_modal_editpage_<pageId>_<hubId> — save page edit
 */
async function handleModalEditPage(interaction) {
    const rest = interaction.customId.replace('hub_modal_editpage_', '');
    const [pageId, hubId] = rest.split('_');

    const page = db.getHubPageById(parseInt(pageId));
    if (!page) return interaction.reply({ content: '❌ Page not found.', ephemeral: true });

    const label = interaction.fields.getTextInputValue('label');
    const emoji = interaction.fields.getTextInputValue('emoji');
    const title = interaction.fields.getTextInputValue('title');
    const content = interaction.fields.getTextInputValue('content');

    const existingEmbed = page.content_embed || {};
    const newContentEmbed = {
        ...existingEmbed,
        title: title || existingEmbed.title,
        description: content || existingEmbed.description
    };

    db.updateHubPage({
        id: parseInt(pageId),
        label,
        emoji: emoji || null,
        style: page.style || 'SECONDARY',
        contentEmbed: newContentEmbed,
        ticketCategoryId: page.ticket_category_id || null
    });

    await interaction.deferUpdate();
    return refreshControlPanel(interaction, hubId, `✅ Page **${label}** updated!`);
}

// ============================================================
// Hub interaction for end users (clicking nav buttons)
// ============================================================

/**
 * Handle Hub Page Interaction (end-user clicking nav buttons)
 */
async function handleHubInteraction(interaction) {
    const pageId = interaction.customId.replace('hub_page_', '');

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

    if (page.type === 'page') {
        const embed = buildEmbed(page.content_embed);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (page.type === 'ticket') {
        await handleTicketCreation(interaction, page);
    }
}

// ============================================================
// Ticket Creation
// ============================================================

async function handleTicketCreation(interaction, page) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const category = page.ticket_category_id
        ? await guild.channels.fetch(page.ticket_category_id).catch(() => null)
        : null;

    const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ],
        });

        db.createTicket({ guildId: guild.id, channelId: ticketChannel.id, userId: interaction.user.id, type: 'support' });

        const embedConfig = page.content_embed || {
            title: `🎫 Ticket: ${page.label}`,
            description: `Hello {user},\n\nSupport will be with you shortly.`,
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

        await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [welcomeEmbed], components: [controls] });
        await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` });

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

// ============================================================
// Helpers
// ============================================================

/**
 * Refresh the control panel in the current interaction message.
 * Used after any change (modal submit, button action).
 */
async function refreshControlPanel(interaction, hubId, notice = null) {
    const hub = db.getHubById(hubId);
    const panel = buildHubControlPanel(hub);
    if (notice) {
        panel.content = panel.content + `\n\n> ${notice}`;
    }

    const method = interaction.deferred ? 'editReply' : 'update';
    try {
        await interaction[method](panel);
    } catch {
        // If we can't update (e.g. after a modal), try followUp
        await interaction.followUp({ ...panel, ephemeral: true });
    }
}

// Global client ref for ticket creation
let client;
function setClient(c) { client = c; }

module.exports = {
    buildHubEmbed,
    buildHubComponents,
    buildHubControlPanel,
    handleHubInteraction,
    handleHubButtonInteraction,
    handleHubPageSelect,
    handleHubModalSubmit,
    setClient
};
