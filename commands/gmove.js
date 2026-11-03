const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gmove')
        .setDescription('ย้ายตำแหน่งเพลงในคิว')
        .addIntegerOption(opt =>
            opt.setName('from')
                .setDescription('ลำดับเพลงปัจจุบันในคิวที่ต้องการย้าย')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption(opt =>
            opt.setName('to')
                .setDescription('ตำแหน่งใหม่ที่ต้องการนำไปวาง')
                .setRequired(true)
                .setMinValue(1)
        ),

    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || player.queue.length === 0) {
            embed.setDescription('❌ ไม่มีเพลงในคิวให้ย้ายเลยค่ะ ตอนนี้คิวว่างเปล่า 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const fromPos = interaction.options.getInteger('from');
        const toPos = interaction.options.getInteger('to');

        if (fromPos > player.queue.length || toPos > player.queue.length) {
            embed.setDescription(`❌ ลำดับไม่ถูกต้องค่ะ! ตอนนี้ในคิวมีเพลงรออยู่ **${player.queue.length}** เพลง`);
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (fromPos === toPos) {
            embed.setDescription('❌ ตำแหน่งเดิมกับตำแหน่งใหม่เป็นที่เดียวกันค่ะ ไม่ต้องย้ายน้า~ 😅');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const track = player.queue[fromPos - 1];
        player.queue.splice(fromPos - 1, 1);
        player.queue.splice(toPos - 1, 0, track);

        embed.setDescription(`🔀 ดีเจจัดให้! ย้ายเพลง **[${track.title}](${track.uri})** จากลำดับที่ **${fromPos}** ไปยังลำดับที่ **${toPos}** เรียบร้อยค่ะ 💃✨`);
        return interaction.reply({ embeds: [embed] });
    }
};

