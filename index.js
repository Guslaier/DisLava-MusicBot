require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Options, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const QueueManager = require('./src/QueueManager');
const cacheManager = require('./src/CacheManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ],
    makeCache: Options.cacheWithLimits({
        ApplicationCommandManager: 0,
        BaseGuildEmojiManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        MessageManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        ReactionUserManager: 0,
        StageInstanceManager: 0,
        ThreadManager: 0,
        ThreadMemberManager: 0
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 300,
            lifetime: 60
        }
    }
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
    if (global.gc) global.gc();
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
    if (global.gc) global.gc();
});

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag} (yt-dlp Version)!`);

    // Cache cleanup: run once at startup, then sweep every 30m (files older than 2h)
    cacheManager.cleanOldCache(2);
    setInterval(() => cacheManager.cleanOldCache(2), 30 * 60 * 1000).unref();

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
    if (oldState.id === client.user.id || newState.id === client.user.id) return;

    const guild = oldState.guild || newState.guild;
    if (!guild) return;

    const player = kazagumo.getPlayer(guild.id);
    if (!player || !player.voiceId) return;

    // Check only if someone left or moved away from the bot's voice channel
    if (oldState.channelId !== player.voiceId && newState.channelId !== player.voiceId) return;

    const channel = guild.channels.cache.get(player.voiceId);
    if (!channel) return;

    const nonBotMembers = channel.members.filter(m => !m.user.bot);
    if (nonBotMembers.size === 0) {
        console.log(`[Player] No members left in voice channel, disconnecting from ${guild.name} (${guild.id})`);
        player.destroy();
    }
});

// --- Startup Checklist ---
async function runStartupCheck() {
    console.log('\n--- 🚀 [DisLava] Startup Checklist ---');
    let allGood = true;

    // 1. Check Token
    if (!process.env.DISCORD_TOKEN) {
        console.log('❌ [Environment] DISCORD_TOKEN is missing in .env!');
        allGood = false;
    } else {
        console.log('✅ [Environment] DISCORD_TOKEN found.');
    }

    // 2. Check yt-dlp
    const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp');
    if (fs.existsSync(ytDlpPath)) {
        console.log('✅ [yt-dlp] Binary found.');
    } else {
        console.log('❌ [yt-dlp] Binary is missing at bin/yt-dlp!');
        allGood = false;
    }

    // 3. Check cookies.txt
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        console.log('✅ [Cookies] cookies.txt found. (YouTube playback should work)');
    } else {
        console.log('⚠️ [Cookies] cookies.txt is MISSING! (YouTube playback might fail with "Sign in" error)');
    }

    // 4. Check FFmpeg/FFprobe
    const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg-bundle', 'ffmpeg');
    const ffprobePath = path.join(__dirname, 'bin', 'ffmpeg-bundle', 'ffprobe');
    if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
        console.log('✅ [FFmpeg] FFmpeg & FFprobe binaries are ready.');
    } else {
        console.log('⚠️ [FFmpeg] FFmpeg/FFprobe binaries not fully set up. (Will be downloaded automatically by CacheManager)');
    }

    // 5. Check Commands
    if (commandsData && commandsData.length > 0) {
        console.log(`✅ [Commands] Loaded ${commandsData.length} commands successfully.`);
    } else {
        console.log('❌ [Commands] No commands found or loaded!');
        allGood = false;
    }

    console.log('--------------------------------------\n');
    return allGood;
}

// เริ่มการทำงานของบอท
(async () => {
    const isReady = await runStartupCheck();
    if (!isReady) {
        console.error("❌ บอทไม่สามารถเริ่มทำงานได้เนื่องจากระบบหลักหรือไฟล์สำคัญขาดหาย กรุณาเช็ค Log ด้านบนครับ");
        process.exit(1);
    }
    client.login(process.env.DISCORD_TOKEN);
})();
