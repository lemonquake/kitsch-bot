module.exports = {
    // Discord Bot Settings
    clientId: process.env.APP_ID,
    token: process.env.DISCORD_TOKEN,

    // Allowed roles for bot commands (case-sensitive)
    allowedRoles: ['Admin', 'Event Organizer', 'Mod'],

    // Default embed colors
    colors: {
        default: 0xFFFFFF,    // White (default)
        primary: 0x5865F2,    // Discord Blurple
        success: 0x57F287,    // Green
        warning: 0xFEE75C,    // Yellow
        danger: 0xED4245,     // Red
        kitsch: 0xFF69B4,     // Hot Pink
    },

    // Database path
    dbPath: './data/kitsch.db',

    // Scheduling settings
    timezone: 'Asia/Manila', // Adjust to your timezone

    // Slack Integration
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
};
