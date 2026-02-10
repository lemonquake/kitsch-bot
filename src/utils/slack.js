const config = require('../config');

/**
 * Sends a notification to Slack via Incoming Webhook
 * @param {Object} ticketInfo - Information about the created ticket
 * @param {string} ticketInfo.channelName - The name of the Discord ticket channel
 * @param {string} ticketInfo.channelUrl - The URL of the Discord ticket channel
 * @param {Object} ticketInfo.user - The Discord user who opened the ticket
 * @param {string} ticketInfo.reason - (Optional) Reason for the ticket
 */
async function sendSlackNotification(ticketInfo) {
    const webhookUrl = config.slackWebhookUrl;

    if (!webhookUrl) {
        console.warn('⚠️ Slack Webhook URL is not configured. Skipping notification.');
        return;
    }

    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🎫 New Support Ticket Opened",
                    emoji: true
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*User:*\n<@${ticketInfo.user.id}> (${ticketInfo.user.tag})`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Channel:*\n<${ticketInfo.channelUrl}|#${ticketInfo.channelName}>`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Reason:*\n${ticketInfo.reason || "No reason provided."}`
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "View Ticket in Discord"
                        },
                        url: ticketInfo.channelUrl,
                        style: "primary"
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Slack API error: ${response.statusText}`);
        }

    } catch (error) {
        console.error('❌ Failed to send Slack notification:', error);
    }
}

module.exports = { sendSlackNotification };
