const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gskip',
        description: 'ข้ามเพลงที่กำลังเล่นอยู่',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ อ๊ะ! ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ จะให้ดีเจข้ามความว่างเปล่าเหรอคะ? 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.skip();
        embed.setDescription('⏭️ จัดไปค่ะ! ข้ามเพลงนี้ให้แล้ว ไปลุยเพลงต่อไปกันเลยยย 💅✨');
        return interaction.reply({ embeds: [embed] });
    }
};
