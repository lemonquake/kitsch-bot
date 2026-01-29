const cron = require('node-cron');
const { buildEmbed } = require('./embedBuilder');
const { buildButtons } = require('./buttonBuilder');
const db = require('../database/db');

// Store active scheduled jobs in memory
const activeJobs = new Map();

// Reference to Discord client (set during init)
let client = null;

/**
 * Initialize the scheduler with Discord client
 * @param {import('discord.js').Client} discordClient
 */
async function initScheduler(discordClient) {
    client = discordClient;

    // Restore pending jobs from database
    await restorePendingJobs();

    // Start job checker (runs every minute to handle scheduled posts)
    cron.schedule('* * * * *', () => {
        checkScheduledJobs();
    });

    console.log('✅ Scheduler initialized');
}

/**
 * Restore pending jobs from database on startup
 */
async function restorePendingJobs() {
    try {
        const pendingJobs = db.getPendingJobs();
        console.log(`📅 Found ${pendingJobs.length} pending scheduled jobs`);

        for (const job of pendingJobs) {
            scheduleJob(job);
        }
    } catch (error) {
        console.error('Error restoring pending jobs:', error);
    }
}

/**
 * Check and execute scheduled jobs that are due
 */
async function checkScheduledJobs() {
    if (!client) return;

    const now = new Date();

    for (const [jobId, job] of activeJobs) {
        const scheduledTime = new Date(job.scheduled_time);

        if (scheduledTime <= now) {
            console.log(`⏰ Executing scheduled job ${jobId}`);
            await executeJob(job);
            activeJobs.delete(jobId);
        }
    }
}

/**
 * Schedule a job for future execution
 * @param {Object} job - Job data from database
 */
function scheduleJob(job) {
    const scheduledTime = new Date(job.scheduled_time);
    const now = new Date();

    // If already past due, execute immediately
    if (scheduledTime <= now) {
        executeJob(job);
        return;
    }

    // Store in active jobs
    activeJobs.set(job.id, job);
    console.log(`📅 Scheduled job ${job.id} for ${scheduledTime.toISOString()}`);
}

/**
 * Execute a scheduled job
 * @param {Object} job - Job data from database
 */
async function executeJob(job) {
    try {
        if (!client) {
            console.error('Discord client not available');
            return;
        }

        // Get the channel
        const channel = await client.channels.fetch(job.channel_id);
        if (!channel) {
            console.error(`Channel ${job.channel_id} not found`);
            db.updateJobStatus(job.id, 'failed');
            return;
        }

        // Build the embed
        const embed = buildEmbed(job.config);

        // Get buttons from database
        const buttons = db.getEmbedButtons(job.embed_id);
        const components = buildButtons(buttons);

        // Send the message
        const message = await channel.send({
            embeds: [embed],
            components: components,
        });

        // Update database
        db.updateEmbedMessageId(job.embed_id, message.id);
        db.updateJobStatus(job.id, 'completed');

        console.log(`✅ Scheduled message posted: ${message.id}`);
    } catch (error) {
        console.error('Error executing scheduled job:', error);
        db.updateJobStatus(job.id, 'failed');
    }
}

/**
 * Create a new scheduled post
 * @param {Object} options - Scheduling options
 * @returns {Object} Created job info
 */
function createScheduledPost({ embedId, channelId, guildId, config, scheduledTime }) {
    // Create scheduled job in database
    const jobId = db.createScheduledJob(embedId, scheduledTime);

    // Schedule in memory
    const job = {
        id: jobId,
        embed_id: embedId,
        channel_id: channelId,
        guild_id: guildId,
        config: config,
        scheduled_time: scheduledTime,
    };

    scheduleJob(job);

    return { jobId, scheduledTime };
}

/**
 * Cancel a scheduled post
 * @param {number} embedId - The embed ID to cancel
 */
function cancelScheduledPost(embedId) {
    // Find and remove from active jobs
    for (const [jobId, job] of activeJobs) {
        if (job.embed_id === embedId) {
            activeJobs.delete(jobId);
            break;
        }
    }

    // Update database
    db.cancelScheduledJob(embedId);
}

/**
 * Parse a date/time string to Date object
 * @param {string} dateStr - Date string (e.g., "2024-01-15")
 * @param {string} timeStr - Time string (e.g., "10:30 PM")
 * @returns {Date|null}
 */
function parseDateTime(dateStr, timeStr) {
    try {
        // Parse time in 12-hour format (HH:MM AM/PM)
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!timeMatch) {
            return null;
        }

        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const period = timeMatch[3].toUpperCase();

        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
            hours = 0;
        }

        // Parse date
        const [year, month, day] = dateStr.split('-').map(Number);

        return new Date(year, month - 1, day, hours, minutes);
    } catch (error) {
        console.error('Error parsing date/time:', error);
        return null;
    }
}

/**
 * Get a relative time description
 * @param {Date} date - The scheduled date
 * @returns {string}
 */
function getRelativeTime(date) {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
        return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
        return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
        return 'very soon';
    }
}

module.exports = {
    initScheduler,
    createScheduledPost,
    cancelScheduledPost,
    parseDateTime,
    getRelativeTime,
};
