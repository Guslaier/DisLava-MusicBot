require('dotenv').config();
process.env.FFMPEG_PATH = require('ffmpeg-static');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Player } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const youtubedl = require('youtube-dl-exec');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Setup Player
const player = new Player(client);

// Load only YouTube extractor
player.extractors.register(YoutubeiExtractor, {});

// Setup event listeners for the player
player.events.on('playerStart', (queue, track) => {
    // we will send a message to the channel where the command was used
    if (queue.metadata?.channel) {
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('Now Playing')
            .setDescription(`**${track.title}**\n\`[ 0:00 / ${track.duration} ]\`\n\nRequested by: <@${queue.metadata.user.id}>`);
        queue.metadata.channel.send({ embeds: [embed] }).catch(err => {
            console.error(`❌ ไม่สามารถส่งข้อความ Now Playing ได้: ${err.message}`);
        });
    }
});

player.events.on('error', (queue, error) => {
    console.error(`Player Error: ${error.message}`);
});
player.events.on('playerError', (queue, error) => {
    console.error(`Connection Error: ${error.message}`);
});
player.events.on('debug', (queue, message) => {
    console.log(`[PLAYER DEBUG] ${message}`);
});

client.on('error', console.error);

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    const commands = [
        {
            name: 'gplay',
            description: 'เล่นเพลงจาก YouTube หรือชื่อเพลง',
            options: [
                {
                    name: 'query',
                    type: 3, // STRING
                    description: 'ชื่อเพลง หรือ ลิ้งก์ YouTube',
                    required: true,
                },
            ],
        },
        {
            name: 'gqueue',
            description: 'ดูคิวเพลงปัจจุบัน',
        },
        {
            name: 'gskip',
            description: 'ข้ามเพลงที่กำลังเล่นอยู่',
        },
        {
            name: 'gstop',
            description: 'หยุดเล่นเพลงและล้างคิว',
        },
        {
            name: 'gclear',
            description: 'ล้างคิวเพลงที่รออยู่ทั้งหมด',
        },
    ];

    try {
        console.log('🔄 Started refreshing application (/) commands.');
        await client.application.commands.set(commands);
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.guild) {
        const embed = new EmbedBuilder().setColor('#ff0000');
        if (interaction.guildId) {
            embed.setDescription('❌ บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้ครับ! (คุณอาจจะเรียกใช้ผ่าน User App) กรุณาเชิญตัวบอทเข้ามาในเซิร์ฟเวอร์ก่อนถึงจะใช้งานได้ครับ');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        embed.setDescription('❌ คุณสามารถใช้คำสั่งบอทเพลงได้ในเซิร์ฟเวอร์เท่านั้นครับ ไม่สามารถใช้ในแชทส่วนตัว (DM) ได้');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const { commandName } = interaction;

    if (commandName === 'gplay') {
        const query = interaction.options.getString('query');

        // ดึงข้อมูล member เพื่ออัปเดตสถานะ
        let member = interaction.member;
        if (!member?.voice) {
            member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        }

        const voiceChannel = member?.voice?.channel || interaction.guild.voiceStates.cache.get(interaction.user.id)?.channel;

        // ตรวจสอบว่าผู้ใช้อยู่ในห้องเสียงหรือไม่
        if (!voiceChannel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ **บอทหาคุณไม่เจอในห้องเสียงครับ!**\n\n**วิธีแก้:**\n1. ลองกด **ออกห้องเสียงแล้วเข้าใหม่** 1 ครั้ง\n2. ตรวจสอบว่าบอทมีสิทธิ์ **View Channel (มองเห็นช่อง)** ในห้องเสียงที่คุณอยู่หรือไม่');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const result = await player.play(voiceChannel, query, {
                nodeOptions: {
                    // แนบข้อมูล interaction ไปกับ metadata เพื่อให้ playerStart สามารถส่งข้อความกลับไปได้
                    metadata: interaction,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 300000, // 5 นาที
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 300000,
                    onBeforeCreateStream: async (track, source, _fallback) => {
                        if (track.url && track.url.includes('youtube.com')) {
                            try {
                                return youtubedl.exec(track.url, {
                                    output: '-',
                                    quiet: true,
                                    format: 'bestaudio[ext=m4a]/bestaudio/best',
                                }, { stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
                            } catch (err) {
                                console.error('yt-dlp onBeforeCreateStream error:', err);
                                return null;
                            }
                        }
                        return null;
                    }
                }
            });

            const track = result.track;
            const queue = result.queue;
            let position = queue.tracks.toArray().findIndex(t => t.id === track.id) + 1;
            if (position === 0) position = 1;

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('Queued')
                .setDescription(`**${track.title}**\n\nIn position #${position}`);

            return interaction.followUp({ embeds: [embed] });
        } catch (e) {
            console.error(e);
            const errEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`❌ เกิดข้อผิดพลาดในการเล่นเพลง: ${e.message}`);
            return interaction.followUp({ embeds: [errEmbed] });
        }
    }

    const noMusicEmbed = new EmbedBuilder().setColor('#ff0000').setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่เลยครับ!');

    if (commandName === 'gqueue') {
        const queue = player.nodes.get(interaction.guild);
        if (!queue || !queue.isPlaying()) return interaction.reply({ embeds: [noMusicEmbed], ephemeral: true });

        const currentTrack = queue.currentTrack;
        const tracks = queue.tracks.toArray();

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🎶 คิวเพลงปัจจุบัน')
            .addFields({ name: '▶️ กำลังเล่น', value: `**${currentTrack.title}**` });

        let queueString = '';
        if (tracks.length === 0) {
            queueString = '(ไม่มีเพลงในคิว)';
        } else {
            queueString = tracks.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title}`).join('\n');
        }
        embed.addFields({ name: 'คิวถัดไป', value: queueString });
        
        if (tracks.length > 10) embed.setFooter({ text: `...และอีก ${tracks.length - 10} เพลง` });

        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'gskip') {
        const queue = player.nodes.get(interaction.guild);
        if (!queue || !queue.isPlaying()) return interaction.reply({ embeds: [noMusicEmbed], ephemeral: true });

        const currentTrack = queue.currentTrack;
        queue.node.skip();
        
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setDescription(`⏭️ ข้ามเพลง **${currentTrack.title}** แล้ว!`);
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'gstop') {
        const queue = player.nodes.get(interaction.guild);
        if (!queue || !queue.isPlaying()) return interaction.reply({ embeds: [noMusicEmbed], ephemeral: true });

        queue.delete();
        
        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setDescription('🛑 หยุดเล่นเพลงและล้างคิวทั้งหมดแล้ว!');
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'gclear') {
        const queue = player.nodes.get(interaction.guild);
        if (!queue || !queue.isPlaying()) return interaction.reply({ embeds: [noMusicEmbed], ephemeral: true });

        queue.tracks.clear();
        
        const embed = new EmbedBuilder()
            .setColor('#f1c40f') // สีเหลืองทอง
            .setDescription('🧹 ล้างคิวเพลงที่รออยู่ทั้งหมดแล้ว! (เพลงปัจจุบันจะยังคงเล่นต่อไป)');
        return interaction.reply({ embeds: [embed] });
    }
});

// เริ่มการทำงานของบอท
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ไม่พบ DISCORD_TOKEN ในไฟล์ .env");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
