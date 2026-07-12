require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo, KazagumoPlayer } = require('kazagumo');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ตั้งค่าเชื่อมต่อ Lavalink Server ที่รันอยู่บนเครื่อง
const Nodes = [{
    name: 'LocalNode',
    url: 'localhost:2333',
    auth: 'youshallnotpass',
    secure: false
}];

const kazagumo = new Kazagumo({
    defaultSearchEngine: "youtube",
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
        .setTitle('Now Playing (Powered by Lavalink 🚀)')
        .setDescription(`**${track.title}**\n\nRequested by: <@${track.requester.id}>`);
    
    channel.send({ embeds: [embed] }).catch(() => {});
});

// Event เมื่อคิวหมด
kazagumo.on("playerEmpty", player => {
    if (!player.textId) return;
    const channel = client.channels.cache.get(player.textId);
    if (channel) channel.send('🎵 คิวเพลงว่างเปล่าแล้วครับ!').catch(() => {});
    player.destroy();
});

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag} (Lavalink Version)!`);

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
                {
                    name: 'top',
                    type: 5, // BOOLEAN
                    description: 'เล่นเพลงนี้เป็นคิวต่อไป (แซงคิว)',
                    required: false,
                },
            ],
        },
        {
            name: 'gjump',
            description: 'ดันเพลงในคิวขึ้นมาเล่นเป็นเพลงต่อไป (แซงคิว)',
            options: [
                {
                    name: 'position',
                    type: 4, // INTEGER
                    description: 'ลำดับของเพลงในคิวที่ต้องการแซงคิว',
                    required: true,
                },
            ],
        },
        {
            name: 'gskipplay',
            description: 'เล่นเพลงนี้ทันที (แทรกคิวและข้ามเพลงปัจจุบัน)',
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
            options: [
                {
                    name: 'page',
                    type: 4, // INTEGER
                    description: 'หน้าคิวเพลงที่ต้องการดู',
                    required: false,
                },
            ],
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
        await client.application.commands.set(commands);
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) return interaction.reply({ content: '❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์ครับ', ephemeral: true });

    const { commandName } = interaction;
    const voiceChannel = interaction.member?.voice?.channel;

    if (commandName === 'gplay') {
        if (!voiceChannel) return interaction.reply({ content: '❌ กรุณาเข้าห้องเสียงก่อนครับ!', ephemeral: true });

        const query = interaction.options.getString('query');
        const top = interaction.options.getBoolean('top');
        await interaction.deferReply();

        let player = kazagumo.players.get(interaction.guild.id);
        if (!player) {
            player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                textId: interaction.channel.id,
                voiceId: voiceChannel.id,
                volume: 100
            });
        }

        let result = await kazagumo.search(query, { 
            requester: interaction.user,
            engine: query.startsWith('http') ? undefined : 'youtube_music' 
        });
        
        if (!result.tracks.length && !query.startsWith('http')) {
            result = await kazagumo.search(query, { 
                requester: interaction.user,
                engine: 'soundcloud'
            });
        }

        if (!result.tracks.length) {
            return interaction.followUp('❌ หาเพลงไม่เจอครับ! (อาจโดนบล็อคลิขสิทธิ์ ลองพิมพ์ชื่อเพลงภาษาอังกฤษ หรือแปะลิ้งก์แทนนะครับ)');
        }

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) {
                player.queue.add(track);
            }
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setDescription(`✅ เพิ่มเพลย์ลิสต์ **${result.playlistName}** (${result.tracks.length} เพลง) ลงในคิวแล้ว`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            
            if (top && player.queue.length > 0) {
                player.queue.unshift(track);
            } else {
                player.queue.add(track);
            }

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setDescription(`**${track.title}**\n\n${player.playing ? (top ? `⬆️ แทรกเป็นคิวต่อไปแล้ว` : `✅ เพิ่มลงในคิวแล้ว`) : `▶️ เริ่มเล่นเพลงแล้ว`}`);
            
            await interaction.followUp({ embeds: [embed] });
        }

        if (!player.playing && !player.paused) {
            player.play();
        }
        return;
    }

    if (commandName === 'gjump') {
        const position = interaction.options.getInteger('position');
        const player = kazagumo.players.get(interaction.guild.id);

        if (!player || !player.playing) return interaction.reply({ content: '❌ ไม่มีเพลงที่กำลังเล่นอยู่ครับ!', ephemeral: true });
        if (player.queue.length === 0) return interaction.reply({ content: '❌ คิวเพลงว่างเปล่าครับ!', ephemeral: true });
        if (position < 1 || position > player.queue.length) {
            return interaction.reply({ content: `❌ กรุณาระบุลำดับคิวให้ถูกต้อง (1 ถึง ${player.queue.length})`, ephemeral: true });
        }

        // ดึงเพลงออกจากคิวตามตำแหน่ง (index คือ position - 1) และยัดกลับเข้าไปข้างบนสุด
        const trackToJump = player.queue.splice(position - 1, 1)[0];
        player.queue.unshift(trackToJump);

        return interaction.reply({ content: `⬆️ ดันเพลง **${trackToJump.title}** ขึ้นมาเป็นคิวต่อไปเรียบร้อยแล้ว!` });
    }

    if (commandName === 'gskipplay') {
        if (!voiceChannel) return interaction.reply({ content: '❌ กรุณาเข้าห้องเสียงก่อนครับ!', ephemeral: true });

        const query = interaction.options.getString('query');
        await interaction.deferReply();

        let player = kazagumo.players.get(interaction.guild.id);
        if (!player) {
            player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                textId: interaction.channel.id,
                voiceId: voiceChannel.id,
                volume: 100
            });
        }

        let result = await kazagumo.search(query, { 
            requester: interaction.user,
            engine: query.startsWith('http') ? undefined : 'youtube_music' 
        });
        
        if (!result.tracks.length && !query.startsWith('http')) {
            result = await kazagumo.search(query, { 
                requester: interaction.user,
                engine: 'soundcloud'
            });
        }

        if (!result.tracks.length) {
            return interaction.followUp('❌ หาเพลงไม่เจอครับ! (อาจโดนบล็อคลิขสิทธิ์ ลองพิมพ์ชื่อเพลงภาษาอังกฤษ หรือแปะลิ้งก์แทนนะครับ)');
        }

        if (result.type === 'PLAYLIST') {
            for (const track of [...result.tracks].reverse()) {
                player.queue.unshift(track);
            }
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setDescription(`✅ แทรกเพลย์ลิสต์ **${result.playlistName}** (${result.tracks.length} เพลง) เป็นคิวถัดไปและข้ามเพลงปัจจุบันทันที!`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            player.queue.unshift(track);
            
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setDescription(`**${track.title}**\n\n⏭️ ข้ามเพลงปัจจุบันและแทรกเล่นเพลงนี้ทันที!`);
            
            await interaction.followUp({ embeds: [embed] });
        }

        // ถ้าเล่นอยู่ ให้ข้ามไปเล่นเพลงใหม่เลย ถ้าหยุดอยู่ก็เริ่มเล่น
        if (player.playing) {
            player.skip();
        } else {
            player.play();
        }
        return;
    }

    if (commandName === 'gqueue') {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player || !player.playing) return interaction.reply({ content: '❌ ไม่มีเพลงที่กำลังเล่นอยู่ครับ!', ephemeral: true });

        const currentTrack = player.queue.current;
        const tracks = player.queue;

        const limit = 10;
        const totalPages = Math.ceil(tracks.length / limit) || 1;
        let page = interaction.options.getInteger('page') || 1;
        
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const generateEmbed = (pageIdx) => {
            const start = (pageIdx - 1) * limit;
            const end = start + limit;
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🎶 คิวเพลงปัจจุบัน')
                .addFields({ name: '▶️ กำลังเล่น', value: `**${currentTrack.title}**` });

            if (tracks.length > 0) {
                const queueString = tracks.slice(start, end).map((t, i) => `**${start + i + 1}.** ${t.title}`).join('\n');
                embed.addFields({ name: `คิวถัดไป (หน้า ${pageIdx}/${totalPages} - ทั้งหมด ${tracks.length} เพลง)`, value: queueString });
            } else {
                embed.addFields({ name: 'คิวถัดไป', value: '(ไม่มีเพลงในคิว)' });
            }
            return embed;
        };

        const generateRow = (pageIdx) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gqueue_prev')
                    .setLabel('◀ ก่อนหน้า')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIdx <= 1),
                new ButtonBuilder()
                    .setCustomId('gqueue_next')
                    .setLabel('ถัดไป ▶')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIdx >= totalPages)
            );
        };

        const embed = generateEmbed(page);
        
        if (totalPages <= 1) {
            return interaction.reply({ embeds: [embed] });
        }

        const row = generateRow(page);
        const replyMessage = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        const collector = replyMessage.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 60000 // ปุ่มกดได้นาน 1 นาที
        });

        collector.on('collect', async i => {
            if (i.customId === 'gqueue_prev') page--;
            if (i.customId === 'gqueue_next') page++;
            
            await i.update({
                embeds: [generateEmbed(page)],
                components: [generateRow(page)]
            });
        });

        collector.on('end', () => {
            replyMessage.edit({ components: [] }).catch(() => {});
        });
        return;
    }

    if (commandName === 'gskip') {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player || !player.playing) return interaction.reply({ content: '❌ ไม่มีเพลงที่กำลังเล่นอยู่ครับ!', ephemeral: true });

        player.skip();
        return interaction.reply({ content: '⏭️ ข้ามเพลงแล้ว!' });
    }

    if (commandName === 'gstop') {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply({ content: '❌ ไม่มีเพลงที่กำลังเล่นอยู่ครับ!', ephemeral: true });

        player.destroy();
        return interaction.reply({ content: '🛑 หยุดเล่นเพลงและล้างคิวทั้งหมดแล้ว!' });
    }

    if (commandName === 'gclear') {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply({ content: '❌ ไม่มีคิวเพลงครับ!', ephemeral: true });

        player.queue.clear();
        return interaction.reply({ content: '🧹 ล้างคิวเพลงที่รออยู่ทั้งหมดแล้ว!' });
    }
});

// เริ่มการทำงานของบอท
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ไม่พบ DISCORD_TOKEN ในไฟล์ .env");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
