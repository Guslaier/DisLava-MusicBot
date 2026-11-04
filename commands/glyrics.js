const { EmbedBuilder } = require('discord.js');
const lyricsHelper = require('../src/helpers/lyricsHelper');

module.exports = {
    data: {
        name: 'glyrics',
        description: 'ค้นหาเนื้อเพลงที่กำลังเล่นอยู่',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing || !player.queue.current) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ! ร้องเพลงอะไรกันเอ่ย? 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const track = player.queue.current;
        await interaction.deferReply();

        try {
            const data = await lyricsHelper.getLyrics(track);

            if (!data || !data.lyrics) {
                embed.setDescription(`❌ ว้าย! ขออภัยค่ะ หาเนื้อเพลงสำหรับ **${track.title}** ไม่เจอเลย 😿`);
                return interaction.followUp({ embeds: [embed] });
            }

            let lyrics = data.lyrics;
            if (lyrics.length > 4000) {
                lyrics = lyrics.substring(0, 3995) + '...';
            }

            embed.setTitle(`🎤 เนื้อเพลง: ${data.title || track.title}`)
                 .setDescription(lyrics)
                 .setFooter({ text: `แหล่งที่มา: ${data.source} • ร้องตามดีเจดังๆ เลยนะคะ! 💋` });

            return interaction.followUp({ embeds: [embed] });

        } catch (error) {
            console.error('[LyricsCommand] Error:', error.message);
            embed.setDescription('❌ แง้! เกิดข้อผิดพลาดตอนไปคุ้ยหาเนื้อเพลงมาให้ค่ะ ขออภัยด้วยน้า 🥺');
            return interaction.followUp({ embeds: [embed] });
        }
    }
};
