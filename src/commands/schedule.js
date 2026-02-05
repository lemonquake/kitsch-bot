const {
    SlashCommandBuilder,
    ChannelType
} = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');
const { handleCreate, handleList, handleEdit, handleDelete } = require('../handlers/scheduleHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Manage scheduled messages and announcements')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new scheduled message')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all scheduled messages')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit a scheduled message')
                .addStringOption(option =>
                    option
                        .setName('subscription_id')
                        .setDescription('The ID of the scheduled message to edit')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Cancel and delete a scheduled message')
                .addStringOption(option =>
                    option
                        .setName('subscription_id')
                        .setDescription('The ID of the scheduled message to delete')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        // Permission check
        const { allowed, message } = checkPermissions(interaction);
        if (!allowed) {
            return interaction.reply({ content: message, ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreate(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'edit':
                await handleEdit(interaction);
                break;
            case 'delete':
                await handleDelete(interaction);
                break;
        }
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const db = require('../database/db');
        const jobs = db.getPendingJobs(); // You might need to filter by guild if the method returns all

        // Filter jobs for this guild and match user input
        const filtered = jobs.filter(job => {
            // Ensure job belongs to this guild (assuming job has guild_id)
            if (job.guild_id !== interaction.guild.id) return false;

            // Search by ID or potentially embed title if available
            // For now assuming we just search by ID or maybe we can fetch titles?
            // Let's use ID for now and improve if we have more data
            return job.id.toString().includes(focusedValue);
        });

        await interaction.respond(
            filtered.slice(0, 25).map(job => ({ name: `ID: ${job.id} - ${job.scheduled_time}`, value: job.id.toString() }))
        );
    }
};
