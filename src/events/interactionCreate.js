const { Events, Collection } = require('discord.js');
const { handleModalSubmit } = require('../handlers/modalHandler');
const { handleSelectMenu } = require('../handlers/selectHandler');
const { handleButton } = require('../handlers/buttonHandler');
const { handleHubInteraction } = require('../utils/hubManager');
const { handleTicketInteraction } = require('../handlers/ticketHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Handle slash commands and context menu commands
        if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);

                const errorMessage = '❌ There was an error while executing this command!';

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
            try {
                await handleModalSubmit(interaction);
            } catch (error) {
                console.error('❌ Error handling modal:', error);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Error: ${error.message}\n\`\`\`${error.stack.split('\n').slice(0, 3).join('\n')}\`\`\``,
                        ephemeral: true
                    });
                }
            }
        }
        // Handle select menus
        else if (interaction.isAnySelectMenu()) {
            try {
                await handleSelectMenu(interaction);
            } catch (error) {
                console.error('Error handling select menu:', error);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your selection.',
                        ephemeral: true
                    });
                }
            }
        }
        // Handle button clicks
        else if (interaction.isButton()) {
            try {
                if (interaction.customId.startsWith('hub_page_')) {
                    await handleHubInteraction(interaction);
                } else if (interaction.customId.startsWith('hub_ctrl_')) {
                    await handleButton(interaction);
                } else if (interaction.customId.startsWith('ticket_')) {
                    await handleTicketInteraction(interaction);
                } else {
                    await handleButton(interaction);
                }
            } catch (error) {
                console.error('Error handling button:', error);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing the button click.',
                        ephemeral: true
                    });
                }
            }
        }
        // Handle autocomplete
        else if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command || !command.autocomplete) {
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Error handling autocomplete:', error);
            }
        }
    },
};
