require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Your server ID
const GUILD_ID = '1181666350834384986';

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all command data
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`📦 Loaded: ${command.data.name}`);
    }
}

// Create REST instance
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands to specific guild (instant)
(async () => {
    try {
        console.log('');
        console.log(`🚀 Deploying ${commands.length} commands to guild ${GUILD_ID}...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.APP_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`✅ Successfully registered ${data.length} commands to your server!`);
        console.log('');
        console.log('📝 Guild commands appear instantly (no waiting).');
        console.log('');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
