const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { buildHubControlPanel } = require('../utils/hubManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hub')
        .setDescription('Manage Multi-Page Hubs')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        // CREATE HUB
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new Hub in a channel')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('Channel to post the Hub').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title').setDescription('Title of the Hub').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description shown in the Hub embed (you can always edit this later)')
                        .setRequired(false)
                )
        )
        // EDIT HUB (opens interactive control panel)
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Open the interactive Hub Control Panel to edit a Hub')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub (use /hub list)').setRequired(true)
                )
        )
        // ADD PAGE (STATIC)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-page')
                .setDescription('Add a static info page button to a Hub (or use /hub edit for the visual builder)')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub (use /hub list)').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('label').setDescription('Button Label').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title').setDescription('Page Title').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description').setDescription('Page Content').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('emoji').setDescription('Button Emoji').setRequired(false)
                )
        )
        // ADD TICKET (ACTION)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-ticket')
                .setDescription('Add a Ticket button to a Hub (or use /hub edit for the visual builder)')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('label').setDescription('Button Label').setRequired(true)
                )
                .addChannelOption(option =>
                    option.setName('category').setDescription('Category to create tickets in').setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title').setDescription('Ticket Welcome Title').setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('description').setDescription('Ticket Welcome Message').setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('emoji').setDescription('Button Emoji').setRequired(false)
                )
        )
        // POST/UPDATE HUB
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Post or Update the Hub message in the target channel')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
                )
        )
        // REMOVE PAGE
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-page')
                .setDescription('Remove a page/button from a Hub')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('page-id').setDescription('ID of the page to remove (shown in /hub edit select menu)').setRequired(true)
                )
        )
        // LIST HUBS
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all Hubs in this server')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description') || 'Select an option below to navigate.';

            const id = db.createHub({
                guildId: interaction.guild.id,
                channelId: channel.id,
                title,
                description,
                image: null,
                color: '#2F3136'
            });

            const hub = db.getHubById(id);
            const panel = buildHubControlPanel(hub);

            // Open the control panel right away — no need to remember the ID!
            await interaction.reply({ ...panel, ephemeral: true });
        }

        else if (subcommand === 'edit') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);
            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });
            if (hub.guild_id !== interaction.guild.id) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            const panel = buildHubControlPanel(hub);
            await interaction.reply({ ...panel, ephemeral: true });
        }

        else if (subcommand === 'add-page') {
            const hubId = interaction.options.getString('hub-id');
            const label = interaction.options.getString('label');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const emoji = interaction.options.getString('emoji');

            const hub = db.getHubById(hubId);
            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            db.createHubPage({
                hubId: hub.id,
                label,
                emoji,
                type: 'page',
                style: 'SECONDARY',
                contentEmbed: { title, description, color: '#2F3136' }
            });

            await interaction.reply({ content: `✅ **Page Added:** "${label}"\nUse \`/hub edit hub-id:${hubId}\` to see live preview and post changes.`, ephemeral: true });
        }

        else if (subcommand === 'add-ticket') {
            const hubId = interaction.options.getString('hub-id');
            const label = interaction.options.getString('label');
            const category = interaction.options.getChannel('category');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const emoji = interaction.options.getString('emoji');

            const hub = db.getHubById(hubId);
            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            db.createHubPage({
                hubId: hub.id,
                label,
                emoji,
                style: 'SUCCESS',
                type: 'ticket',
                ticketCategoryId: category ? category.id : null,
                contentEmbed: {
                    title: title || `🎫 Ticket: ${label}`,
                    description: description || `Hello {user},\n\nSupport will be with you shortly. Describe your issue below.`,
                    color: '#5865F2'
                }
            });

            await interaction.reply({ content: `✅ **Ticket Button Added:** "${label}"\nUse \`/hub edit hub-id:${hubId}\` to see live preview and post changes.`, ephemeral: true });
        }

        else if (subcommand === 'post') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);
            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            const { buildHubEmbed, buildHubComponents } = require('../utils/hubManager');

            const channel = await interaction.guild.channels.fetch(hub.channel_id).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ Target channel not found.', ephemeral: true });

            const embed = buildHubEmbed(hub);
            const components = buildHubComponents(hub.id);

            if (hub.message_id) {
                try {
                    const msg = await channel.messages.fetch(hub.message_id);
                    await msg.edit({ embeds: [embed], components });
                    return interaction.reply({ content: '✅ Hub updated successfully!', ephemeral: true });
                } catch { /* Message deleted, post new */ }
            }

            const msg = await channel.send({ embeds: [embed], components });
            db.updateHubMessageId(hub.id, msg.id);
            await interaction.reply({ content: `✅ Hub posted! [Jump to message](${msg.url})`, ephemeral: true });
        }

        else if (subcommand === 'remove-page') {
            const hubId = interaction.options.getString('hub-id');
            const pageId = interaction.options.getString('page-id');

            const hub = db.getHubById(hubId);
            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            const page = db.getHubPageById(parseInt(pageId));
            if (!page || page.hub_id.toString() !== hubId) {
                return interaction.reply({ content: '❌ Page not found on this Hub.', ephemeral: true });
            }

            db.deleteHubPage(parseInt(pageId));
            await interaction.reply({ content: `✅ Page **${page.label}** removed.\nUse \`/hub edit hub-id:${hubId}\` to review and re-post.`, ephemeral: true });
        }

        else if (subcommand === 'list') {
            const hubs = db.getHubs(interaction.guild.id);
            if (hubs.length === 0) return interaction.reply({ content: '📭 No hubs created yet. Use `/hub create` to get started.', ephemeral: true });

            const list = hubs.map(h => {
                const pages = db.getHubPages(h.id);
                const status = h.message_id ? '🟢 Live' : '⚪ Not posted';
                return `**ID: ${h.id}** | ${h.title} in <#${h.channel_id}> · ${pages.length} page(s) · ${status}`;
            }).join('\n');

            await interaction.reply({ content: `## 📋 Active Hubs\n${list}\n\nUse \`/hub edit hub-id:<id>\` to open the control panel for any hub.`, ephemeral: true });
        }
    },
};
