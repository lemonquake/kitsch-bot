const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('View the official Kitsch Bot guide and command list'),

    async execute(interaction) {
        try {
            const guidePath = path.join(__dirname, '../../KITSCH_BOT_GUIDE.md');

            if (!fs.existsSync(guidePath)) {
                return interaction.reply({
                    content: '❌ Guide file not found. Please contact the administrator.',
                    ephemeral: true
                });
            }

            const guideContent = fs.readFileSync(guidePath, 'utf8');

            // Split the guide into sections based on horizontal rules ---
            const sections = guideContent.split(/\n---\n/);

            const embeds = [];

            // Define a limit for embeds per message (Discord limit is 10)
            const MAX_EMBEDS = 10;

            for (let i = 0; i < sections.length && embeds.length < MAX_EMBEDS; i++) {
                const section = sections[i].trim();
                if (!section) continue;

                // Extract title from the first line if it starts with # or ##
                const lines = section.split('\n');
                let title = '✨ Kitsch Bot Guide';
                let content = section;

                if (lines[0].startsWith('#')) {
                    title = lines[0].replace(/^#+\s*/, '').trim();
                    content = lines.slice(1).join('\n').trim();
                }

                // Parse GitHub-style alerts (briefly)
                content = content.replace(/> \[!TIP\]/g, '💡 **Tip:**');
                content = content.replace(/> \[!NOTE\]/g, 'ℹ️ **Note:**');
                content = content.replace(/> \[!IMPORTANT\]/g, '⚠️ **Important:**');
                content = content.replace(/^>\s*/gm, ''); // Remove blockquote markers

                // Formatting improvements for Discord
                // Convert Markdown tables to a cleaner format if necessary, 
                // but let's keep it simple for now as Discord doesn't support them well anyway.

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(content.substring(0, 4096))
                    .setColor(config.colors.kitsch || '#FF69B4');

                if (i === sections.length - 1) {
                    embed.setFooter({ text: 'Kitsch Bot • Premium Announcements' }).setTimestamp();
                }

                embeds.push(embed);
            }

            // Send the guide as a normal (public) message
            await interaction.reply({ embeds: embeds });

        } catch (error) {
            console.error('Error executing /guide command:', error);
            await interaction.reply({
                content: '❌ There was an error while generating the guide.',
                ephemeral: true
            });
        }
    },
};
