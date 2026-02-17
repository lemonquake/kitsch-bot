const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const { buildSessions } = require('./embed');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Edit embedded message')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        const targetMessage = interaction.targetMessage;

        // 1. Check if message is from this bot
        if (targetMessage.author.id !== interaction.client.user.id) {
            return interaction.reply({
                content: '❌ I can only edit messages sent by me (Kitsch Bot).',
                ephemeral: true,
            });
        }

        // 2. Check if message has embeds
        if (targetMessage.embeds.length === 0) {
            return interaction.reply({
                content: '❌ This message does not contain an embed.',
                ephemeral: true,
            });
        }

        const embed = targetMessage.embeds[0];
        const messageId = targetMessage.id;

        // 3. Try to find in DB
        let embedData = db.getEmbedByMessageId(messageId);
        let config = {};
        let content = targetMessage.content; // Use current message content as default
        let buttons = [];

        if (embedData) {
            // Found in DB - use high-fidelity data
            if (embedData.guild_id !== interaction.guild.id) {
                return interaction.reply({
                    content: '❌ This embed belongs to another server (ID mismatch).',
                    ephemeral: true,
                });
            }
            config = embedData.config;
            content = embedData.content;

            // Load buttons from DB
            buttons = db.getEmbedButtons(embedData.id).map(b => ({
                label: b.label,
                style: b.style,
                url: b.url,
                customId: b.custom_id,
                rowIndex: b.row_index,
                position: b.position
            }));

        } else {
            // Not in DB - Hydrate from message object (Best Effort)
            config = {
                title: embed.title,
                description: embed.description,
                url: embed.url,
                color: embed.color, // Int
                timestamp: embed.timestamp,
                footer: embed.footer ? { text: embed.footer.text, iconURL: embed.footer.iconURL } : undefined,
                image: embed.image ? embed.image.url : undefined,
                thumbnail: embed.thumbnail ? embed.thumbnail.url : undefined,
                author: embed.author ? { name: embed.author.name, url: embed.author.url, iconURL: embed.author.iconURL } : undefined,
                fields: embed.fields || []
            };

            // Parse buttons from message components
            if (targetMessage.components.length > 0) {
                // Helper to convert numeric style to string
                const getStyleName = (style) => {
                    switch (style) {
                        case ButtonStyle.Primary: return 'PRIMARY';
                        case ButtonStyle.Secondary: return 'SECONDARY';
                        case ButtonStyle.Success: return 'SUCCESS';
                        case ButtonStyle.Danger: return 'DANGER';
                        case ButtonStyle.Link: return 'LINK';
                        default: return 'PRIMARY';
                    }
                };

                targetMessage.components.forEach((row, rowIndex) => {
                    row.components.forEach((component, colIndex) => {
                        if (component.type === 2) { // Button type is 2
                            buttons.push({
                                label: component.label || 'Button',
                                style: getStyleName(component.style),
                                url: component.url,
                                customId: component.customId,
                                rowIndex: rowIndex,
                                position: colIndex
                            });
                        }
                    });
                });
            }
        }

        // 4. Initialize Session
        const sessionId = interaction.user.id;

        buildSessions.set(sessionId, {
            channelId: interaction.channelId,
            guildId: interaction.guildId,
            messageId: messageId,
            embedId: embedData ? embedData.id : null, // Null if not in DB yet
            config: config,
            content: content,
            buttons: buttons,
            isEdit: true,
            step: 'content',
        });

        // 5. Show Modal (Copied from embed.js handleEdit logic)
        const modal = new ModalBuilder()
            .setCustomId(`embed_content_${sessionId}`)
            .setTitle('✏️ Edit Kitsch Embed');

        // We use the config we just loaded/parsed
        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter embed title...')
            .setMaxLength(256)
            .setRequired(false)
            .setValue(config.title || '');

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Message Content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Message text outside the embed...')
            .setMaxLength(2000)
            .setRequired(false)
            .setValue(content || '');

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter embed description...')
            .setMaxLength(4000)
            .setRequired(false)
            .setValue(config.description || '');

        const authorInput = new TextInputBuilder()
            .setCustomId('author')
            .setLabel('Author Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter author name...')
            .setMaxLength(256)
            .setRequired(false)
            .setValue(typeof config.author === 'object' ? config.author.name : (config.author || ''));

        const footerInput = new TextInputBuilder()
            .setCustomId('footer')
            .setLabel('Footer Text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter footer text...')
            .setMaxLength(2048)
            .setRequired(false)
            .setValue(typeof config.footer === 'object' ? config.footer.text : (config.footer || ''));

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(authorInput),
            new ActionRowBuilder().addComponents(footerInput)
        );

        await interaction.showModal(modal);
    },
};
