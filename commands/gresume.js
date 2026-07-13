const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gresume',
        description: 'เล่นเพลงต่อจากที่หยุดไว้',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! จะให้ดีเจเล่นอะไรเอ่ย? 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (!player.paused) {
            embed.setDescription('⚠️ เพลงก็กำลังเล่นอยู่แล้วนี่นา เต้นต่อเลยค่ะไม่ต้องรอ! 💃🔥');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.pause(false);
        embed.setDescription('▶️ ลุยกันต่อเลยค่ะ! ดีเจสาวกลับมาเปิดเพลงให้แล้วน้า โยกไปเลยยย 🎧💕');
        return interaction.reply({ embeds: [embed] });
    }
};
