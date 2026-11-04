const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../src/helpers/settingsManager');

module.exports = {
    data: {
        name: 'gvolume',
        description: 'ปรับหรือดูระดับเสียงของบอท (บันทึกค่าไว้ใช้ถาวร)',
        default_member_permissions: '8',
        options: [
            {
                name: 'amount',
                type: 4, // INTEGER
                description: 'ระดับเสียง 0 - 150 (ปล่อยว่างเพื่อดูระดับเสียงปัจจุบัน)',
                required: false,
            }
        ]
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        const amount = interaction.options.getInteger('amount');
        if (amount === null) {
            const currentVolume = player ? player.volume : settingsManager.getGuildVolume(interaction.guild.id);
            embed.setDescription(`🔊 ระดับเสียงปัจจุบันของเซิร์ฟเวอร์นี้คือ **${currentVolume}%** ค่ะ 💕\n*(พิมพ์ \`/gvolume <0-150>\` เพื่อเปลี่ยนและบันทึกค่า)*`);
            return interaction.reply({ embeds: [embed] });
        }

        let volume = amount;
        if (volume < 0) volume = 0;
        if (volume > 150) volume = 150; // กันคนปรับเสียงดังเกินไปจนลำโพงแตก

        settingsManager.setGuildVolume(interaction.guild.id, volume);

        if (player) {
            player.setVolume(volume);
            if (player.nowPlayingMessage && player.queue?.current) {
                try {
                    const { createNowPlayingCard } = require('../src/helpers/musicCardHelper');
                    const cardData = createNowPlayingCard(player, player.queue.current);
                    await player.nowPlayingMessage.edit(cardData).catch(() => {});
                } catch {}
            }
        }

        if (volume > 100) {
            embed.setDescription(`🔊 อื้อหือ! จัดหนักจัดเต็ม ปรับและบันทึกระดับเสียงเป็น **${volume}%** แล้วค่ะ หูดับแน่นอน 🔥💋`);
        } else if (volume === 0) {
            embed.setDescription(`🔇 จุ๊ๆ! ปิดเสียงเป็น **0%** แล้วค่ะ แอบฟังอะไรกันอยู่เนี่ย 🤭`);
        } else {
            embed.setDescription(`🔊 รับทราบค่ะ! ดีเจปรับและบันทึกระดับเสียงเป็น **${volume}%** ให้พอดีหูแล้วน้า (ระบบจำค่านี้ไว้ใช้ตลอดค่ะ) 🎧💕`);
        }

        return interaction.reply({ embeds: [embed] });
    }
};
