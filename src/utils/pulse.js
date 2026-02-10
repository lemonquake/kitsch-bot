const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { buildEmbed } = require('./embedBuilder');

let client = null;
const activeCronJobs = new Map();

/**
 * Initialize the Pulse service
 * @param {import('discord.js').Client} discordClient 
 */
async function initPulseService(discordClient) {
    client = discordClient;

    // Auto-setup requested channel if not exists
    const TARGET_CHANNEL_ID = '1181681651063992351';
    const existing = db.getPulseByChannel(TARGET_CHANNEL_ID);

    if (!existing) {
        console.log(`✨ Automating Setup: Pulse for ${TARGET_CHANNEL_ID}`);
        // Find a guild that has this channel
        for (const guild of client.guilds.cache.values()) {
            if (guild.channels.cache.has(TARGET_CHANNEL_ID)) {
                db.createServerPulse({
                    guildId: guild.id,
                    channelId: TARGET_CHANNEL_ID,
                    intervalMinutes: 120, // 2 hours
                    config: {
                        color: '#FF69B4',
                        title: '💓 Server Pulse',
                        image: 'https://i.imgur.com/8QGZdYg.png' // Kitsch Pink Aesthetic
                    }
                });
                break;
            }
        }
    }

    // Load all active pulses
    refreshPulses();

    console.log('✅ Server Pulse service initialized');
}

/**
 * Refresh and schedule all pulses from DB
 */
function refreshPulses() {
    // Clear existing jobs
    for (const job of activeCronJobs.values()) {
        job.stop();
    }
    activeCronJobs.clear();

    const pulses = db.getServerPulses();
    for (const pulse of pulses) {
        schedulePulse(pulse);
    }
}

/**
 * Schedule a pulse job
 */
function schedulePulse(pulse) {
    const hours = Math.floor(pulse.interval_minutes / 60) || 1;
    // Cron for every X hours: '0 */H * * *'
    const cronExpression = `0 */${hours} * * *`;

    // For immediate testing if requested or just run once on start
    runPulse(pulse);

    const job = cron.schedule(cronExpression, () => {
        runPulse(pulse);
    });

    activeCronJobs.set(pulse.id, job);
}

/**
 * Execute the pulse: Update or Send the status message
 */
async function runPulse(pulse) {
    if (!client) return;

    try {
        const guild = await client.guilds.fetch(pulse.guild_id);
        const channel = await client.channels.fetch(pulse.channel_id);

        if (!guild || !channel) {
            console.error(`❌ Pulse ${pulse.id}: Could not find guild/channel.`);
            return;
        }

        // Gather metrics
        const totalMembers = guild.memberCount;

        // Presence count requires Privileged Intent (GuildPresences)
        // If not enabled, this will be 0 or throw
        let onlineMembers = 0;
        try {
            onlineMembers = guild.presences?.cache.filter(p => p.status !== 'offline').size || 0;
        } catch (e) {
            console.warn('⚠️ Could not fetch presence data. Is the Presences Intent enabled?');
        }

        // Stylized Status
        let vitality = '💓 Peaceful';
        if (totalMembers > 100) vitality = '💖 Vibrant';
        if (onlineMembers > 10) vitality = '✨ Lively';

        const embed = new EmbedBuilder()
            .setTitle(pulse.config?.title || '💓 Server Pulse')
            .setColor(pulse.config?.color || '#FF69B4')
            .setDescription(`**${guild.name}** is currently: \`${vitality}\``)
            .addFields(
                { name: '👥 Total Members', value: `\`${totalMembers.toLocaleString()}\``, inline: true },
                { name: '🟢 Online Now', value: onlineMembers > 0 ? `\`${onlineMembers.toLocaleString()}\`` : '`Hiding...`', inline: true },
                { name: '🗓️ Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
            )
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'Kitsch Bot • Real-time Vitality Monitoring', iconURL: client.user.displayAvatarURL() });

        if (pulse.config?.image) {
            embed.setImage(pulse.config.image);
        }

        let message;
        if (pulse.last_message_id) {
            try {
                const oldMsg = await channel.messages.fetch(pulse.last_message_id);
                message = await oldMsg.edit({ embeds: [embed] });
            } catch (e) {
                // If message deleted, post new one
                message = await channel.send({ embeds: [embed] });
            }
        } else {
            message = await channel.send({ embeds: [embed] });
        }

        // Update DB
        db.updatePulseMessageId(pulse.id, message.id);
        db.updatePulseLastRun(pulse.id);

    } catch (error) {
        console.error(`❌ Error running pulse ${pulse.id}:`, error);
    }
}

module.exports = {
    initPulseService,
    refreshPulses,
    runPulse
};
