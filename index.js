require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo, KazagumoPlayer } = require('kazagumo');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandsData = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'run' in command) {
        client.commands.set(command.data.name, command);
        commandsData.push(command.data);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "run" property.`);
    }
}


// ตั้งค่าเชื่อมต่อ Lavalink Server ที่รันอยู่บนเครื่อง
const Nodes = [{
    name: 'LocalNode',
    url: `${process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || '2333'}`,
    auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    secure: false
}];

const kazagumo = new Kazagumo({
    defaultSearchEngine: "soundcloud",
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes);

kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node: ${name} is now connected`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink Node: ${name} error:`, error));

// Event เมื่อเริ่มเล่นเพลง
kazagumo.on("playerStart", (player, track) => {
    if (!player.textId) return;
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Now Playing')
        .setDescription(`**${track.title}**\n\nRequested by: <@${track.requester.id}>`);

    channel.send({ embeds: [embed] }).catch(() => { });
});

// Event เมื่อคิวหมด
kazagumo.on("playerEmpty", player => {
    if (!player.textId) return;
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setDescription('🎵 คิวเพลงว่างเปล่าแล้วค่ะ! ดีเจสาวขอตัวไปพักเติมแป้งก่อนนะคะ 💋');
        channel.send({ embeds: [embed] }).catch(() => { });
    }
    player.destroy();
});

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag} (Lavalink Version)!`);

    try {
        await client.application.commands.set(commandsData);
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) {
        return interaction.reply({ 
            embeds: [new EmbedBuilder().setColor('#FF69B4').setDescription('❌ อ๊ะๆ! ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้นนะคะที่รัก 💕')], 
            ephemeral: true 
        });
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.run(client, interaction, kazagumo);
    } catch (error) {
        console.error(error);
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setDescription('❌ ว้าย! มีข้อผิดพลาดนิดหน่อยตอนรันคำสั่งนี้ค่ะ ขออภัยด้วยนะคะ 🥺');
            
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
});

// เริ่มการทำงานของบอท
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ไม่พบ DISCORD_TOKEN ในไฟล์ .env");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
