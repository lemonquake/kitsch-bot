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

        // Handle target channels (array or single channel_id fallback)
        let channels = job.target_channels || (job.channel_id ? [job.channel_id] : []);
        // Clean up duplicates and empty
        channels = [...new Set(channels)].filter(c => c);

        console.log(`Doing job ${job.id} for channels:`, channels);

        // Fetch full embed data including content and message_type
        const embedData = db.getEmbedById(job.embed_id);
        const content = embedData ? embedData.content : null;
        const messageType = embedData ? (embedData.message_type || 'embed') : 'embed';

        // Build content once
        const embed = buildEmbed(job.config);
        const buttons = db.getEmbedButtons(job.embed_id);
        const components = buildButtons(buttons);

        for (const channelId of channels) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel) continue;

                const payload = {
                    components: components,
                };

                if (content) {
                    payload.content = content;
                }

                if (messageType === 'embed') {
                    payload.embeds = [embed];
                }

                const message = await channel.send(payload);

                // If this is the "primary" channel (stored in embed table), update message ID
                // Or maybe just update last message ID in sticky table if we had one?
                // For now, we only store one message_id in embeds table. 
                // We'll just store the last one success.
                if (channelId === job.channel_id || channels.length === 1) {
                    db.updateEmbedMessageId(job.embed_id, message.id);
                }
            } catch (err) {
                console.error(`Failed to send to channel ${channelId}:`, err.message);
            }
        }

        // Handle Recurrence
        if (job.recurrence && job.recurrence.length > 0) {
            const nextDate = calculateNextOccurrence(job.scheduled_time, job.recurrence);
            console.log(`🔁 Rescheduling recurring job ${job.id} for ${nextDate.toISOString()}`);

            // Update DB
            db.updateScheduledJob(job.id, nextDate.toISOString(), job.recurrence, job.target_channels, job.name);

            // Update active job in memory
            job.scheduled_time = nextDate.toISOString();
            scheduleJob(job); // Re-add to map with new time

            // Do NOT mark as completed
        } else {
            db.updateJobStatus(job.id, 'completed');
            console.log(`✅ Scheduled job ${job.id} completed`);
        }

    } catch (error) {
        console.error('Error executing scheduled job:', error);
        db.updateJobStatus(job.id, 'failed');
    }
}

/**
 * Calculate next occurrence based on current time and recurrence days
 * recurrence: ["MON", "WED"]
 */
function calculateNextOccurrence(lastScheduledStr, days) {
    // Days mapping
    const dayMap = { 'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6 };
    const validDays = days.map(d => dayMap[d]).sort((a, b) => a - b);

    let date = new Date(lastScheduledStr);
    // Be sure to start checking from "now" or "last scheduled + 1 minute" to avoid infinite loop if called immediately?
    // Actually, we usually call this AFTER execution, so the time is in the past or now.
    // We want the NEXT valid day.

    // If we just executed, we add 1 day and check.
    date.setDate(date.getDate() + 1);

    // Safety break
    let loops = 0;
    while (loops < 14) { // Max 2 weeks search
        if (validDays.includes(date.getDay())) {
            return date;
        }
        date.setDate(date.getDate() + 1);
        loops++;
    }

    return date; // Fallback
}

/**
 * Create a new scheduled post
 * @param {Object} options - Scheduling options
 * @returns {Object} Created job info
 */
function createScheduledPost({ embedId, targetChannels, guildId, config, scheduledTime, recurrence, name }) {
    // Create scheduled job in database
    const jobId = db.createScheduledJob(embedId, scheduledTime, recurrence, targetChannels, name);

    // Schedule in memory
    const job = {
        id: jobId,
        embed_id: embedId,
        target_channels: targetChannels,
        guild_id: guildId,
        config: config,
        scheduled_time: scheduledTime,
        recurrence: recurrence,
        name: name
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
 * Create a Date object from components in a specific timezone
 * @param {number} year
 * @param {number} month (0-11)
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {string} timeZone
 * @returns {Date}
 */
function createDateInTimezone(year, month, day, hour, minute, timeZone) {
    // Create a date assuming the input components are UTC
    const utcDate = new Date(Date.UTC(year, month, day, hour, minute));

    // Get the time parts of this UTC date in the target timezone
    const tzDateStr = utcDate.toLocaleString('en-US', { timeZone, hour12: false });

    // Creating a date from the formatted string to get the "shifted" time
    // We basically want to know "What time is 10:00 UTC in Manila?" -> "18:00"
    // Then we see the difference is 8 hours.

    // A more reliable way:
    // Get the ISO string of the wall time in target timezone
    // e.g., we want 10:00 Manila.
    // 10:00 UTC is 18:00 Manila. diff = +8h.
    // We want 10:00 Manila, so we need 02:00 UTC.
    // So we need to subtract the offset.

    // Let's use the 'parts' approach to calculate offset
    const options = { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(utcDate);

    const tzParts = {};
    parts.forEach(p => tzParts[p.type] = p.value);

    // Construct a Date object from the parts found in the timezone
    // e.g. if utcDate is 10:00 UTC, and timezone says it's 18:00, this creates 18:00 UTC (system local if using Date.UTC? No, use Date.UTC)
    const tzDateAsUtc = new Date(Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzParts.hour, tzParts.minute, tzParts.second));

    // Calculate offset in milliseconds
    const offset = tzDateAsUtc.getTime() - utcDate.getTime();

    // Apply reverse offset to get the correct UTC timestamp for the desired wall time
    return new Date(utcDate.getTime() - offset);
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

        // Create date using configured timezone
        const { timezone } = require('../config');
        return createDateInTimezone(year, month - 1, day, hours, minutes, timezone);
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
