require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

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

// Deploy commands
(async () => {
    try {
        console.log('');
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Deploy globally
        const data = await rest.put(
            Routes.applicationCommands(process.env.APP_ID),
            { body: commands },
        );

        console.log(`✅ Successfully registered ${data.length} application (/) commands globally.`);
        console.log('');
        console.log('📝 Note: Global commands may take up to 1 hour to appear in all servers.');
        console.log('');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
