const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { buildHubEmbed, buildHubComponents } = require('../utils/hubManager');
const { openHubEditor } = require('../utils/hubEditor');

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
        )
        // EDIT HUB (open editor for existing)
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Open the Hub Editor for an existing Hub')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub (use /hub list)').setRequired(true)
                )
        )
        // POST/UPDATE HUB
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Post or Update the Hub message in its channel')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub').setRequired(true)
                )
        )
        // LIST HUBS
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all Hubs in this server')
        )
        // DELETE HUB
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Permanently delete a Hub')
                .addStringOption(option =>
                    option.setName('hub-id').setDescription('ID of the Hub to delete').setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const channel = interaction.options.getChannel('channel');

            // Create hub with placeholder data — editor lets user fill it in
            const id = db.createHub({
                guildId: interaction.guild.id,
                channelId: channel.id,
                title: 'New Hub',
                description: 'Select an option below to navigate.',
                image: null,
                color: '#5865F2',
            });

            const hub = db.getHubById(id);
            await openHubEditor(interaction, hub);
        }

        else if (subcommand === 'edit') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);

            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });
            if (hub.guild_id !== interaction.guild.id) {
                return interaction.reply({ content: '❌ This Hub belongs to another server.', ephemeral: true });
            }

            await openHubEditor(interaction, hub);
        }

        else if (subcommand === 'post') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);

            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });

            const channel = await interaction.guild.channels.fetch(hub.channel_id).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ Target channel not found.', ephemeral: true });

            const embed = buildHubEmbed(hub);
            const components = buildHubComponents(hub.id);

            if (hub.message_id) {
                try {
                    const msg = await channel.messages.fetch(hub.message_id);
                    await msg.edit({ embeds: [embed], components });
                    return interaction.reply({ content: `✅ Hub updated! [Jump to Hub](${msg.url})`, ephemeral: true });
                } catch {
                    // Message deleted, post new
                }
            }

            const msg = await channel.send({ embeds: [embed], components });
            db.updateHubMessageId(hub.id, msg.id);
            return interaction.reply({ content: `✅ Hub posted! [Jump to Hub](${msg.url})`, ephemeral: true });
        }

        else if (subcommand === 'list') {
            const hubs = db.getHubs(interaction.guild.id);
            if (hubs.length === 0) return interaction.reply({ content: '📭 No Hubs created yet.', ephemeral: true });

            const list = hubs.map(h => {
                const status = h.message_id ? '📡 Live' : '📝 Draft';
                return `**ID: \`${h.id}\`** ${status} — **${h.title}** in <#${h.channel_id}>`;
            }).join('\n');

            return interaction.reply({
                content: `**Hubs in ${interaction.guild.name}:**\n\n${list}\n\nUse \`/hub edit hub-id:<id>\` to open the Hub Editor.`,
                ephemeral: true,
            });
        }

        else if (subcommand === 'delete') {
            const hubId = interaction.options.getString('hub-id');
            const hub = db.getHubById(hubId);

            if (!hub) return interaction.reply({ content: '❌ Hub not found.', ephemeral: true });
            if (hub.guild_id !== interaction.guild.id) {
                return interaction.reply({ content: '❌ This Hub belongs to another server.', ephemeral: true });
            }

            db.deleteHub(hubId);
            return interaction.reply({ content: `✅ Hub **${hub.title}** (ID: \`${hubId}\`) deleted.`, ephemeral: true });
        }
    },
};
