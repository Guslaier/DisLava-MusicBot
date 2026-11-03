const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { formatDuration } = require('../src/helpers/musicCardHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gforward')
        .setDescription('กรอเพลงเดินหน้าตามจำนวนวินาทีที่ต้องการ')
        .addIntegerOption(opt =>
            opt.setName('seconds')
                .setDescription('จำนวนวินาทีที่ต้องการกรอไปข้างหน้า (เช่น 10, 30)')
                .setRequired(true)
                .setMinValue(1)
        ),

    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing || !player.queue.current) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ! จะให้ดีเจกรออะไรเอ่ย 😅');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const track = player.queue.current;
        if (track.isStream) {
            embed.setDescription('❌ ไม่สามารถกรอเพลงที่เป็น Live Stream สดได้ค่ะ 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const seconds = interaction.options.getInteger('seconds');
        const currentPos = player.position || 0;
        const newPos = currentPos + (seconds * 1000);
        const maxDuration = track.length || 0;

        if (maxDuration > 0 && newPos >= maxDuration) {
            embed.setDescription(`❌ กรอเกินความยาวเพลงไม่ได้ค่ะ! เพลงนี้ยาวแค่ \`${formatDuration(maxDuration)}\``);
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        await player.seek(newPos);
        embed.setDescription(`⏩ เร่งสปีด! กรอเดินหน้าไป **${seconds} วินาที** (ตอนนี้อยู่ที่ \`${formatDuration(newPos)}\`) 🎧✨`);
        return interaction.reply({ embeds: [embed] });
    }
};

