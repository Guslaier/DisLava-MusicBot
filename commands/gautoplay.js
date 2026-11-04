const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const settingsManager = require('../src/helpers/settingsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gautoplay')
        .setDescription('เปิดหรือปิดการเล่นเพลงต่อเนื่องอัตโนมัติเมื่อคิวหมด (Autoplay)'),

    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        let newStatus;
        if (player) {
            player.autoplay = !player.autoplay;
            newStatus = player.autoplay;
            settingsManager.setGuildAutoplay(player.guildId, newStatus);
            if (player.nowPlayingMessage && player.queue?.current) {
                try {
                    const { createNowPlayingCard } = require('../src/helpers/musicCardHelper');
                    const cardData = createNowPlayingCard(player, player.queue.current);
                    await player.nowPlayingMessage.edit(cardData).catch(() => {});
                } catch {}
            }
        } else {
            const current = settingsManager.getGuildAutoplay(interaction.guild.id);
            newStatus = settingsManager.setGuildAutoplay(interaction.guild.id, !current);
        }

        const statusText = newStatus ? 'เปิดใช้งาน (Enabled) 🟢' : 'ปิดใช้งาน (Disabled) 🔴';
        embed.setDescription(`🎲 **ระบบเล่นเพลงต่อเนื่อง (Autoplay):** ${statusText}\n\n${newStatus ? 'เมื่อเพลงในคิวหมด ดีเจจะเลือกเพลงที่คล้ายกันมาเล่นต่อให้อัตโนมัติค่ะ ปาร์ตี้ไม่มีสะดุดแน่นอน! (ระบบจำค่านี้ไว้ถาวร) 💃✨' : 'เมื่อเพลงในคิวหมด บอทจะหยุดเล่นเพลงตามปกติค่ะ'}`);
        return interaction.reply({ embeds: [embed] });
    }
};
