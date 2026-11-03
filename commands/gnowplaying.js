const { EmbedBuilder } = require('discord.js');
const { createNowPlayingCard } = require('../src/helpers/musicCardHelper');

module.exports = {
    data: {
        name: 'gnowplaying',
        description: 'ดูการ์ดเพลงและปุ่มควบคุมเพลงที่กำลังเล่นอยู่',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ อ๊ะ! ตอนนี้ไม่ได้เปิดเพลงอะไรอยู่เลยค่ะ สเตจเงียบกริบ 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const track = player.queue.current;
        if (!track) {
            embed.setDescription('❌ ไม่พบข้อมูลเพลงค่ะ! ผีหลอกดีเจรึเปล่าเนี่ย 😱');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const cardData = createNowPlayingCard(player, track);
        return interaction.reply(cardData);
    }
};
