const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { runPulse, refreshPulses } = require('../utils/pulse');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pulse')
        .setDescription('Manage real-time server status pulses')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup a pulse for a channel')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('Channel to post the pulse').setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('interval').setDescription('Update interval in minutes (default 120)').setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force')
                .setDescription('Manually trigger an immediate pulse update')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show status of all active pulses')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop and remove pulse from a channel')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('Channel to remove pulse from').setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const interval = interaction.options.getInteger('interval') || 120;

            db.createServerPulse({
                guildId: interaction.guild.id,
                channelId: channel.id,
                intervalMinutes: interval,
                config: {
                    color: '#FF69B4',
                    title: '💓 Server Pulse',
                    image: 'https://i.imgur.com/8QGZdYg.png'
                }
            });

            refreshPulses();
            await interaction.reply({
                content: `✅ **Pulse Activated!**\n📍 Channel: <#${channel.id}>\n⏰ Interval: every ${interval} minutes.\n\nThe first pulse will be sent now.`,
                ephemeral: true
            });
        }

        else if (subcommand === 'force') {
            const pulse = db.getPulseByChannel(interaction.channel.id);
            if (!pulse) {
                return interaction.reply({ content: '❌ No pulse configured for this channel.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            await runPulse(pulse);
            await interaction.editReply({ content: '✅ Pulse forced and updated!' });
        }

        else if (subcommand === 'status') {
            const pulses = db.getServerPulses().filter(p => p.guild_id === interaction.guild.id);
            if (pulses.length === 0) {
                return interaction.reply({ content: '📭 No active pulses in this server.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ Active Pulses')
                .setColor('#FF69B4')
                .setDescription(pulses.map(p => `📍 <#${p.channel_id}>: Every ${p.interval_minutes}m (Last: ${p.last_run || 'Never'})`).join('\n'));

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (subcommand === 'stop') {
            const channel = interaction.options.getChannel('channel');
            db.deletePulse(channel.id);
            refreshPulses();
            await interaction.reply({ content: `✅ Pulse removed from <#${channel.id}>.`, ephemeral: true });
        }
    },
};
