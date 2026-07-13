const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gpause',
        description: 'หยุดเล่นเพลงชั่วคราว',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ จะให้ดีเจหยุดอะไรเอ่ย? 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (player.paused) {
            embed.setDescription('⚠️ แหมมม เพลงก็หยุดอยู่แล้วนะคะที่รัก จะหยุดซ้ำทำไมเนี่ย! 😂');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.pause(true);
        embed.setDescription('⏸️ ขอพักจิบน้ำแป๊บนะคะ! เพลงหยุดชั่วคราวแล้วค่ะ 💋');
        return interaction.reply({ embeds: [embed] });
    }
};
