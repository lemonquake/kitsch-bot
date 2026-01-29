const { Events, EmbedBuilder } = require('discord.js');

// Log channel ID
const LOG_CHANNEL_ID = '1464244584958922904';

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log('═══════════════════════════════════════');
        console.log('✨ Kitsch Bot is now online!');
        console.log(`📌 Logged in as: ${client.user.tag}`);
        console.log(`🏠 Serving ${client.guilds.cache.size} server(s)`);
        console.log('═══════════════════════════════════════');

        // Set activity status
        client.user.setActivity('with embeds ✨', { type: 0 }); // 0 = Playing

        // Send startup log to channel
        try {
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

            if (logChannel) {
                const now = new Date();
                const embed = new EmbedBuilder()
                    .setTitle('🚀 Kitsch Bot Started')
                    .setColor(0x57F287) // Green
                    .addFields(
                        { name: '📅 Date', value: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), inline: true },
                        { name: '⏰ Time', value: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }), inline: true },
                        { name: '🏠 Servers', value: `${client.guilds.cache.size}`, inline: true }
                    )
                    .setFooter({ text: `Bot ID: ${client.user.id}` })
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
                console.log('📝 Startup logged to channel');
            }
        } catch (error) {
            console.error('Failed to send startup log:', error.message);
        }
    },
};
