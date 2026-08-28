require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const QueueManager = require('./src/QueueManager');
const cacheManager = require('./src/CacheManager');

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


// สร้าง Audio Engine และ QueueManager
const kazagumo = new QueueManager(client);

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

// Event เมื่อเพลงติดขัด
kazagumo.on("playerStuck", (player, track, threshold) => {
    console.warn(`⚠️ Player stuck on track: ${track.title} (threshold: ${threshold}ms)`);
});

// Event เมื่อเกิดข้อผิดพลาดในการเล่นเพลง
kazagumo.on("playerException", (player, track, exception) => {
    console.error(`❌ Player exception on track: ${track?.title}:`, JSON.stringify(exception || exception?.message || {}));
});

// Event เมื่อเพลงจบ
kazagumo.on("playerEnd", (player, track) => {
    console.log(`ℹ️ Player ended track: ${track.title}`);
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
    console.log(`✅ Logged in as ${client.user.tag} (yt-dlp Version)!`);

    // Cache cleanup: run once at startup, then hourly sweep (files older than 24h)
    cacheManager.cleanOldCache(24);
    setInterval(() => cacheManager.cleanOldCache(24), 60 * 60 * 1000).unref();

    try {
        await client.application.commands.set(commandsData);
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildDelete', guild => {
    console.log(`[GuildLeave] Bot removed from guild: ${guild.name} (${guild.id})`);
});

client.on('guildUnavailable', guild => {
    console.warn(`[GuildUnavailable] Guild is unavailable: ${guild.name} (${guild.id})`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor('#FF69B4').setDescription('❌ อ๊ะๆ! ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้นนะคะที่รัก 💕')],
            ephemeral: true
        });
    }
    if (!interaction.guild) {
        console.error(`[GuildCache] Bot is not in guild ${interaction.guildId} — interaction received from guild the bot has left or cannot access.`);
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor('#FF69B4').setDescription('❌ บอทไม่อยู่ในเซิร์ฟเวอร์นี้แล้วค่ะ กรุณาเชิญบอทใหม่ด้วยนะคะ 🥺')],
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

// Auto-disconnect when no non-bot members remain in the bot's voice channel
client.on('voiceStateUpdate', (oldState, newState) => {
    // Ignore the bot's own state changes (handled by Player.js Disconnected logic)
    if (oldState.member?.user.bot) return;

    const player = kazagumo.getPlayer(oldState.guild.id);
    if (!player || !player.voiceId) return;

    // Check both old and new channel to cover members switching channels
    const channelIds = [oldState.channelId, newState.channelId]
        .filter((id, index, arr) => id === player.voiceId && arr.indexOf(id) === index);

    for (const channelId of channelIds) {
        const channel = oldState.guild.channels.cache.get(channelId);
        if (!channel) continue;
        const nonBotMembers = channel.members.filter(m => !m.user.bot);
        if (nonBotMembers.size === 0) {
            player.destroy();
            break;
        }
    }
});

// เริ่มการทำงานของบอท
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ไม่พบ DISCORD_TOKEN ในไฟล์ .env");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
