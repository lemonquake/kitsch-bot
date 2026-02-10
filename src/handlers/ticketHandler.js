const db = require('../database/db');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

async function handleTicketInteraction(interaction) {
    if (interaction.customId === 'ticket_close') {
        const ticket = db.getTicketByChannel(interaction.channel.id);

        if (!ticket) {
            return interaction.reply({ content: '❌ This is not a tracked ticket channel.', ephemeral: true });
        }

        // Show Modal to ask for Custom ID / Reference
        const modal = new ModalBuilder()
            .setCustomId('ticket_close_modal')
            .setTitle('Close Ticket');

        const ticketIdInput = new TextInputBuilder()
            .setCustomId('ticket_ref')
            .setLabel("Ticket Reference / ID (Optional)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. BILLING-123 or just leave empty")
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(ticketIdInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'ticket_close_modal') {
        const ticketRef = interaction.fields.getTextInputValue('ticket_ref');
        const ticket = db.getTicketByChannel(interaction.channel.id);

        if (ticket && ticketRef) {
            db.updateTicketCustomId(ticket.id, ticketRef);
        }

        const replyContent = (ticketRef && !ticket)
            ? `⚠️ **Warning:** Could not link Custom ID '${ticketRef}' to this ticket (DB mismatch). Proceeding to close.`
            : (ticketRef ? `Ticket Reference set to **${ticketRef}**. Are you sure you want to close?` : 'Are you sure you want to close this ticket?');

        // Confirmation (Now moved here after modal)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_confirm_close')
                .setLabel('Confirm Close')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_cancel_close')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
            content: replyContent,
            components: [row]
        });
    }
    else if (interaction.customId === 'ticket_confirm_close') {
        await interaction.update({ content: '🔒 Closing ticket...', components: [] });

        db.closeTicket(interaction.channel.id);

        setTimeout(async () => {
            await interaction.channel.delete().catch(() => { });
        }, 3000);
    }
    else if (interaction.customId === 'ticket_cancel_close') {
        await interaction.update({ content: '✅ Close cancelled.', components: [] });
    }
}

module.exports = { handleTicketInteraction };
