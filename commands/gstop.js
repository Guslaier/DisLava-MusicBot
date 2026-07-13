const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gstop',
        description: 'หยุดเล่นและล้างคิวเพลง',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ อ๊ะ! ไม่มีเพลงที่กำลังเล่นอยู่เลยค่ะ สเตจว่างเปล่ามากตอนนี้ 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.destroy();
        embed.setDescription('🛑 ปิดสเตจแล้วนะคะ! ดีเจล้างคิวและหยุดเพลงทั้งหมดให้แล้ว ไว้เจอกันใหม่น้า ปิ๊งๆ 👋💕');
        return interaction.reply({ embeds: [embed] });
    }
};
