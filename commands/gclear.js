const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gclear',
        description: 'ล้างคิวเพลงที่รออยู่ทั้งหมด',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ อ๊ะ! ตอนนี้ไม่มีคิวเพลงให้ล้างเลยค่ะ สั่งดีเจเปิดเพลงได้เลยน้า~ 🎶');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.queue.clear();
        embed.setDescription('🧹 ปัดกวาดเช็ดถู! ล้างคิวเพลงที่รออยู่ทั้งหมดให้เรียบร้อยแล้วค่ะ ✨');
        return interaction.reply({ embeds: [embed] });
    }
};
