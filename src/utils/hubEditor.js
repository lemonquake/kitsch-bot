const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const db = require('../database/db');

// ============================================================
// Hub Editor Session Store
// hubSessions: Map<userId, { hubId, guildId, selectedPageId? }>
// Hub data is always read fresh from DB to avoid stale state.
// ============================================================
const hubSessions = new Map();

// ============================================================
// Panel Builders
// ============================================================

/**
 * Build the main Hub Editor embed + control buttons.
 * @param {Object} hub - Hub row from DB
 * @param {Array}  pages - Hub pages from DB
 * @param {string} userId
 * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
 */
function buildEditorPanel(hub, pages, userId) {
    const pageCountStr = pages.length === 0
        ? '_No pages yet_'
        : pages.map((p, i) =>
            `${i + 1}. ${p.emoji ? `${p.emoji} ` : ''}**${p.label}** — \`${p.type}\``
        ).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🛠️ Hub Editor — ${hub.title}`)
        .setDescription(
            `**Hub ID:** \`${hub.id}\`\n` +
            `**Channel:** <#${hub.channel_id}>\n` +
            `**Status:** ${hub.message_id ? '📡 Live' : '📝 Draft'}\n\n` +
            `**Hub Description:**\n${hub.description || '_Not set_'}\n\n` +
            `**Pages (${pages.length}):**\n${pageCountStr}`
        )
        .setColor(hub.color || '#5865F2')
        .setFooter({ text: 'Use the buttons below to manage this Hub.' });

    if (hub.thumbnail) embed.setThumbnail(hub.thumbnail);
    if (hub.image) embed.setImage(hub.image);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_edit_info_${userId}`)
            .setLabel('Edit Info')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId(`hub_edit_appearance_${userId}`)
            .setLabel('Appearance')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎨')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_edit_addpage_${userId}`)
            .setLabel('Add Page')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId(`hub_edit_addticket_${userId}`)
            .setLabel('Add Ticket')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎫')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_edit_manage_${userId}`)
            .setLabel(`Manage Pages (${pages.length})`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋')
            .setDisabled(pages.length === 0),
        new ButtonBuilder()
            .setCustomId(`hub_edit_post_${userId}`)
            .setLabel(hub.message_id ? 'Update Hub' : 'Post Hub')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📤')
            .setDisabled(pages.length === 0)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_edit_cancel_${userId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    return { embed, components: [row1, row2, row3, row4] };
}

/**
 * Build the Page Manager panel (select + action buttons).
 * @param {Object} hub
 * @param {Array}  pages
 * @param {string} userId
 */
function buildPageManagerPanel(hub, pages, userId) {
    const embed = new EmbedBuilder()
        .setTitle(`📋 Manage Pages — ${hub.title}`)
        .setDescription(
            pages.length === 0
                ? '_No pages to manage._'
                : 'Select a page below, then choose an action.'
        )
        .setColor(hub.color || '#5865F2');

    if (pages.length === 0) {
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`hub_edit_pageback_${userId}`)
                .setLabel('Back to Editor')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );
        return { embed, components: [backRow] };
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`hub_select_page_${userId}`)
        .setPlaceholder('Select a page to manage...')
        .addOptions(pages.map(p => ({
            label: `${p.emoji ? p.emoji + ' ' : ''}${p.label}`.substring(0, 100),
            description: `Type: ${p.type}`,
            value: p.id.toString(),
        })));

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hub_edit_pageaction_edit_${userId}`)
            .setLabel('Edit Selected')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`hub_edit_pageaction_delete_${userId}`)
            .setLabel('Delete Selected')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId(`hub_edit_pageback_${userId}`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    return { embed, components: [selectRow, actionRow] };
}

// ============================================================
// Modal Builders
// ============================================================

/** Modal: Edit Hub Info (title + description) */
function buildHubInfoModal(hub, userId) {
    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_info_${userId}`)
        .setTitle('📝 Edit Hub Info');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Hub Title')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setValue(hub.title || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Hub Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Supports **bold**, *italics*, `code`, > blockquotes')
                .setMaxLength(4096)
                .setRequired(false)
                .setValue(hub.description || '')
        )
    );
    return modal;
}

/** Modal: Appearance (color + image + thumbnail + footer) */
function buildAppearanceModal(hub, userId) {
    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_appearance_${userId}`)
        .setTitle('🎨 Hub Appearance');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('color')
                .setLabel('Embed Color (hex, e.g. #5865F2)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(7)
                .setRequired(false)
                .setValue(hub.color || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('image')
                .setLabel('Banner Image URL')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://example.com/banner.png')
                .setMaxLength(500)
                .setRequired(false)
                .setValue(hub.image || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('thumbnail')
                .setLabel('Thumbnail URL (small corner image)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://example.com/icon.png')
                .setMaxLength(500)
                .setRequired(false)
                .setValue(hub.thumbnail || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('footer')
                .setLabel('Footer Text')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(2048)
                .setRequired(false)
                .setValue(hub.footer || '')
        )
    );
    return modal;
}

/** Modal: Add Page */
function buildAddPageModal(userId) {
    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_addpage_${userId}`)
        .setTitle('➕ Add Info Page');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('label')
                .setLabel('Button Label (shown on hub)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(80)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('emoji')
                .setLabel('Button Emoji (optional)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(10)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('page_title')
                .setLabel('Page Title')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Page Content')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Supports **bold**, *italics*, `code`, > blockquotes, and more!')
                .setMaxLength(4000)
                .setRequired(true)
        )
    );
    return modal;
}

/** Modal: Add Ticket */
function buildAddTicketModal(userId) {
    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_addticket_${userId}`)
        .setTitle('🎫 Add Ticket Button');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('label')
                .setLabel('Button Label')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(80)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('emoji')
                .setLabel('Button Emoji (optional)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(10)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('welcome_title')
                .setLabel('Ticket Welcome Title')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(false)
                .setPlaceholder('🎫 Support Ticket')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('welcome_desc')
                .setLabel('Ticket Welcome Message')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(4000)
                .setRequired(false)
                .setPlaceholder('Hello {user},\n\nSupport will be with you shortly. Describe your issue below.')
        )
    );
    return modal;
}

/** Modal: Edit existing page (pre-filled) */
function buildEditPageModal(page, userId) {
    const embed = page.content_embed || {};
    const modal = new ModalBuilder()
        .setCustomId(`hub_modal_editpage_${page.id}_${userId}`)
        .setTitle('✏️ Edit Page');

    if (page.type === 'ticket') {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('label')
                    .setLabel('Button Label')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(80)
                    .setRequired(true)
                    .setValue(page.label || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('emoji')
                    .setLabel('Button Emoji (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(10)
                    .setRequired(false)
                    .setValue(page.emoji || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('welcome_title')
                    .setLabel('Ticket Welcome Title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(false)
                    .setValue(embed.title || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('welcome_desc')
                    .setLabel('Ticket Welcome Message')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setValue(embed.description || '')
            )
        );
    } else {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('label')
                    .setLabel('Button Label')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(80)
                    .setRequired(true)
                    .setValue(page.label || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('emoji')
                    .setLabel('Button Emoji (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(10)
                    .setRequired(false)
                    .setValue(page.emoji || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('page_title')
                    .setLabel('Page Title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(true)
                    .setValue(embed.title || '')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Page Content')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Supports **bold**, *italics*, `code`, > blockquotes')
                    .setMaxLength(4000)
                    .setRequired(true)
                    .setValue(embed.description || '')
            )
        );
    }
    return modal;
}

// ============================================================
// Open Editor Helper
// ============================================================

/**
 * Open (or refresh) the Hub Editor panel.
 * Works for both initial open and refresh-after-action.
 */
async function openHubEditor(interaction, hub, { refresh = false } = {}) {
    hubSessions.set(interaction.user.id, { hubId: hub.id, guildId: hub.guild_id });
    const pages = db.getHubPages(hub.id);
    const { embed, components } = buildEditorPanel(hub, pages, interaction.user.id);

    const payload = { embeds: [embed], components, ephemeral: true };

    if (refresh) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
    } else {
        await interaction.reply({ ...payload, fetchReply: true });
    }
}

// ============================================================
// Button Interaction Handler
// ============================================================

async function handleHubEditorButton(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    // hub_edit_info_{userId}
    if (customId === `hub_edit_info_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);
        const hub = db.getHubById(session.hubId);
        return interaction.showModal(buildHubInfoModal(hub, userId));
    }

    // hub_edit_appearance_{userId}
    if (customId === `hub_edit_appearance_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);
        const hub = db.getHubById(session.hubId);
        return interaction.showModal(buildAppearanceModal(hub, userId));
    }

    // hub_edit_addpage_{userId}
    if (customId === `hub_edit_addpage_${userId}`) {
        return interaction.showModal(buildAddPageModal(userId));
    }

    // hub_edit_addticket_{userId}
    if (customId === `hub_edit_addticket_${userId}`) {
        return interaction.showModal(buildAddTicketModal(userId));
    }

    // hub_edit_manage_{userId}
    if (customId === `hub_edit_manage_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);
        const hub = db.getHubById(session.hubId);
        const pages = db.getHubPages(session.hubId);
        const { embed, components } = buildPageManagerPanel(hub, pages, userId);
        return interaction.update({ embeds: [embed], components });
    }

    // hub_edit_pageback_{userId}
    if (customId === `hub_edit_pageback_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);
        const hub = db.getHubById(session.hubId);
        return openHubEditor(interaction, hub, { refresh: true });
    }

    // hub_edit_pageaction_edit_{userId}
    if (customId === `hub_edit_pageaction_edit_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session || !session.selectedPageId) {
            return interaction.reply({ content: '⚠️ Please select a page first.', ephemeral: true });
        }
        const page = db.getHubPageById(session.selectedPageId);
        if (!page) return interaction.reply({ content: '❌ Page not found.', ephemeral: true });
        return interaction.showModal(buildEditPageModal(page, userId));
    }

    // hub_edit_pageaction_delete_{userId}
    if (customId === `hub_edit_pageaction_delete_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session || !session.selectedPageId) {
            return interaction.reply({ content: '⚠️ Please select a page first.', ephemeral: true });
        }
        db.deleteHubPage(session.selectedPageId);
        session.selectedPageId = null;
        hubSessions.set(userId, session);

        const hub = db.getHubById(session.hubId);
        const pages = db.getHubPages(session.hubId);
        const { embed, components } = buildPageManagerPanel(hub, pages, userId);
        return interaction.update({ embeds: [embed], components });
    }

    // hub_edit_post_{userId}
    if (customId === `hub_edit_post_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);
        await interaction.deferUpdate();
        await postOrUpdateHub(interaction, session.hubId);
        return;
    }

    // hub_edit_cancel_{userId}
    if (customId === `hub_edit_cancel_${userId}`) {
        hubSessions.delete(userId);
        return interaction.update({
            content: '❌ Hub Editor closed.',
            embeds: [],
            components: [],
        });
    }
}

// ============================================================
// Modal Submission Handler
// ============================================================

async function handleHubEditorModal(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    // hub_modal_info_{userId}
    if (customId === `hub_modal_info_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpiredModal(interaction);

        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');

        const hub = db.getHubById(session.hubId);
        db.updateHub({
            id: session.hubId,
            title,
            description,
            image: hub.image,
            color: hub.color,
            thumbnail: hub.thumbnail,
            footer: hub.footer,
        });

        await interaction.deferReply({ ephemeral: true });
        return openHubEditor(interaction, db.getHubById(session.hubId), { refresh: true });
    }

    // hub_modal_appearance_{userId}
    if (customId === `hub_modal_appearance_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpiredModal(interaction);

        const hub = db.getHubById(session.hubId);
        const color = interaction.fields.getTextInputValue('color') || hub.color;
        const image = interaction.fields.getTextInputValue('image') || hub.image;
        const thumbnail = interaction.fields.getTextInputValue('thumbnail') || hub.thumbnail;
        const footer = interaction.fields.getTextInputValue('footer') || hub.footer;

        db.updateHub({
            id: session.hubId,
            title: hub.title,
            description: hub.description,
            image: image || null,
            color: color || null,
            thumbnail: thumbnail || null,
            footer: footer || null,
        });

        await interaction.deferReply({ ephemeral: true });
        return openHubEditor(interaction, db.getHubById(session.hubId), { refresh: true });
    }

    // hub_modal_addpage_{userId}
    if (customId === `hub_modal_addpage_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpiredModal(interaction);

        const label = interaction.fields.getTextInputValue('label');
        const emoji = interaction.fields.getTextInputValue('emoji') || null;
        const pageTitle = interaction.fields.getTextInputValue('page_title');
        const description = interaction.fields.getTextInputValue('description');

        db.createHubPage({
            hubId: session.hubId,
            label,
            emoji,
            type: 'page',
            contentEmbed: { title: pageTitle, description, color: '#2F3136' },
        });

        await interaction.deferReply({ ephemeral: true });
        return openHubEditor(interaction, db.getHubById(session.hubId), { refresh: true });
    }

    // hub_modal_addticket_{userId}
    if (customId === `hub_modal_addticket_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpiredModal(interaction);

        const label = interaction.fields.getTextInputValue('label');
        const emoji = interaction.fields.getTextInputValue('emoji') || null;
        const welcomeTitle = interaction.fields.getTextInputValue('welcome_title') || `🎫 Ticket: ${label}`;
        const welcomeDesc = interaction.fields.getTextInputValue('welcome_desc') ||
            `Hello {user},\n\nSupport will be with you shortly. Describe your issue below.`;

        db.createHubPage({
            hubId: session.hubId,
            label,
            emoji,
            style: 'SUCCESS',
            type: 'ticket',
            contentEmbed: { title: welcomeTitle, description: welcomeDesc, color: '#5865F2' },
        });

        await interaction.deferReply({ ephemeral: true });
        return openHubEditor(interaction, db.getHubById(session.hubId), { refresh: true });
    }

    // hub_modal_editpage_{pageId}_{userId}
    if (customId.startsWith(`hub_modal_editpage_`)) {
        const parts = customId.split('_');
        // hub_modal_editpage_{pageId}_{userId} → parts[3] = pageId, parts[4] = userId
        const pageId = parseInt(parts[3]);
        const session = hubSessions.get(userId);
        if (!session) return safeExpiredModal(interaction);

        const page = db.getHubPageById(pageId);
        if (!page) return interaction.reply({ content: '❌ Page not found.', ephemeral: true });

        const label = interaction.fields.getTextInputValue('label');
        const emoji = interaction.fields.getTextInputValue('emoji') || null;

        let contentEmbed;
        if (page.type === 'ticket') {
            const welcomeTitle = interaction.fields.getTextInputValue('welcome_title') || `🎫 Ticket: ${label}`;
            const welcomeDesc = interaction.fields.getTextInputValue('welcome_desc') ||
                'Hello {user},\n\nSupport will be with you shortly.';
            contentEmbed = { ...page.content_embed, title: welcomeTitle, description: welcomeDesc };
        } else {
            const pageTitle = interaction.fields.getTextInputValue('page_title');
            const description = interaction.fields.getTextInputValue('description');
            contentEmbed = { ...page.content_embed, title: pageTitle, description };
        }

        db.updateHubPage({
            id: pageId,
            label,
            emoji,
            style: page.style,
            contentEmbed,
            ticketCategoryId: page.ticket_category_id,
        });

        // Back to page manager
        const hub = db.getHubById(session.hubId);
        const pages = db.getHubPages(session.hubId);
        await interaction.deferReply({ ephemeral: true });
        const { embed, components } = buildPageManagerPanel(hub, pages, userId);
        return interaction.editReply({ embeds: [embed], components });
    }
}

// ============================================================
// Select Menu Handler
// ============================================================

async function handleHubEditorSelect(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    if (customId === `hub_select_page_${userId}`) {
        const session = hubSessions.get(userId);
        if (!session) return safeExpired(interaction);

        const selectedPageId = parseInt(interaction.values[0]);
        session.selectedPageId = selectedPageId;
        hubSessions.set(userId, session);

        // Show a brief ack in the same panel (update the message to highlight selection)
        const hub = db.getHubById(session.hubId);
        const pages = db.getHubPages(session.hubId);
        const { embed, components } = buildPageManagerPanel(hub, pages, userId);
        embed.setFooter({ text: `Selected: Page ID ${selectedPageId}. Now click Edit or Delete.` });
        return interaction.update({ embeds: [embed], components });
    }
}

// ============================================================
// Post / Update Hub
// ============================================================

async function postOrUpdateHub(interaction, hubId) {
    const { buildHubEmbed, buildHubComponents } = require('./hubManager');
    const hub = db.getHubById(hubId);
    const channel = await interaction.client.channels.fetch(hub.channel_id).catch(() => null);

    if (!channel) {
        return interaction.editReply({
            content: '❌ Target channel not found. Make sure the bot has access.',
            embeds: [], components: [],
        });
    }

    const embed = buildHubEmbed(hub);
    const components = buildHubComponents(hubId);

    if (hub.message_id) {
        try {
            const msg = await channel.messages.fetch(hub.message_id);
            await msg.edit({ embeds: [embed], components });
            hubSessions.delete(interaction.user.id);
            return interaction.editReply({
                content: `✅ **Hub Updated!** — [Jump to Hub](${msg.url})`,
                embeds: [], components: [],
            });
        } catch {
            // Message gone — fall through to send new
        }
    }

    const msg = await channel.send({ embeds: [embed], components });
    db.updateHubMessageId(hubId, msg.id);
    hubSessions.delete(interaction.user.id);
    return interaction.editReply({
        content: `✅ **Hub Posted!** — [Jump to Hub](${msg.url})`,
        embeds: [], components: [],
    });
}

// ============================================================
// Helpers
// ============================================================

function safeExpired(interaction) {
    return interaction.reply({ content: '❌ Session expired. Run `/hub create` or `/hub edit` again.', ephemeral: true });
}

function safeExpiredModal(interaction) {
    return interaction.reply({ content: '❌ Session expired. Run `/hub create` or `/hub edit` again.', ephemeral: true });
}

module.exports = {
    hubSessions,
    buildEditorPanel,
    buildPageManagerPanel,
    openHubEditor,
    handleHubEditorButton,
    handleHubEditorModal,
    handleHubEditorSelect,
};
