const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gremove',
        description: 'ลบเพลงออกจากคิวตามตำแหน่ง',
        options: [
            {
                name: 'position',
                type: 4, // INTEGER
                description: 'ลำดับคิวของเพลงที่ต้องการลบ',
                required: true,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const position = interaction.options.getInteger('position');
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! จะให้ดีเจลบอะไรเอ่ย? 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (position < 1 || position > player.queue.length) {
            embed.setDescription(`❌ เอ๊ะๆ! ระบุลำดับคิวผิดรึเปล่าคะ ในคิวมีแค่ ${player.queue.length} เพลงเองน้า~ 🧐`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const removedTrack = player.queue.splice(position - 1, 1)[0];
        embed.setDescription(`🗑️ ชึบ! ลบเพลง **${removedTrack.title}** ออกจากคิวให้แล้วค่ะ ตามใจคนฟังสุดๆ ✂️💕`);
        return interaction.reply({ embeds: [embed] });
    }
};
