const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

/**
 * Map string style to Discord ButtonStyle
 */
const styleMap = {
    'PRIMARY': ButtonStyle.Primary,
    'SECONDARY': ButtonStyle.Secondary,
    'SUCCESS': ButtonStyle.Success,
    'DANGER': ButtonStyle.Danger,
    'LINK': ButtonStyle.Link,
};

/**
 * Build button components from configuration
 * @param {Array} buttons - Array of button configurations
 * @returns {ActionRowBuilder[]}
 */
function buildButtons(buttons) {
    if (!buttons || buttons.length === 0) {
        return [];
    }

    // Group buttons by row (max 5 buttons per row, max 5 rows)
    const rows = [];
    let currentRow = [];
    let currentRowIndex = 0;

    for (const btn of buttons) {
        const rowIndex = btn.rowIndex || 0;

        // Start a new row if row index changed or current row is full
        if (rowIndex !== currentRowIndex || currentRow.length >= 5) {
            if (currentRow.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(currentRow));
            }
            currentRow = [];
            currentRowIndex = rowIndex;
        }

        // Create button
        const button = new ButtonBuilder()
            .setLabel(btn.label)
            .setStyle(styleMap[btn.style] || ButtonStyle.Primary);

        // Link buttons use URL, other buttons use customId
        if (btn.style === 'LINK' && isValidUrl(btn.url)) {
            button.setURL(btn.url);
        } else {
            // Fallback for invalid URLs or non-link buttons
            if (btn.style === 'LINK') {
                // If link style but invalid URL, degrade to Primary with customId (or disabled)
                // Better to just not set URL and let it fail? No, that throws.
                // We should probably change style to PRIMARY if URL is invalid to avoid crash
                button.setStyle(ButtonStyle.Primary);
                button.setCustomId(`btn_invalid_${Date.now()}`);
                button.setLabel(`${btn.label} (Invalid URL)`);
                button.setDisabled(true);
            } else {
                button.setCustomId(btn.customId || `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            }
        }

        // Optional emoji
        if (btn.emoji) {
            button.setEmoji(btn.emoji);
        }

        // Optional disabled state
        if (btn.disabled) {
            button.setDisabled(true);
        }

        currentRow.push(button);
    }

    // Add remaining buttons
    if (currentRow.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(currentRow));
    }

    // Limit to 5 rows
    return rows.slice(0, 5);
}

/**
 * Get button style options for select menu
 * @returns {Array}
 */
function getButtonStyleOptions() {
    return [
        { label: 'Primary (Blurple)', value: 'PRIMARY', emoji: '🔵' },
        { label: 'Secondary (Gray)', value: 'SECONDARY', emoji: '⚪' },
        { label: 'Success (Green)', value: 'SUCCESS', emoji: '🟢' },
        { label: 'Danger (Red)', value: 'DANGER', emoji: '🔴' },
        { label: 'Link (Opens URL)', value: 'LINK', emoji: '🔗' },
    ];
}

/**
 * Create button configuration preview
 * @param {Array} buttons - Array of button configurations
 * @returns {string}
 */
function createButtonPreview(buttons) {
    if (!buttons || buttons.length === 0) {
        return 'No buttons configured';
    }

    return buttons.map((btn, index) =>
        `${index + 1}. **${btn.label}** (${btn.style}${btn.url ? ` → ${btn.url}` : ''})`
    ).join('\n');
}

module.exports = {
    buildButtons,
    getButtonStyleOptions,
    createButtonPreview,
    styleMap,
    isValidUrl,
};

function isValidUrl(string) {
    if (!string) return false;
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
