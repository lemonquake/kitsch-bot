const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manage and view support tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your past tickets')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a transcript of a specific ticket')
                .addStringOption(option =>
                    option.setName('id_or_ref')
                        .setDescription('The Ticket ID or Reference to view')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const tickets = db.getUserTickets(interaction.user.id);

            if (tickets.length === 0) {
                return interaction.reply({ content: '📭 You have no past tickets.', ephemeral: true });
            }

            // limit to 25 most recent tickets to avoid embed limits
            const recentTickets = tickets.slice(0, 25);

            const embed = new EmbedBuilder()
                .setTitle('📂 Your Ticket History')
                .setColor('#5865F2')
                .setDescription(recentTickets.map(t =>
                    `**#${t.id}** ${t.custom_id ? `(${t.custom_id}) ` : ''}- <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R> - ${t.status.toUpperCase()}`
                ).join('\n'))
                .setFooter({ text: tickets.length > 25 ? `Showing 25 of ${tickets.length} tickets` : `${tickets.length} tickets found` });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (subcommand === 'view') {
            try {
                // Support both new string option and potential legacy integer option (cache issues)
                const idOrRefOption = interaction.options.get('id_or_ref');
                const idOption = interaction.options.get('id');

                let ticketIdOrRef;

                if (idOrRefOption) {
                    ticketIdOrRef = String(idOrRefOption.value).trim();
                } else if (idOption) {
                    ticketIdOrRef = String(idOption.value).trim();
                } else {
                    return interaction.reply({ content: '❌ Invalid arguments provided. Please restart your client to update commands.', ephemeral: true });
                }

                const ticket = db.getTicketByIdOrCustomId(ticketIdOrRef);

                if (!ticket) {
                    return interaction.reply({ content: `❌ Ticket '${ticketIdOrRef}' not found.`, ephemeral: true });
                }

                // Check permissions (Admin or Ticket Owner)
                // For now, let's allow admins or the ticket creator
                // Note: `interaction.member.permissions` requires the command to be in a guild.
                const isAdmin = interaction.member.permissions.has('Administrator'); // Or suitable permission
                if (ticket.user_id !== interaction.user.id && !isAdmin) {
                    return interaction.reply({ content: '⛔ You do not have permission to view this ticket.', ephemeral: true });
                }

                const messages = db.getTicketMessages(ticket.id);

                if (messages.length === 0) {
                    return interaction.reply({ content: '📭 This ticket has no messages.', ephemeral: true });
                }

                // Generating a transcript embed
                // Discord embeds have limits (4096 chars description, 6000 chars total).
                // We might need to split if it's too long, but for now let's keep it simple or show the last N messages.

                // Format messages
                let transcript = '';
                for (const msg of messages) {
                    const time = `<t:${Math.floor(new Date(msg.created_at).getTime() / 1000)}:t>`;
                    const author = msg.sender_id === ticket.user_id ? `**User**` : `**Support**`;
                    // A better way would be using the stored name
                    const authorName = `**${msg.sender_name}**`;

                    const attachmentObj = msg.attachment_url ? `\n[Attachment](${msg.attachment_url})` : '';

                    transcript += `${time} ${authorName}: ${msg.content}${attachmentObj}\n`;
                }

                // Chunking for embed limits
                // Simple approach: slice to last 4000 chars roughly if needed, or send multiple embeds.
                // Let's just truncate for MVP safety.
                if (transcript.length > 4000) {
                    transcript = '... [Old messages truncated] ...\n' + transcript.slice(transcript.length - 4000);
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📜 Transcript: Ticket #${ticket.id}`)
                    .setDescription(transcript)
                    .setColor('#2F3136')
                    .setFooter({ text: `Status: ${ticket.status} | Created: ${ticket.created_at}` });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                console.error('Error in ticket view:', error);
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ An error occurred while fetching the ticket.', ephemeral: true });
                }
            }
        }
    },
};
