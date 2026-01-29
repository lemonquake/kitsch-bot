const { EmbedBuilder } = require('discord.js');
const config = require('../config');

/**
 * Build a Discord embed from configuration object
 * @param {Object} embedConfig - The embed configuration
 * @returns {EmbedBuilder}
 */
function buildEmbed(embedConfig) {
    const embed = new EmbedBuilder();

    // Title
    if (embedConfig.title) {
        embed.setTitle(embedConfig.title);
    }

    // Description
    if (embedConfig.description) {
        embed.setDescription(embedConfig.description);
    }

    // Color - support hex string or number
    if (embedConfig.color) {
        const color = typeof embedConfig.color === 'string'
            ? parseInt(embedConfig.color.replace('#', ''), 16)
            : embedConfig.color;
        embed.setColor(color);
    } else {
        embed.setColor('#FFFFFF'); // Default white color
    }

    // Author
    if (embedConfig.author) {
        embed.setAuthor({
            name: embedConfig.author.name || embedConfig.author,
            iconURL: embedConfig.author.iconURL,
            url: embedConfig.author.url,
        });
    }

    // Thumbnail
    if (embedConfig.thumbnail) {
        embed.setThumbnail(embedConfig.thumbnail);
    }

    // Image (Banner)
    if (embedConfig.image) {
        embed.setImage(embedConfig.image);
    }

    // Footer with Kitsch styling
    if (embedConfig.footer) {
        embed.setFooter({
            text: embedConfig.footer.text || embedConfig.footer,
            iconURL: embedConfig.footer.iconURL,
        });
    }

    // Header field (placed at top)
    if (embedConfig.header) {
        embed.addFields({
            name: '\u200B', // Zero-width space for styling
            value: `**${embedConfig.header}**`,
            inline: false,
        });
    }

    // Custom fields
    if (embedConfig.fields && Array.isArray(embedConfig.fields)) {
        for (const field of embedConfig.fields) {
            embed.addFields({
                name: field.name,
                value: field.value,
                inline: field.inline || false,
            });
        }
    }

    // Timestamp
    if (embedConfig.timestamp) {
        embed.setTimestamp(new Date(embedConfig.timestamp));
    } else if (embedConfig.addTimestamp) {
        embed.setTimestamp();
    }

    // URL
    if (embedConfig.url) {
        embed.setURL(embedConfig.url);
    }

    return embed;
}



function getColorOptions() {
    return [
        { label: 'White (Default)', value: '#FFFFFF', emoji: '⬜' },
        { label: 'Kitsch Pink', value: '#FF69B4', emoji: '💖' },
        { label: 'Discord Blurple', value: '#5865F2', emoji: '💙' },
        { label: 'Success Green', value: '#57F287', emoji: '💚' },
        { label: 'Warning Yellow', value: '#FEE75C', emoji: '💛' },
        { label: 'Danger Red', value: '#ED4245', emoji: '❤️' },
        { label: 'Purple', value: '#9B59B6', emoji: '💜' },
        { label: 'Orange', value: '#E67E22', emoji: '🧡' },
        { label: 'Teal', value: '#1ABC9C', emoji: '🩵' },
        { label: 'Black', value: '#000000', emoji: '⬛' },
    ];
}

/**
 * Create a preview message for the embed
 * @param {Object} embedConfig - The embed configuration
 * @returns {string}
 */
function createPreviewSummary(embedConfig) {
    const parts = [];

    if (embedConfig.title) parts.push(`**Title:** ${embedConfig.title}`);
    if (embedConfig.description) {
        const desc = embedConfig.description.length > 50
            ? embedConfig.description.substring(0, 50) + '...'
            : embedConfig.description;
        parts.push(`**Description:** ${desc}`);
    }
    if (embedConfig.color) parts.push(`**Color:** ${embedConfig.color}`);
    if (embedConfig.image) parts.push(`**Image:** ✓`);
    if (embedConfig.thumbnail) parts.push(`**Thumbnail:** ✓`);

    return parts.join('\n') || 'Empty embed';
}

module.exports = {
    buildEmbed,
    getColorOptions,
    createPreviewSummary,
};
