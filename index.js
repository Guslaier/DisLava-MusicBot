require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Options, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const QueueManager = require('./src/QueueManager');
const cacheManager = require('./src/CacheManager');
const { createNowPlayingCard } = require('./src/helpers/musicCardHelper');
const favoriteManager = require('./src/helpers/favoriteManager');

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
        commandsData.push(typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "run" property.`);
    }
}

// สร้าง Audio Engine และ QueueManager
const kazagumo = new QueueManager(client);

// Event เมื่อเริ่มเล่นเพลง
kazagumo.on("playerStart", async (player, track) => {
    console.log(`[Player] 🎧 Now Playing: "${track?.title}" | Real Source: ${track?.realSource || (track?.uri?.includes('soundcloud.com') ? 'SoundCloud' : 'YouTube')}`);
    if (!player.textId) return;
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    if (player.nowPlayingMessage) {
        try {
            await player.nowPlayingMessage.delete().catch(() => {});
        } catch {}
        player.nowPlayingMessage = null;
    }

    try {
        const cardData = createNowPlayingCard(player, track);
        const msg = await channel.send(cardData);
        player.nowPlayingMessage = msg;
    } catch (err) {
        console.error('[playerStart] Error sending now playing card:', err.message);
    }
});

// Event เมื่อเพลงติดขัด
kazagumo.on("playerStuck", (player, track, threshold) => {
    console.warn(`⚠️ Player stuck on track: ${track?.title} (threshold: ${threshold}ms)`);
});

// Event เมื่อเกิดข้อผิดพลาดในการเล่นเพลง
kazagumo.on("playerException", (player, track, exception) => {
    const errorMsg = exception?.message || (typeof exception === 'string' ? exception : 'Unknown Error');
    const trackTitle = track?.title || 'Unknown Track';
    console.error(`❌ Player exception on track "${trackTitle}":`, errorMsg);

    if (!player.textId) return;
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ ไม่สามารถโหลดเพลง **${trackTitle}** ได้ค่ะ ขอข้ามไปเพลงถัดไปนะคะ 🥺\n\`${errorMsg}\``);
        channel.send({ embeds: [embed] }).catch(() => { });
    }
});

// Event เมื่อเพลงจบ
kazagumo.on("playerEnd", (player, track) => {
    console.log(`ℹ️ Player ended track: ${track?.title || 'Track'}`);
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

client.on('clientReady', async () => {
    console.log(`✅ Logged in as ${client.user.tag} (Ultra-Light Engine)!`);

    // Clean old cache at startup and sweep every 15 minutes (max 50MB quota)
    cacheManager.cleanOldCache(2);
    setInterval(() => {
        cacheManager.cleanOldCache(2);
        if (global.gc) global.gc();
    }, 15 * 60 * 1000).unref();

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
    // 1. Handle interactive music player buttons
    if (interaction.isButton()) {
        const customId = interaction.customId;
        if (!customId.startsWith('music_') && !customId.startsWith('vol_')) return;

        const player = kazagumo.players.get(interaction.guildId);
        if (!player || !player.playing || !player.queue.current) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงที่กำลังเล่นอยู่ตอนนี้ค่ะ',
                flags: MessageFlags.Ephemeral
            });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel || voiceChannel.id !== player.voiceId) {
            return interaction.reply({
                content: '❌ ตัวเธอต้องเข้าห้องเสียงเดียวกับบอทก่อนนะคะ ถึงจะกดควบคุมได้! 🥺',
                flags: MessageFlags.Ephemeral
            });
        }

        switch (customId) {
            case 'music_shuffle': {
                player.queue.shuffle();
                return interaction.reply({
                    content: '🔀 สลับลำดับคิวเพลงเรียบร้อยแล้วค่ะ!',
                    flags: MessageFlags.Ephemeral
                });
            }
            case 'music_previous': {
                if (!player.queue.previous) {
                    return interaction.reply({
                        content: '❌ ไม่มีเพลงก่อนหน้านี้ในประวัติเลยค่ะ',
                        flags: MessageFlags.Ephemeral
                    });
                }
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                await player.playPrevious();
                return interaction.followUp({
                    content: `⏪ ย้อนกลับไปเล่นเพลง **${player.queue.current?.title}** ให้แล้วค่ะ!`
                });
            }
            case 'music_pause_resume': {
                const isPaused = player.pause(!player.paused);
                try {
                    const cardData = createNowPlayingCard(player, player.queue.current);
                    await interaction.message.edit(cardData).catch(() => {});
                } catch {}
                return interaction.reply({
                    content: isPaused ? '⏸️ พักการเล่นเพลงชั่วคราวแล้วค่ะ' : '▶️ เล่นเพลงต่อเรียบร้อยค่ะ!',
                    flags: MessageFlags.Ephemeral
                });
            }
            case 'music_skip': {
                await interaction.reply({
                    content: '⏭️ ข้ามเพลงไปเพลงถัดไปให้แล้วค่ะ!',
                    flags: MessageFlags.Ephemeral
                });
                player.skip();
                return;
            }
            case 'music_loop': {
                const newLoop = player.cycleLoop();
                let loopText = 'ปิดการวนลูป (Loop: Off)';
                if (newLoop === 'track') loopText = 'วนเพลงปัจจุบัน (Loop: Track)';
                else if (newLoop === 'queue') loopText = 'วนทั้งคิว (Loop: Queue)';
                try {
                    const cardData = createNowPlayingCard(player, player.queue.current);
                    await interaction.message.edit(cardData).catch(() => {});
                } catch {}
                return interaction.reply({
                    content: `🔁 เปลี่ยนโหมดเป็น: **${loopText}** เรียบร้อยค่ะ`,
                    flags: MessageFlags.Ephemeral
                });
            }
            case 'music_queue': {
                const queue = player.queue;
                const embed = new EmbedBuilder().setColor('#FF69B4');
                const currentTitle = queue.current?.title || 'Unknown';
                let desc = `**🎧 กำลังเล่น:** [${currentTitle}](${queue.current?.uri})\n\n`;
                if (queue.length === 0) {
                    desc += 'ไม่มีเพลงรอในคิวแล้วค่ะ สั่งเพลงเพิ่มได้เลยน้า~';
                } else {
                    desc += `**คิวรอเล่น (${queue.length} เพลง):**\n`;
                    const preview = queue.slice(0, 10);
                    preview.forEach((t, i) => {
                        desc += `**${i + 1}.** [${t.title}](${t.uri}) - <@${t.requester.id}>\n`;
                    });
                    if (queue.length > 10) {
                        desc += `*...และอีก ${queue.length - 10} เพลง*`;
                    }
                }
                embed.setTitle('📋 คิวเพลงปัจจุบัน').setDescription(desc);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            case 'music_lyrics': {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const track = player.queue.current;
                const lyricsFinder = require('lyrics-finder');
                const cleanTitle = (track.title || '').replace(/ *\([^)]*\) */g, '').replace(/ *\[[^\]]*]/g, '');
                const author = track.author && track.author !== 'Unknown' ? track.author : '';
                let lyrics = await lyricsFinder(author, cleanTitle) || await lyricsFinder(cleanTitle, '');
                if (!lyrics) {
                    return interaction.followUp({
                        content: `❌ หาเนื้อเพลงสำหรับ **${cleanTitle}** ไม่เจอเลยค่ะ 🥺`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                if (lyrics.length > 4000) lyrics = lyrics.slice(0, 3995) + '...';
                const embed = new EmbedBuilder()
                    .setColor('#FF69B4')
                    .setTitle(`🎤 เนื้อเพลง: ${cleanTitle}`)
                    .setDescription(lyrics);
                return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            case 'music_favorite': {
                const track = player.queue.current;
                const added = favoriteManager.addFavorite(interaction.user.id, track);
                if (added) {
                    return interaction.reply({
                        content: `💖 บันทึกเพลง **${track.title}** ลงในรายการเพลงโปรดของคุณแล้วค่ะ! เรียกฟังได้ด้วย \`/gfav play\``,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return interaction.reply({
                        content: `ℹ️ เพลง **${track.title}** อยู่ในรายการเพลงโปรดของคุณอยู่แล้วค่ะ!`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            case 'music_volume': {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vol_30').setLabel('30%').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_60').setLabel('60%').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_100').setLabel('100%').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('vol_130').setLabel('130%').setStyle(ButtonStyle.Danger)
                );
                return interaction.reply({
                    content: `🔊 เลือกระดับเสียงด่วนที่ต้องการปรับ (ปัจจุบัน: **${player.volume}%**):`,
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
            }
            case 'vol_30':
            case 'vol_60':
            case 'vol_100':
            case 'vol_130': {
                const volNum = parseInt(customId.replace('vol_', ''), 10);
                player.setVolume(volNum);
                return interaction.update({
                    content: `🔊 ปรับระดับเสียงเป็น **${volNum}%** เรียบร้อยค่ะ!`,
                    components: []
                });
            }
        }
    }

    // 2. Handle Slash Commands
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor('#FF69B4').setDescription('❌ อ๊ะๆ! ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้นนะคะที่รัก 💕')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (!interaction.guild) {
        console.error(`[GuildCache] Bot is not in guild ${interaction.guildId} — interaction received from guild the bot has left or cannot access.`);
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor('#FF69B4').setDescription('❌ บอทไม่อยู่ในเซิร์ฟเวอร์นี้แล้วค่ะ กรุณาเชิญบอทใหม่ด้วยนะคะ 🥺')],
            flags: MessageFlags.Ephemeral
        });
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    console.log(`[Interaction] /${interaction.commandName} | User: ${interaction.user.tag} (${interaction.user.id}) | Guild: "${interaction.guild?.name || interaction.guildId}"`);

    try {
        await command.run(client, interaction, kazagumo);
    } catch (error) {
        console.error(error);
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setDescription('❌ ว้าย! มีข้อผิดพลาดนิดหน่อยตอนรันคำสั่งนี้ค่ะ ขออภัยด้วยนะคะ 🥺');
            
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
});

// Auto-disconnect when no non-bot members remain in the bot's voice channel
client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.id === client.user.id || newState.id === client.user.id) return;

    const guild = oldState.guild || newState.guild;
    if (!guild) return;

    const player = kazagumo.getPlayer(guild.id);
    if (!player || !player.voiceId) return;

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
    const ytDlpPath = path.join(__dirname, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(ytDlpPath)) {
        console.log('✅ [yt-dlp] Binary found.');
    } else {
        console.log('❌ [yt-dlp] Binary is missing at bin/yt-dlp!');
        allGood = false;
    }

    // 3. Initialize & Check Proxy with Auto-Recovery Health Monitor & Smart Pool
    const proxyManager = require('./src/helpers/proxyManager');
    await proxyManager.init();
    const pStatus = proxyManager.getStatus();
    if (pStatus.configured) {
        console.log(`✅ [Proxy] Smart Pool Active (${pStatus.activeCount} online | Best: ${pStatus.url} [${pStatus.bestLatency}])`);
    } else {
        console.log('ℹ️ [Proxy] Smart Pool standby / Direct mode. (Auto-refill running in background)');
    }

    // 4. Check YouTube Auth & Anti-Bot Status (Fast 8s diagnostic)
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        console.log('✅ [Cookies] cookies.txt found.');
    } else {
        console.log('ℹ️ [Cookies] cookies.txt not found. (SoundCloud & oEmbed fallback will be used if YouTube restricts IP)');
    }

    // 5. Check FFmpeg binary
    if (fs.existsSync(cacheManager.ffmpegPath)) {
        console.log(`✅ [FFmpeg] FFmpeg binary is ready: ${cacheManager.ffmpegPath}`);
    } else {
        console.log(`ℹ️ [FFmpeg] System/bundle FFmpeg path: ${cacheManager.ffmpegPath} (will be prepared automatically if needed)`);
    }

    // 6. Check Commands
    if (commandsData && commandsData.length > 0) {
        console.log(`✅ [Commands] Loaded ${commandsData.length} commands successfully.`);
    } else {
        console.log('❌ [Commands] No commands found or loaded!');
        allGood = false;
    }

    // 7. Initialize YouTube Circuit Breaker (Probe in background)
    const youtubeCircuit = require('./src/helpers/youtubeCircuit');
    youtubeCircuit.startProbe(ytDlpPath, () => proxyManager.getYouTubeProxy());

    console.log('--------------------------------------\n');
    return allGood;
}

(async () => {
    const isReady = await runStartupCheck();
    if (!isReady) {
        console.error("❌ บอทไม่สามารถเริ่มทำงานได้เนื่องจากระบบหลักหรือไฟล์สำคัญขาดหาย กรุณาเช็ค Log ด้านบนครับ");
        process.exit(1);
    }
    client.login(process.env.DISCORD_TOKEN);
})();
