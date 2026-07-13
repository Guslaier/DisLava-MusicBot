const { EmbedBuilder } = require('discord.js');
const lyricsFinder = require('lyrics-finder');

module.exports = {
    data: {
        name: 'glyrics',
        description: 'ค้นหาเนื้อเพลงที่กำลังเล่นอยู่',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ! ร้องเพลงอะไรกันเอ่ย? 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const track = player.queue.current;
        await interaction.deferReply();

        try {
            // ค้นหาเนื้อเพลง โดยใช้ชื่อเพลงและผู้แต่ง (ถ้ามี)
            // เอาคำว่า (Official Video) หรืออะไรพวกนี้ออกเพื่อให้หาเจอง่ายขึ้น
            const cleanTitle = track.title.replace(/ *\([^)]*\) */g, "").replace(/ *\[[^\]]*]/g, "");
            const author = track.author !== 'Unknown' ? track.author : '';

            let lyrics = await lyricsFinder(author, cleanTitle) || await lyricsFinder(cleanTitle, "");

            if (!lyrics) {
                embed.setDescription(`❌ ว้าย! ขออภัยค่ะ หาเนื้อเพลงสำหรับ **${track.title}** ไม่เจอเลย 😿`);
                return interaction.followUp({ embeds: [embed] });
            }

            // ถ้าเนื้อเพลงยาวเกิน 4096 ตัวอักษร (ลิมิตของ Embed) ให้ตัด
            if (lyrics.length > 4096) {
                lyrics = lyrics.substring(0, 4090) + '...';
            }

            embed.setTitle(`🎤 เนื้อเพลง: ${cleanTitle}`)
                 .setDescription(lyrics)
                 .setFooter({ text: 'ร้องตามดีเจดังๆ เลยนะคะ! 💋' });

            return interaction.followUp({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            embed.setDescription('❌ แง้! เกิดข้อผิดพลาดตอนไปคุ้ยหาเนื้อเพลงมาให้ค่ะ ขออภัยด้วยน้า 🥺');
            return interaction.followUp({ embeds: [embed] });
        }
    }
};
