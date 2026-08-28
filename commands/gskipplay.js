const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gskipplay',
        description: 'ข้ามเพลงปัจจุบันแล้วเล่นเพลงใหม่ที่ระบุทันที',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'ชื่อเพลง หรือ ลิ้งก์ YouTube ที่ต้องการเล่น',
                required: true,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const voiceChannel = interaction.member?.voice?.channel;
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!voiceChannel) {
            embed.setDescription('❌ อ๊ะๆ! ตัวเธอต้องเข้าห้องเสียงก่อนนะคะ เดี๋ยวดีเจเหงาแย่เลย~ 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let query = interaction.options.getString('query');
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
            engine: query.startsWith('http') ? undefined : 'youtube'
        });

        // หากหาใน youtube ปกติไม่เจอ ให้ลองหาใน youtube_music
        if (!result.tracks.length && !query.startsWith('http')) {
            result = await kazagumo.search(query, {
                requester: interaction.user,
                engine: 'youtube_music'
            });
        }

        // หากยังหาไม่เจอ ให้ลองลบวงเล็บหรือคำต่อท้ายออกแล้วหาใหม่
        if (!result.tracks.length && !query.startsWith('http')) {
            const cleanQuery = query.replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '').replace(/\s+/g, ' ').trim();
            if (cleanQuery && cleanQuery !== query) {
                result = await kazagumo.search(cleanQuery, {
                    requester: interaction.user,
                    engine: 'youtube'
                });
                if (!result.tracks.length) {
                    result = await kazagumo.search(cleanQuery, {
                        requester: interaction.user,
                        engine: 'youtube_music'
                    });
                }
            }
        }

        if (!result.tracks.length) {
            embed.setDescription('❌ หาเพลงไม่เจอค่ะ! (ลองลบคำว่า Official/MV ออก หรือพิมพ์แค่ชื่อเพลงสั้นๆ ดูนะคะ) 😿');
            return interaction.followUp({ embeds: [embed] });
        }

        if (result.type === 'PLAYLIST') {
            for (let i = result.tracks.length - 1; i >= 0; i--) {
                player.queue.unshift(result.tracks[i]); // ยัดลงคิวบนสุด (Reverse order to maintain playlist order)
            }
            player.skip(); // ข้ามเพลงปัจจุบัน
            embed.setDescription(`⏭️ จัดเพลย์ลิสต์ใหม่ให้ด่วนจี๋! ข้ามไปเล่นเพลย์ลิสต์ **${result.playlistName}** ให้แล้วค่ะ 💃✨`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            
            // ข้ามเพลงปัจจุบันแล้วเล่นเพลงนี้ทันที
            player.queue.unshift(track);
            player.skip();

            embed.setDescription(`⏭️ ด่วนทันใจ! ข้ามเพลงเดิมแล้วเปิดเพลง **${track.title}** ให้แล้วนะคะ โยกกก 🎧💋`);
            await interaction.followUp({ embeds: [embed] });
        }

        if (!player.playing && !player.paused) {
            player.play();
        }
    }
};
