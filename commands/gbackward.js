const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { formatDuration } = require('../src/helpers/musicCardHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gbackward')
        .setDescription('กรอย้อนกลับตามจำนวนวินาทีที่ต้องการ')
        .addIntegerOption(opt =>
            opt.setName('seconds')
                .setDescription('จำนวนวินาทีที่ต้องการกรอย้อนกลับ (เช่น 10, 30)')
                .setRequired(true)
                .setMinValue(1)
        ),

    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing || !player.queue.current) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ! จะให้ดีเจกรอย้อนอะไรเอ่ย 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const track = player.queue.current;
        if (track.isStream) {
            embed.setDescription('❌ ไม่สามารถกรอเพลงที่เป็น Live Stream สดได้ค่ะ 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const seconds = interaction.options.getInteger('seconds');
        const currentPos = player.position || 0;
        const newPos = Math.max(0, currentPos - (seconds * 1000));

        await player.seek(newPos);
        embed.setDescription(`⏪ ถอยหลังนิดนึง! กรอย้อนกลับไป **${seconds} วินาที** (ตอนนี้อยู่ที่ \`${formatDuration(newPos)}\`) 🎧✨`);
        return interaction.reply({ embeds: [embed] });
    }
};

