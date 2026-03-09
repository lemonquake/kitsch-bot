const {
    SlashCommandBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');
const { createChannelWebhook, deleteChannelWebhook, postViaWebhook } = require('../utils/webhookManager');
const { buildEmbed } = require('../utils/embedBuilder');
const db = require('../database/db');

// In-memory sessions for multi-step webhook post flow
const webhookPostSessions = new Map();

module.exports = {
    // ─── Session store (used by webhookHandler.js) ────────────────────────────
    webhookPostSessions,

    // ─── Command definition ───────────────────────────────────────────────────
    data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Manage and use channel webhooks')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks)

        // CREATE
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Register a new webhook in a channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel for the webhook')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('Display name for the webhook (e.g. "Kitsch Updates")')
                        .setRequired(true)
                        .setMaxLength(80)
                )
                .addStringOption(opt =>
                    opt.setName('avatar')
                        .setDescription('Avatar image URL (optional)')
                        .setRequired(false)
                )
        )

        // LIST
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all saved webhooks in this server')
        )

        // DELETE
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a saved webhook')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Webhook ID (from /webhook list)')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // POST
        .addSubcommand(sub =>
            sub.setName('post')
                .setDescription('Compose and send a message through a webhook')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Webhook ID (from /webhook list)')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    // ─── Autocomplete ─────────────────────────────────────────────────────────
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const webhooks = db.getWebhooks(interaction.guild.id);
        const filtered = webhooks.filter(w =>
            w.name.toLowerCase().includes(focused.toLowerCase()) ||
            w.id.toString().includes(focused)
        );
        await interaction.respond(
            filtered.slice(0, 25).map(w => ({
                name: `${w.name} — #${w.channel_id} (ID: ${w.id})`,
                value: w.id.toString(),
            }))
        );
    },

    // ─── Execute ──────────────────────────────────────────────────────────────
    async execute(interaction) {
        const { allowed, message } = checkPermissions(interaction);
        if (!allowed) return interaction.reply({ content: message, ephemeral: true });

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'create': return handleCreate(interaction);
            case 'list': return handleList(interaction);
            case 'delete': return handleDelete(interaction);
            case 'post': return handlePost(interaction);
        }
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcommand Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCreate(interaction) {
    const channel = interaction.options.getChannel('channel');
    const name = interaction.options.getString('name');
    const avatarUrl = interaction.options.getString('avatar') || null;

    await interaction.deferReply({ ephemeral: true });

    try {
        const wh = await createChannelWebhook(
            channel, name, avatarUrl,
            interaction.guild.id, interaction.user.id
        );

        const embed = new EmbedBuilder()
            .setTitle('🔗 Webhook Created')
            .setColor('#5865F2')
            .addFields(
                { name: 'Name', value: wh.name, inline: true },
                { name: 'Channel', value: `<#${wh.channel_id}>`, inline: true },
                { name: 'DB ID', value: `\`${wh.id}\``, inline: true }
            )
            .setFooter({ text: `Use /webhook post id:${wh.id} to send a message through it.` });

        if (wh.avatar_url) embed.setThumbnail(wh.avatar_url);

        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('[webhook create]', err);
        await interaction.editReply({
            content: `❌ Failed to create webhook: ${err.message}`,
        });
    }
}

async function handleList(interaction) {
    const webhooks = db.getWebhooks(interaction.guild.id);

    if (webhooks.length === 0) {
        return interaction.reply({
            content: '📭 No webhooks saved yet. Use `/webhook create` to add one.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔗 Saved Webhooks')
        .setColor('#5865F2')
        .setDescription(
            webhooks.map(w =>
                `**ID \`${w.id}\`** — **${w.name}** in <#${w.channel_id}>`
            ).join('\n')
        )
        .setFooter({ text: `${webhooks.length} webhook(s) • Use /webhook delete id:<id> to remove` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDelete(interaction) {
    const rawId = interaction.options.getString('id');
    const id = parseInt(rawId);
    const wh = db.getWebhookById(id);

    if (!wh) {
        return interaction.reply({ content: '❌ Webhook not found.', ephemeral: true });
    }
    if (wh.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ That webhook belongs to another server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    await deleteChannelWebhook(wh);

    await interaction.editReply({
        content: `✅ Webhook **${wh.name}** (ID \`${wh.id}\`) has been deleted.`,
    });
}

async function handlePost(interaction) {
    const rawId = interaction.options.getString('id');
    const id = parseInt(rawId);
    const wh = db.getWebhookById(id);

    if (!wh) {
        return interaction.reply({ content: '❌ Webhook not found.', ephemeral: true });
    }
    if (wh.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ That webhook belongs to another server.', ephemeral: true });
    }

    // Store session keyed by user ID
    webhookPostSessions.set(interaction.user.id, { webhookId: id });

    // Show compose modal
    const modal = new ModalBuilder()
        .setCustomId(`webhook_compose_${interaction.user.id}`)
        .setTitle(`📨 Post via "${wh.name}"`);

    const usernameInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Override Name (blank = webhook default)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(wh.name)
        .setMaxLength(80)
        .setRequired(false);

    const avatarInput = new TextInputBuilder()
        .setCustomId('avatar_url')
        .setLabel('Override Avatar URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/avatar.png')
        .setMaxLength(500)
        .setRequired(false);

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Embed Title (blank = send as plain text)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(false);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Message / Embed Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Supports **bold**, *italics*, `code`, > blockquotes')
        .setMaxLength(4000)
        .setRequired(true);

    const colorInput = new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Embed Color hex (e.g. #FF69B4)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(7)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(usernameInput),
        new ActionRowBuilder().addComponents(avatarInput),
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(colorInput),
    );

    await interaction.showModal(modal);
}

// Exported helper used by webhookHandler.js after modal submit
module.exports.handleWebhookComposeModal = async function handleWebhookComposeModal(interaction) {
    const userId = interaction.user.id;
    const session = webhookPostSessions.get(userId);

    if (!session) {
        return interaction.reply({ content: '❌ Session expired. Run `/webhook post` again.', ephemeral: true });
    }

    const wh = db.getWebhookById(session.webhookId);
    if (!wh) {
        webhookPostSessions.delete(userId);
        return interaction.reply({ content: '❌ Webhook no longer exists.', ephemeral: true });
    }

    const username = interaction.fields.getTextInputValue('username') || null;
    const avatarURL = interaction.fields.getTextInputValue('avatar_url') || null;
    const title = interaction.fields.getTextInputValue('title') || null;
    const description = interaction.fields.getTextInputValue('description');
    const color = interaction.fields.getTextInputValue('color') || '#5865F2';

    await interaction.deferReply({ ephemeral: true });

    try {
        let payload = { username, avatarURL };

        if (title) {
            // Send as an embed
            const embed = new EmbedBuilder()
                .setDescription(description);
            if (title) embed.setTitle(title);
            try { embed.setColor(color); } catch { embed.setColor('#5865F2'); }
            payload.embed = embed;
        } else {
            // Send as plain text
            payload.content = description;
        }

        const msg = await postViaWebhook(wh, payload);

        webhookPostSessions.delete(userId);

        const channelLink = `https://discord.com/channels/${wh.guild_id}/${wh.channel_id}/${msg.id}`;
        await interaction.editReply({
            content: `✅ **Sent via "${wh.name}"!**\n🔗 [Jump to message](${channelLink})`,
        });
    } catch (err) {
        console.error('[webhook compose modal]', err);
        await interaction.editReply({ content: `❌ Failed to send: ${err.message}` });
    }
};
