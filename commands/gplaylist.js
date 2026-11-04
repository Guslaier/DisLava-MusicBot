const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gplaylist',
        description: 'เล่นเพลย์ลิสต์จาก YouTube หรือ SoundCloud (เพิ่มทุกเพลงลงในคิว)',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'ชื่อเพลย์ลิสต์ หรือ ลิ้งก์ Playlist (YouTube, Mix, SoundCloud)',
                required: true,
            },
            {
                name: 'limit',
                type: 4, // INTEGER
                description: 'จำนวนเพลงสูงสุดที่จะดึงเข้าคิว (ค่าเริ่มต้น: 25, สูงสุด: 100)',
                required: false,
                min_value: 5,
                max_value: 100,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const voiceChannel = interaction.member?.voice?.channel;
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!voiceChannel) {
            embed.setDescription('❌ อ๊ะๆ! ตัวเธอต้องเข้าห้องเสียงก่อนนะคะ เดี๋ยวดีเจเหงาแย่เลย~ 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const query = interaction.options.getString('query');
        const limit = interaction.options.getInteger('limit') || 25;
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

        const result = await kazagumo.search(query, {
            requester: interaction.user,
            forcePlaylist: true,
            limit
        });

        if (!result.tracks.length) {
            embed.setDescription('❌ หาเพลย์ลิสต์ไม่เจอค่ะ! (กรุณาตรวจสอบว่าลิ้งก์ไม่ได้ตั้งเป็น Private หรือพิมพ์ชื่อเพลย์ลิสต์ให้ชัดเจนขึ้นนะคะ) 😿');
            return interaction.followUp({ embeds: [embed] });
        }

        for (const track of result.tracks) {
            player.queue.add(track);
        }

        const playlistTitle = result.playlistName || 'Playlist';
        embed.setDescription(`✅ จัดไปชุดใหญ่ไฟกระพริบ! เพิ่มเพลย์ลิสต์ **${playlistTitle}** (${result.tracks.length} เพลง) ลงในคิวแล้วค่ะ 💃✨`);
        await interaction.followUp({ embeds: [embed] });

        if (!player.playing && !player._starting && !player.paused) {
            try {
                await player.play();
            } catch (error) {
                console.error('[gplaylist] Play error:', error.message);
                return interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการเริ่มเล่นเพลงค่ะ', flags: 64 });
            }
        }
    }
};

