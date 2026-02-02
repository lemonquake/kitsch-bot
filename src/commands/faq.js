const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { checkPermissions } = require('../middleware/permissions');
const db = require('../database/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faq')
        .setDescription('Manage the server FAQ / Knowledge Base')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new FAQ entry')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category for the FAQ (e.g. Rules, General, Events)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('question')
                        .setDescription('The question being asked')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all current FAQs')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete an FAQ entry')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The ID of the FAQ to delete')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deploy')
                .setDescription('Post the interactive FAQ menu to the current channel')
        ),

    async execute(interaction) {
        // Permission check
        const { allowed, message } = checkPermissions(interaction);
        if (!allowed) {
            return interaction.reply({ content: message, ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                await handleAdd(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'delete':
                await handleDelete(interaction);
                break;
            case 'deploy':
                await handleDeploy(interaction);
                break;
        }
    },
};

/**
 * Handle adding an FAQ
 */
async function handleAdd(interaction) {
    const category = interaction.options.getString('category');
    const question = interaction.options.getString('question');

    const modal = new ModalBuilder()
        .setCustomId(`faq_add_${category}_${question}`)
        .setTitle('✨ Add FAQ Answer');

    const answerInput = new TextInputBuilder()
        .setCustomId('answer')
        .setLabel('Answer')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the answer to this question...')
        .setMaxLength(2000)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(answerInput));

    await interaction.showModal(modal);
}

/**
 * Handle listing FAQs
 */
async function handleList(interaction) {
    const faqs = db.getFAQs(interaction.guild.id);

    if (faqs.length === 0) {
        return interaction.reply({
            content: '📭 No FAQs found for this server.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Server FAQs')
        .setColor('#FF69B4') // Kitsch Pink
        .setDescription(faqs.map(f => `\`#${f.id}\` **[${f.category}]** ${f.question}`).join('\n'));

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle deleting an FAQ
 */
async function handleDelete(interaction) {
    const id = interaction.options.getInteger('id');
    const faq = db.getFAQById(id);

    if (!faq || faq.guild_id !== interaction.guild.id) {
        return interaction.reply({
            content: '❌ FAQ not found.',
            ephemeral: true,
        });
    }

    db.deleteFAQ(id);
    await interaction.reply({
        content: `✅ FAQ \`#${id}\` has been deleted.`,
        ephemeral: true,
    });
}

/**
 * Handle deploying the FAQ menu
 */
async function handleDeploy(interaction) {
    const categories = db.getCategories(interaction.guild.id);

    if (categories.length === 0) {
        return interaction.reply({
            content: '❌ No FAQs found. Add some first with `/faq add`.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('✨ Knowledge Base')
        .setDescription('Select a category below to browse our Frequently Asked Questions.')
        .setColor('#FF69B4')
        .setThumbnail(interaction.guild.iconURL());

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('faq_category_select')
        .setPlaceholder('Select a category...')
        .addOptions(categories.map(cat => ({
            label: cat,
            value: cat,
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
}
