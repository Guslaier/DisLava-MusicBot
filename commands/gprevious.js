const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gprevious',
        description: 'ย้อนกลับไปเล่นเพลงที่เพิ่งจบไป',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! ดีเจยังไม่ได้เปิดเพลงอะไรเลยน้า~ 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const previousTrack = player.getPrevious(true);
        if (!previousTrack) {
            embed.setDescription('❌ อ๊ะ! ไม่มีเพลงก่อนหน้านี้ในประวัติเลยค่ะ เพิ่งเริ่มปาร์ตี้เองน้า~ 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (player.queue.current) {
            player.queue.unshift(player.queue.current);
        }

        player.play(previousTrack);
        embed.setDescription(`⏪ จัดให้ตามคำเรียกร้อง! ย้อนกลับไปเล่นเพลง **${previousTrack.title}** อีกรอบค่ะ 💖`);
        return interaction.reply({ embeds: [embed] });
    }
};
