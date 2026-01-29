const { allowedRoles } = require('../config');

/**
 * Check if the user has permission to use bot commands
 * @param {import('discord.js').Interaction} interaction - Discord interaction
 * @returns {{ allowed: boolean, message?: string }}
 */
function checkPermissions(interaction) {
    // Ensure we're in a guild context
    if (!interaction.guild || !interaction.member) {
        return {
            allowed: false,
            message: '❌ This command can only be used in a server.',
        };
    }

    const memberRoles = interaction.member.roles.cache;

    // Check if the user has any of the allowed roles
    const hasPermission = memberRoles.some(role =>
        allowedRoles.includes(role.name)
    );

    if (!hasPermission) {
        return {
            allowed: false,
            message: `❌ You don't have permission to use this command.\n\nRequired roles: **${allowedRoles.join('**, **')}**`,
        };
    }

    return { allowed: true };
}

/**
 * Middleware wrapper for commands that require permission checks
 * @param {Function} handler - The command handler function
 * @returns {Function} Wrapped handler with permission check
 */
function requirePermission(handler) {
    return async (interaction) => {
        const { allowed, message } = checkPermissions(interaction);

        if (!allowed) {
            return interaction.reply({
                content: message,
                ephemeral: true,
            });
        }

        return handler(interaction);
    };
}

module.exports = {
    checkPermissions,
    requirePermission,
};
