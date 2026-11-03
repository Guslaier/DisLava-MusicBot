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
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

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

        const result = await kazagumo.search(query, {
            requester: interaction.user
        });

        if (!result.tracks.length) {
            embed.setDescription('❌ หาเพลงไม่เจอค่ะ! (ลองลบคำว่า Official/MV ออก หรือพิมพ์แค่ชื่อเพลงสั้นๆ ดูนะคะ) 😿');
            return interaction.followUp({ embeds: [embed] });
        }

        if (result.type === 'PLAYLIST') {
            for (let i = result.tracks.length - 1; i >= 0; i--) {
                player.queue.unshift(result.tracks[i]);
            }
            if (player.playing || player._starting) {
                player.skip();
            } else {
                player.play();
            }
            embed.setDescription(`⏭️ จัดเพลย์ลิสต์ใหม่ให้ด่วนจี๋! ข้ามไปเล่นเพลย์ลิสต์ **${result.playlistName}** ให้แล้วค่ะ 💃✨`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            player.queue.unshift(track);
            
            if (player.playing || player._starting) {
                player.skip();
            } else {
                player.play();
            }

            embed.setDescription(`⏭️ ด่วนทันใจ! ข้ามเพลงเดิมแล้วเปิดเพลง **${track.title}** ให้แล้วนะคะ โยกกก 🎧💋`);
            await interaction.followUp({ embeds: [embed] });
        }
    }
};
