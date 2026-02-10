const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { buildHubEmbed, buildHubComponents } = require('../utils/hubManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hub')
        .setDescription('Manage Multi-Page Hubs and Tickets')
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
        )
        // ADD PAGE (STATIC)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-page')
                .setDescription('Add a static info page to a Hub')
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
                .setDescription('Add a Ticket creation button to a Hub')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('label').setDescription('Button Label (e.g. "Open Ticket")').setRequired(true)
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
                .setDescription('Post or Update the Hub message')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
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

            const id = db.createHub({
                guildId: interaction.guild.id,
                channelId: channel.id,
                title: title,
                description: 'Select an option below to navigate.',
                image: null,
                color: '#2F3136'
            });

            await interaction.reply({ content: `✅ **Hub Created!** (ID: ${id})\nNow add pages or tickets using \`/hub add-page\` or \`/hub add-ticket\`.`, ephemeral: true });
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
                label: label,
                emoji: emoji,
                type: 'page',
                contentEmbed: {
                    title: title,
                    description: description,
                    color: '#2F3136'
                }
            });

            await interaction.reply({ content: `✅ **Page Added:** "${label}" linked to Hub ${hubId}`, ephemeral: true });
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
                label: label,
                emoji: emoji,
                style: 'SUCCESS',
                type: 'ticket',
                ticketCategoryId: category ? category.id : null,
                contentEmbed: {
                    title: title || `🎫 Ticket: ${label}`,
                    description: description || `Hello {user},\n\nSupport will be with you shortly. Describe your issue below.`,
                    color: '#5865F2'
                }
            });

            await interaction.reply({ content: `✅ **Ticket Button Added:** "${label}" linked to Hub ${hubId}`, ephemeral: true });
        }

        else if (subcommand === 'post') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);

            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            const channel = await interaction.guild.channels.fetch(hub.channel_id);
            if (!channel) return interaction.reply({ content: '❌ Target channel not found.', ephemeral: true });

            const embed = buildHubEmbed(hub);
            const components = buildHubComponents(hub.id);

            // If existing message, try to edit
            if (hub.message_id) {
                try {
                    const msg = await channel.messages.fetch(hub.message_id);
                    await msg.edit({ embeds: [embed], components: components });
                    return interaction.reply({ content: '✅ Hub updated successfully!', ephemeral: true });
                } catch (e) {
                    // Message deleted, post new
                }
            }

            const msg = await channel.send({ embeds: [embed], components: components });
            db.updateHubMessageId(hub.id, msg.id);

            await interaction.reply({ content: '✅ Hub posted successfully!', ephemeral: true });
        }

        else if (subcommand === 'list') {
            const hubs = db.getHubs(interaction.guild.id);
            if (hubs.length === 0) return interaction.reply({ content: '📭 No hubs created yet.', ephemeral: true });

            const list = hubs.map(h => `**ID: ${h.id}** | ${h.title} in <#${h.channel_id}>`).join('\n');
            await interaction.reply({ content: `**Active Hubs:**\n${list}`, ephemeral: true });
        }
    },
};
