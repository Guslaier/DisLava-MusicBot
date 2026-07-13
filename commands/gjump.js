const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gjump',
        description: 'ดันเพลงในคิวขึ้นมาเล่นเป็นเพลงต่อไป (แซงคิว)',
        options: [
            {
                name: 'position',
                type: 4, // INTEGER
                description: 'ลำดับของเพลงในคิวที่ต้องการแซงคิว',
                required: true,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const position = interaction.options.getInteger('position');
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่เลยค่ะ จะให้แซงคิวใครเอ่ย? 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (player.queue.length === 0) {
            embed.setDescription('❌ คิวเพลงว่างเปล่าค่ะ ไม่มีใครให้แซงน้า~!');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (position < 1 || position > player.queue.length) {
            embed.setDescription(`❌ เอ๊ะ! ระบุลำดับคิวผิดรึเปล่าคะ ต้องอยู่ระหว่าง 1 ถึง ${player.queue.length} นะคะ 🧐`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ดึงเพลงออกจากคิวตามตำแหน่ง (index คือ position - 1) และยัดกลับเข้าไปข้างบนสุด
        const trackToJump = player.queue.splice(position - 1, 1)[0];
        player.queue.unshift(trackToJump);

        embed.setDescription(`⬆️ วีไอพีสุดๆ! ดันเพลง **${trackToJump.title}** แซงคิวขึ้นมาเป็นเพลงต่อไปให้แล้วค่ะ 💅✨`);
        return interaction.reply({ embeds: [embed] });
    }
};
